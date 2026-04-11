// MODIFIED: 2026-04-11 — add agent_name/agent_version to token issuance,
//   propagate to spend log, add GET /audit fraud dashboard endpoint
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/providers');
const idempotencyMiddleware = require('../middleware/idempotency');
const { createLedgerEntry, updateGroupBalance } = require('../utils/ledger');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function verifyAdminKey(req, res, next) {
  if (req.headers.authorization !== 'Bearer ' + process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
}

function computeRulesHash(rulesObj) {
  const sorted = Object.keys(rulesObj).sort().reduce((acc, k) => {
    acc[k] = rulesObj[k];
    return acc;
  }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function computeTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY RATE TRACKER
// ─────────────────────────────────────────────────────────────

const rateMap = new Map();

function getRateEntry(groupId) {
  const now = Date.now();
  let entry = rateMap.get(groupId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60000 };
    rateMap.set(groupId, entry);
  }
  entry.count += 1;
  return entry;
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: verifyAgentToken
// ─────────────────────────────────────────────────────────────

async function verifyAgentToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.AGENT_JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const tokenHash = computeTokenHash(token);

  const { data: record, error } = await supabase
    .from('agent_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();

  if (error || !record) return res.status(401).json({ error: 'Token not registered' });
  if (record.revoked) return res.status(401).json({ error: 'Token revoked' });
  if (new Date(record.expires_at) < new Date()) return res.status(401).json({ error: 'Token expired' });

  req.agentGroupId = record.group_id;
  req.agentRulesHash = record.rules_hash;
  req.agentTokenHash = tokenHash;
  req.agentName = record.agent_name;
  req.agentVersion = record.agent_version;
  next();
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: checkAgentRules
// ─────────────────────────────────────────────────────────────

async function checkAgentRules(req, res, next) {
  const { data: rules, error } = await supabase
    .from('agent_rules')
    .select('*')
    .eq('group_id', req.agentGroupId)
    .single();

  if (error || !rules) {
    return res.status(403).json({ error: 'No rules configured for this group' });
  }

  const amount_cents = Math.round(req.body.amount * 100);

  // CHECK 1 — per transaction cap
  if (rules.max_per_txn && amount_cents > rules.max_per_txn) {
    await supabase.from('agent_spend_log').insert({
      group_id: req.agentGroupId,
      token_hash: req.agentTokenHash,
      amount: amount_cents,
      merchant_name: req.body.merchant_name || null,
      mcc: req.body.mcc || null,
      memo: req.body.memo || null,
      status: 'blocked',
      block_reason: 'per_txn_cap',
      agent_name: req.agentName || null,
      agent_version: req.agentVersion || null
    });
    await supabase.from('anomaly_log').insert({
      group_id: req.agentGroupId,
      event_type: 'rule_breach',
      payload: { reason: 'per_txn_cap' },
      source_ip: req.ip,
      resolved: false
    });
    return res.status(403).json({ error: 'Exceeds per-transaction cap', cap: rules.max_per_txn / 100 });
  }

  // CHECK 2 — daily cap
  if (rules.daily_spend_cap) {
    const todayStart = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
    const { data: dailyRows } = await supabase
      .from('agent_spend_log')
      .select('amount')
      .eq('group_id', req.agentGroupId)
      .eq('status', 'approved')
      .gte('created_at', todayStart);

    const todaySum = (dailyRows || []).reduce((sum, r) => sum + Number(r.amount), 0);

    if (todaySum + amount_cents > rules.daily_spend_cap) {
      await supabase.from('agent_spend_log').insert({
        group_id: req.agentGroupId,
        token_hash: req.agentTokenHash,
        amount: amount_cents,
        merchant_name: req.body.merchant_name || null,
        mcc: req.body.mcc || null,
        memo: req.body.memo || null,
        status: 'blocked',
        block_reason: 'daily_cap',
        agent_name: req.agentName || null,
        agent_version: req.agentVersion || null
      });
      await supabase.from('anomaly_log').insert({
        group_id: req.agentGroupId,
        event_type: 'rule_breach',
        payload: { reason: 'daily_cap' },
        source_ip: req.ip,
        resolved: false
      });
      return res.status(403).json({ error: 'Daily spend cap reached', cap: rules.daily_spend_cap / 100 });
    }
  }

  // CHECK 3 — MCC allowlist
  if (rules.allowlist_mcc && rules.allowlist_mcc.length > 0 && req.body.mcc) {
    if (!rules.allowlist_mcc.includes(req.body.mcc)) {
      await supabase.from('agent_spend_log').insert({
        group_id: req.agentGroupId,
        token_hash: req.agentTokenHash,
        amount: amount_cents,
        merchant_name: req.body.merchant_name || null,
        mcc: req.body.mcc || null,
        memo: req.body.memo || null,
        status: 'blocked',
        block_reason: 'mcc_blocked',
        agent_name: req.agentName || null,
        agent_version: req.agentVersion || null
      });
      return res.status(403).json({ error: 'MCC not in allowlist' });
    }
  }

  req.agentRules = rules;
  next();
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: anomalyDetection
// ─────────────────────────────────────────────────────────────

async function anomalyDetection(req, res, next) {
  // RATE CHECK
  const rateEntry = getRateEntry(req.agentGroupId);
  if (rateEntry.count > 10) {
    req.anomalyFlag = true;
    req.anomalyReason = 'rate_spike';
    await supabase.from('anomaly_log').insert({
      group_id: req.agentGroupId,
      event_type: 'rate_spike',
      source_ip: req.ip,
      payload: { count: rateEntry.count },
      resolved: false
    });
  }

  // IP CHECK
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await supabase
    .from('anomaly_log')
    .select('source_ip')
    .eq('group_id', req.agentGroupId)
    .gte('created_at', sevenDaysAgo);

  const knownIps = new Set((recentLogs || []).map(r => r.source_ip).filter(Boolean));

  if (!knownIps.has(req.ip)) {
    req.anomalyFlag = req.anomalyFlag || true;
    await supabase.from('anomaly_log').insert({
      group_id: req.agentGroupId,
      event_type: 'new_ip',
      source_ip: req.ip,
      payload: { ip: req.ip },
      resolved: false
    });
  }

  next();
}

// ─────────────────────────────────────────────────────────────
// POST /api/agent/rules
// ─────────────────────────────────────────────────────────────

router.post('/rules', verifyAdminKey, async (req, res) => {
  try {
    const { group_id, daily_spend_cap, max_per_txn, allowlist_mcc, quorum_required } = req.body;

    if (!group_id) return res.status(400).json({ error: 'group_id is required' });

    const daily_spend_cap_cents = daily_spend_cap != null ? Math.round(daily_spend_cap * 100) : null;
    const max_per_txn_cents = max_per_txn != null ? Math.round(max_per_txn * 100) : null;

    const rulesForHash = {
      group_id,
      daily_spend_cap: daily_spend_cap_cents,
      max_per_txn: max_per_txn_cents,
      allowlist_mcc: allowlist_mcc || [],
      quorum_required: quorum_required || 1
    };
    const rules_hash = computeRulesHash(rulesForHash);

    const { data, error } = await supabase
      .from('agent_rules')
      .upsert({
        group_id,
        daily_spend_cap: daily_spend_cap_cents,
        max_per_txn: max_per_txn_cents,
        allowlist_mcc: allowlist_mcc || [],
        quorum_required: quorum_required || 1,
        rules_hash,
        updated_at: new Date().toISOString()
      }, { onConflict: 'group_id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      rule_id: data.id,
      group_id: data.group_id,
      rules_hash: data.rules_hash,
      daily_spend_cap_cents: data.daily_spend_cap,
      max_per_txn_cents: data.max_per_txn
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/token
// ─────────────────────────────────────────────────────────────

router.post('/token', verifyAdminKey, async (req, res) => {
  try {
    const { group_id, agent_name, agent_version = 'v1' } = req.body;

    if (!group_id) return res.status(400).json({ error: 'group_id is required' });
    if (!agent_name) return res.status(400).json({ error: 'agent_name is required' });

    const { data: rules, error: rulesError } = await supabase
      .from('agent_rules')
      .select('*')
      .eq('group_id', group_id)
      .single();

    if (rulesError || !rules) return res.status(404).json({ error: 'No rules found for this group' });

    const token = jwt.sign(
      { group_id, rules_hash: rules.rules_hash, type: 'agent' },
      process.env.AGENT_JWT_SECRET,
      { expiresIn: '1h' }
    );

    const token_hash = computeTokenHash(token);
    const expires_at = new Date(Date.now() + 3600000).toISOString();

    const { error: insertError } = await supabase
      .from('agent_tokens')
      .insert({
        group_id,
        token_hash,
        rules_hash: rules.rules_hash,
        expires_at,
        agent_name,
        agent_version
      });

    if (insertError) return res.status(500).json({ error: insertError.message });

    return res.json({ token, expires_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/pay
// ─────────────────────────────────────────────────────────────

router.post(
  '/pay',
  idempotencyMiddleware,
  verifyAgentToken,
  checkAgentRules,
  anomalyDetection,
  async (req, res) => {
    try {
      const { amount, merchant_name, mcc, memo } = req.body;
      const amount_cents = Math.round(amount * 100);

      // 1. Fetch group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', req.agentGroupId)
        .single();

      if (groupError || !group) return res.status(404).json({ error: 'Group not found' });

      // 2. Balance check
      if (Number(group.total_balance) < amount_cents) {
        return res.status(402).json({ error: 'Insufficient balance' });
      }

      // 3. Determine provider
      let provider;
      if (process.env.PROVIDER_STRIPE === 'true') {
        provider = 'stripe';
      } else if ((process.env.PROVIDER_ISSUING || 'lithic') === 'lithic') {
        provider = 'lithic';
      } else if ((process.env.PROVIDER_BANK_RAILS || 'modern_treasury') === 'modern_treasury') {
        provider = 'modern_treasury';
      } else {
        provider = 'paytheory';
      }

      // 4. Provider dispatch
      let provider_ref;

      if (provider === 'lithic') {
        if (!group.card_token) return res.status(400).json({ error: 'Group has no Lithic card' });
        const { lithic } = require('../config/providers');
        await lithic.cards.retrieve(group.card_token);
        provider_ref = group.card_token + '_agent_' + Date.now();

      } else if (provider === 'modern_treasury') {
        const { modernTreasuryClient } = require('../config/providers');
        const mtResp = await modernTreasuryClient.post('/payment_orders', {
          amount: amount_cents,
          direction: 'debit',
          currency: 'USD',
          description: memo || 'Agent payment'
        });
        provider_ref = mtResp.data.id;

      } else if (provider === 'paytheory') {
        const { payTheoryClient } = require('../config/providers');
        const ptResp = await payTheoryClient.post('/charges', {
          amount: amount_cents,
          description: memo || 'Agent payment'
        });
        provider_ref = ptResp.data.id;

      } else if (provider === 'stripe') {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const pi = await stripe.paymentIntents.create({
          amount: amount_cents,
          currency: 'usd',
          metadata: { group_id: req.agentGroupId, memo: memo || '', token_hash: req.agentTokenHash }
        });
        provider_ref = pi.id;
      }

      // 5. Insert transaction
      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
          group_id: req.agentGroupId,
          user_id: '00000000-0000-0000-0000-000000000000',
          type: 'agent_payment',
          amount: amount_cents,
          description: memo || 'Agent payment',
          status: 'completed',
          merchant_name: merchant_name || null,
          mcc: mcc || null,
          payment_method: provider,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (txError) return res.status(500).json({ error: txError.message });

      // 6. Ledger entry
      await createLedgerEntry({
        transaction_id: transaction.id,
        debit_account: 'expenses',
        credit_account: 'cash',
        amount: amount_cents
      });

      // 7. Update group balance
      await updateGroupBalance(req.agentGroupId);

      // 8. Agent spend log
      await supabase.from('agent_spend_log').insert({
        group_id: req.agentGroupId,
        token_hash: req.agentTokenHash,
        amount: amount_cents,
        merchant_name: merchant_name || null,
        mcc: mcc || null,
        memo: memo || null,
        status: 'approved',
        provider,
        anomaly_flag: req.anomalyFlag || false,
        agent_name: req.agentName || null,
        agent_version: req.agentVersion || null
      });

      return res.json({
        approved: true,
        amount_dollars: amount_cents / 100,
        provider,
        provider_ref,
        transaction_id: transaction.id,
        anomaly_flagged: req.anomalyFlag || false
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/agent/spend-log
// ─────────────────────────────────────────────────────────────

router.post('/spend-log', verifyAdminKey, async (req, res) => {
  try {
    const { group_id, limit = 50, offset = 0 } = req.body;
    if (!group_id) return res.status(400).json({ error: 'group_id is required' });

    const { data, error, count } = await supabase
      .from('agent_spend_log')
      .select('*', { count: 'exact' })
      .eq('group_id', group_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    const mapped = (data || []).map(row => ({
      ...row,
      agent_name: row.agent_name || null,
      agent_version: row.agent_version || null,
      amount_dollars: Number(row.amount) / 100
    }));

    return res.json({ data: mapped, total_count: count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/revoke
// ─────────────────────────────────────────────────────────────

router.post('/revoke', verifyAdminKey, async (req, res) => {
  try {
    const { token_hash } = req.body;
    if (!token_hash) return res.status(400).json({ error: 'token_hash is required' });

    const { error } = await supabase
      .from('agent_tokens')
      .update({ revoked: true })
      .eq('token_hash', token_hash);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ revoked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/agent/audit?group_id=xxx
// ─────────────────────────────────────────────────────────────

router.get('/audit', verifyAdminKey, async (req, res) => {
  try {
    const { group_id } = req.query;
    if (!group_id) return res.status(400).json({ error: 'group_id is required' });

    const { data: rows, error } = await supabase
      .from('agent_spend_log')
      .select('agent_name, agent_version, amount, status, anomaly_flag, created_at')
      .eq('group_id', group_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Group by agent_name in JS
    const agentMap = new Map();

    for (const row of rows || []) {
      const name = row.agent_name || '(unknown)';
      if (!agentMap.has(name)) {
        agentMap.set(name, {
          agent_name: name,
          agent_version: row.agent_version || null,
          total_spent_cents: 0,
          transaction_count: 0,
          blocked_count: 0,
          anomaly_count: 0,
          last_seen: row.created_at
        });
      }

      const entry = agentMap.get(name);

      // Keep the most recent agent_version seen
      if (row.created_at >= entry.last_seen) {
        entry.last_seen = row.created_at;
        entry.agent_version = row.agent_version || entry.agent_version;
      }

      if (row.status === 'approved') {
        entry.total_spent_cents += Number(row.amount);
        entry.transaction_count += 1;
      }

      if (row.status === 'blocked') {
        entry.blocked_count += 1;
      }

      if (row.anomaly_flag === true) {
        entry.anomaly_count += 1;
      }
    }

    const result = Array.from(agentMap.values())
      .map(entry => ({
        agent_name: entry.agent_name,
        agent_version: entry.agent_version,
        total_spent_dollars: entry.total_spent_cents / 100,
        transaction_count: entry.transaction_count,
        blocked_count: entry.blocked_count,
        anomaly_count: entry.anomaly_count,
        last_seen: entry.last_seen,
        flagged: entry.blocked_count > 2 || entry.anomaly_count > 1
      }))
      .sort((a, b) => (b.last_seen > a.last_seen ? 1 : -1));

    return res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
