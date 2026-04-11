// NEW FILE: 2026-04-11 — Agent autonomous payment route
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
      block_reason: 'per_txn_cap'
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
    const { data: dailyRows, error: dailyError } = await supabase
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
        block_reason: 'daily_cap'
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
        block_reason: 'mcc_blocked'
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
    const { group_id } = req.body;
    if (!group_id) return res.status(400).json({ error: 'group_id is required' });

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
      .insert({ group_id, token_hash, rules_hash: rules.rules_hash, expires_at });

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
        anomaly_flag: req.anomalyFlag || false
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

module.exports = router;
