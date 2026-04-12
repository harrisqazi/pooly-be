// MODIFIED: 2026-04-11 — complete rewrite for new schema:
//   agent_rules removed; limits from cards.spending_limits;
//   group_id → card_id; profile_id used throughout;
//   new endpoints: /register /kyc/approve /kyc/suspend /list /risk
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/providers');
const idempotencyMiddleware = require('../middleware/idempotency');
const { createLedgerEntry, updateCardBalance } = require('../utils/ledger');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function verifyAdminKey(req, res, next) {
  if (req.headers.authorization !== 'Bearer ' + process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
}

function computeRulesHash(obj) {
  const sorted = Object.keys(obj).sort().reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});
  return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function computeTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY RATE TRACKER
// ─────────────────────────────────────────────────────────────

const rateMap = new Map();

function checkRate(profileId) {
  const now = Date.now();
  const entry = rateMap.get(profileId) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60000;
  }
  entry.count++;
  rateMap.set(profileId, entry);
  return entry.count > 10;
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: verifyAgentToken
// ─────────────────────────────────────────────────────────────

async function verifyAgentToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.AGENT_JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { profile_id, card_id } = payload;
  const token_hash = computeTokenHash(token);

  const { data: tokenRecord } = await supabase
    .from('agent_tokens')
    .select('*')
    .eq('token_hash', token_hash)
    .single();

  if (!tokenRecord) return res.status(401).json({ error: 'Token not registered' });
  if (tokenRecord.revoked) return res.status(401).json({ error: 'Token revoked' });
  if (new Date(tokenRecord.expires_at) < new Date()) return res.status(401).json({ error: 'Token expired' });

  if (req.ip !== tokenRecord.issued_from_ip) {
    req.anomalyFlag = true;
    await supabase.from('anomaly_log').insert({
      event_type: 'ip_mismatch',
      severity: 'medium',
      score: 60,
      profile_id,
      card_id,
      source_ip: req.ip,
      payload: { issued_ip: tokenRecord.issued_from_ip, current_ip: req.ip }
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profile_id)
    .single();

  if (!profile || profile.status !== 'active') return res.status(401).json({ error: 'Profile suspended' });
  if (profile.kyc_status !== 'approved') return res.status(401).json({ error: 'Agent not KYC approved' });

  req.agentProfileId = profile.id;
  req.agentCardId = card_id;
  req.agentProfile = profile;
  req.agentTokenHash = token_hash;
  next();
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: checkAgentRules (reads from cards.spending_limits)
// ─────────────────────────────────────────────────────────────

async function checkAgentRules(req, res, next) {
  const { data: card } = await supabase
    .from('cards')
    .select('*')
    .eq('id', req.agentCardId)
    .single();

  if (!card) return res.status(404).json({ error: 'Card not found' });

  const amount_cents = Math.round(req.body.amount * 100);
  const limits = card.spending_limits || {};
  const daily_cap = limits.daily_cap || 0;
  const max_per_txn = limits.max_per_txn || 0;

  if (max_per_txn > 0 && amount_cents > max_per_txn) {
    await supabase.from('agent_spend_log').insert({
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      token_hash: req.agentTokenHash,
      amount: amount_cents,
      merchant_name: req.body.merchant_name || null,
      mcc: req.body.mcc || null,
      memo: req.body.memo || null,
      status: 'blocked',
      block_reason: 'per_txn_cap'
    });
    await supabase.from('anomaly_log').insert({
      event_type: 'rule_breach',
      severity: 'high',
      score: 75,
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      payload: { reason: 'per_txn_cap', amount_cents }
    });
    return res.status(403).json({ error: 'Exceeds per-transaction cap', cap_dollars: max_per_txn / 100 });
  }

  if (daily_cap > 0) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayRows } = await supabase
      .from('agent_spend_log')
      .select('amount')
      .eq('profile_id', req.agentProfileId)
      .eq('status', 'approved')
      .gte('created_at', todayStart.toISOString());

    const todayTotal = (todayRows || []).reduce((sum, r) => sum + Number(r.amount), 0);

    if (todayTotal + amount_cents > daily_cap) {
      await supabase.from('agent_spend_log').insert({
        profile_id: req.agentProfileId,
        card_id: req.agentCardId,
        token_hash: req.agentTokenHash,
        amount: amount_cents,
        merchant_name: req.body.merchant_name || null,
        mcc: req.body.mcc || null,
        memo: req.body.memo || null,
        status: 'blocked',
        block_reason: 'daily_cap'
      });
      await supabase.from('anomaly_log').insert({
        event_type: 'rule_breach',
        severity: 'high',
        score: 75,
        profile_id: req.agentProfileId,
        card_id: req.agentCardId,
        payload: { reason: 'daily_cap', amount_cents }
      });
      return res.status(403).json({ error: 'Daily spend cap reached', cap_dollars: daily_cap / 100 });
    }
  }

  if (card.blocked_mcc?.includes(req.body.mcc)) {
    await supabase.from('agent_spend_log').insert({
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      token_hash: req.agentTokenHash,
      amount: amount_cents,
      merchant_name: req.body.merchant_name || null,
      mcc: req.body.mcc || null,
      memo: req.body.memo || null,
      status: 'blocked',
      block_reason: 'mcc_blocked'
    });
    return res.status(403).json({ error: 'MCC not allowed' });
  }

  req.agentCard = card;
  next();
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE: anomalyDetection
// ─────────────────────────────────────────────────────────────

async function anomalyDetection(req, res, next) {
  const isSpike = checkRate(req.agentProfileId);
  if (isSpike) {
    req.anomalyFlag = true;
    await supabase.from('anomaly_log').insert({
      event_type: 'rate_spike',
      severity: 'medium',
      score: 60,
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      source_ip: req.ip
    });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await supabase
    .from('anomaly_log')
    .select('source_ip')
    .eq('profile_id', req.agentProfileId)
    .gte('created_at', sevenDaysAgo);

  const knownIPs = (recentLogs || []).map(r => r.source_ip).filter(Boolean);
  if (!knownIPs.includes(req.ip)) {
    req.anomalyFlag = true;
    await supabase.from('anomaly_log').insert({
      event_type: 'new_ip',
      severity: 'medium',
      score: 40,
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      source_ip: req.ip,
      payload: { ip: req.ip }
    });
  }

  next();
}

// ─────────────────────────────────────────────────────────────
// POST /api/agent/register
// ─────────────────────────────────────────────────────────────

router.post('/register', verifyAdminKey, async (req, res) => {
  try {
    const { card_id, agent_name, model_name, model_version, system_prompt, owner_auth_id } = req.body;
    if (!card_id || !agent_name || !model_name || !system_prompt || !owner_auth_id) {
      return res.status(400).json({ error: 'card_id, agent_name, model_name, system_prompt, owner_auth_id required' });
    }

    const { data: owner } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_id', owner_auth_id)
      .single();

    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const system_prompt_hash = crypto.createHash('sha256').update(system_prompt).digest('hex');

    const fingerprint = crypto.createHash('sha256')
      .update(model_name + (model_version || '') + system_prompt_hash + owner.id)
      .digest('hex');

    const { data: existingKyc } = await supabase
      .from('kyc_details')
      .select('profile_id')
      .eq('fingerprint', fingerprint)
      .single();

    if (existingKyc) {
      return res.json({ profile_id: existingKyc.profile_id, existing: true });
    }

    const { data: agentProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        type: 'agent',
        first_name: agent_name,
        model_name,
        model_version: model_version || null,
        system_prompt_hash,
        owner_id: owner.id,
        kyc_status: 'pending',
        status: 'active',
        current_ip: req.ip
      })
      .select()
      .single();

    if (profileError) return res.status(500).json({ error: profileError.message });

    await supabase.from('kyc_details').insert({
      profile_id: agentProfile.id,
      fingerprint,
      intended_use: 'autonomous payment agent',
      risk_level: 'medium'
    });

    // Add agent to card members
    const { data: currentCard } = await supabase
      .from('cards')
      .select('members')
      .eq('id', card_id)
      .single();

    const currentMembers = Array.isArray(currentCard?.members)
      ? currentCard.members
      : [];

    if (!currentMembers.includes(agentProfile.id)) {
      currentMembers.push(agentProfile.id);
    }

    const { error: memberError } = await supabase
      .from('cards')
      .update({ members: currentMembers })
      .eq('id', card_id);

    if (memberError) {
      console.error('Failed to add agent to card members:', memberError);
    }

    return res.json({ profile_id: agentProfile.id, fingerprint, kyc_status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/kyc/approve
// ─────────────────────────────────────────────────────────────

router.post('/kyc/approve', verifyAdminKey, async (req, res) => {
  try {
    const { profile_id, risk_level, notes } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id is required' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('type')
      .eq('id', profile_id)
      .single();

    if (!profile || profile.type !== 'agent') {
      return res.status(400).json({ error: 'Profile is not an agent' });
    }

    await supabase.from('profiles').update({
      kyc_status: 'approved',
      kyc_approved_at: new Date().toISOString()
    }).eq('id', profile_id);

    await supabase.from('kyc_details').update({
      risk_level: risk_level || 'medium',
      reviewed_at: new Date().toISOString()
    }).eq('profile_id', profile_id);

    res.json({ approved: true, profile_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/kyc/suspend
// ─────────────────────────────────────────────────────────────

router.post('/kyc/suspend', verifyAdminKey, async (req, res) => {
  try {
    const { profile_id, reason } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id is required' });

    await supabase.from('profiles').update({
      status: 'suspended',
      kyc_status: 'suspended',
      suspension_reason: reason || null
    }).eq('id', profile_id);

    await supabase.from('agent_tokens').update({ revoked: true }).eq('profile_id', profile_id);

    await supabase.from('anomaly_log').insert({
      event_type: 'agent_suspended',
      severity: 'high',
      score: 100,
      profile_id,
      payload: { reason: reason || null }
    });

    res.json({ suspended: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/token
// ─────────────────────────────────────────────────────────────

router.post('/token', verifyAdminKey, async (req, res) => {
  try {
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id is required' });

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', profile_id).single();
    if (!profile || profile.type !== 'agent') return res.status(403).json({ error: 'Profile is not an agent' });
    if (profile.kyc_status !== 'approved') return res.status(403).json({ error: 'Agent not KYC approved' });
    if (profile.status !== 'active') return res.status(403).json({ error: 'Agent is not active' });

    const { data: card } = await supabase
      .from('cards')
      .select('*')
      .filter('members', 'cs', JSON.stringify([profile_id]))
      .single();

    if (!card) return res.status(404).json({ error: 'No card found for agent' });

    const token = jwt.sign(
      { profile_id, card_id: card.id, type: 'agent' },
      process.env.AGENT_JWT_SECRET,
      { expiresIn: '1h' }
    );

    const token_hash = computeTokenHash(token);
    const expires_at = new Date(Date.now() + 3600000).toISOString();

    await supabase.from('agent_tokens').insert({
      profile_id,
      card_id: card.id,
      token_hash,
      expires_at,
      rules_hash: computeRulesHash(card.spending_limits || {}),
      issued_from_ip: req.ip,
      revoked: false
    });

    return res.json({ token, expires_at, profile_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/pay
// ─────────────────────────────────────────────────────────────

router.post('/pay', idempotencyMiddleware, verifyAgentToken, checkAgentRules, anomalyDetection, async (req, res) => {
  try {
    const amount_cents = Math.round(req.body.amount * 100);
    const card = req.agentCard;

    if (Number(card.total_balance) < amount_cents) {
      return res.status(402).json({ error: 'Insufficient balance' });
    }

    let provider = 'paytheory';
    if (process.env.PROVIDER_STRIPE === 'true') provider = 'stripe';
    else if (process.env.PROVIDER_ISSUING === 'lithic') provider = 'lithic';
    else if (process.env.PROVIDER_BANK_RAILS === 'modern_treasury') provider = 'modern_treasury';

    let provider_ref;

    if (provider === 'lithic') {
      if (!card.card_token) return res.status(400).json({ error: 'Card has no Lithic card token' });
      const { lithic } = require('../config/providers');
      await lithic.cards.retrieve(card.card_token);
      provider_ref = card.card_token + '_agent_' + Date.now();

    } else if (provider === 'modern_treasury') {
      const { modernTreasuryClient } = require('../config/providers');
      const mtResp = await modernTreasuryClient.post('/payment_orders', {
        amount: amount_cents,
        direction: 'debit',
        currency: 'USD',
        description: req.body.memo || 'Agent payment'
      });
      provider_ref = mtResp.data.id;

    } else if (provider === 'paytheory') {
      const { payTheoryClient } = require('../config/providers');
      const ptResp = await payTheoryClient.post('/charges', {
        amount: amount_cents,
        description: req.body.memo || 'Agent payment'
      });
      provider_ref = ptResp.data.id;

    } else if (provider === 'stripe') {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const pi = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: 'usd',
        metadata: { card_id: req.agentCardId, memo: req.body.memo || '', token_hash: req.agentTokenHash }
      });
      provider_ref = pi.id;
    }

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        card_id: req.agentCardId,
        profile_id: req.agentProfileId,
        user_id: null,
        type: 'agent_payment',
        amount: amount_cents,
        description: req.body.memo || 'Agent payment',
        status: 'completed',
        merchant_name: req.body.merchant_name || null,
        mcc: req.body.mcc || null,
        payment_method: provider
      })
      .select()
      .single();

    if (txError) return res.status(500).json({ error: txError.message });

    await createLedgerEntry({
      transaction_id: transaction.id,
      debit_account: 'expenses',
      credit_account: 'cash',
      amount: amount_cents
    });

    await updateCardBalance(req.agentCardId);

    await supabase.from('agent_spend_log').insert({
      profile_id: req.agentProfileId,
      card_id: req.agentCardId,
      token_hash: req.agentTokenHash,
      amount: amount_cents,
      merchant_name: req.body.merchant_name || null,
      mcc: req.body.mcc || null,
      memo: req.body.memo || null,
      status: 'approved',
      provider,
      anomaly_flag: req.anomalyFlag || false
    });

    await supabase.from('profiles').update({
      last_seen: new Date().toISOString(),
      current_ip: req.ip
    }).eq('id', req.agentProfileId);

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
});

// ─────────────────────────────────────────────────────────────
// POST /api/agent/spend-log
// ─────────────────────────────────────────────────────────────

router.post('/spend-log', verifyAdminKey, async (req, res) => {
  try {
    const { card_id, limit = 50, offset = 0 } = req.body;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });

    const { data: rows, error, count } = await supabase
      .from('agent_spend_log')
      .select('*', { count: 'exact' })
      .eq('card_id', card_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    // Enrich with profile + kyc
    const profileIds = [...new Set((rows || []).map(r => r.profile_id).filter(Boolean))];

    const { data: profiles } = profileIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] };

    const { data: kycs } = profileIds.length > 0
      ? await supabase.from('kyc_details').select('*').in('profile_id', profileIds)
      : { data: [] };

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const kycMap = Object.fromEntries((kycs || []).map(k => [k.profile_id, k]));

    const mapped = (rows || []).map(r => {
      const profile = profileMap[r.profile_id] || {};
      const kyc = kycMap[r.profile_id] || {};
      return {
        ...r,
        amount_dollars: Number(r.amount) / 100,
        agent_name: profile.first_name || null,
        model_name: profile.model_name || null,
        fingerprint: kyc.fingerprint || null
      };
    });

    return res.json({ data: mapped, total_count: count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/agent/audit?card_id=xxx
// ─────────────────────────────────────────────────────────────

router.get('/audit', verifyAdminKey, async (req, res) => {
  try {
    const { card_id } = req.query;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });

    const { data: rows, error } = await supabase
      .from('agent_spend_log')
      .select('profile_id, amount, status, anomaly_flag, created_at')
      .eq('card_id', card_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const profileIds = [...new Set((rows || []).map(r => r.profile_id).filter(Boolean))];

    const { data: profiles } = profileIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', profileIds)
      : { data: [] };

    const { data: kycs } = profileIds.length > 0
      ? await supabase.from('kyc_details').select('*').in('profile_id', profileIds)
      : { data: [] };

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const kycMap = Object.fromEntries((kycs || []).map(k => [k.profile_id, k]));

    // Group by profile_id in JS
    const agentMap = new Map();

    for (const row of rows || []) {
      const pid = row.profile_id || '(unknown)';
      if (!agentMap.has(pid)) {
        agentMap.set(pid, {
          profile_id: pid,
          total_spent_cents: 0,
          transaction_count: 0,
          blocked_count: 0,
          anomaly_count: 0,
          last_seen: row.created_at
        });
      }

      const entry = agentMap.get(pid);
      if (row.created_at > entry.last_seen) entry.last_seen = row.created_at;
      if (row.status === 'approved') { entry.total_spent_cents += Number(row.amount); entry.transaction_count++; }
      if (row.status === 'blocked') entry.blocked_count++;
      if (row.anomaly_flag === true) entry.anomaly_count++;
    }

    const result = Array.from(agentMap.values())
      .map(entry => {
        const profile = profileMap[entry.profile_id] || {};
        const kyc = kycMap[entry.profile_id] || {};
        return {
          profile_id: entry.profile_id,
          agent_name: profile.first_name || null,
          model_name: profile.model_name || null,
          model_version: profile.model_version || null,
          fingerprint: kyc.fingerprint || null,
          kyc_status: profile.kyc_status || null,
          risk_level: kyc.risk_level || null,
          total_spent_dollars: entry.total_spent_cents / 100,
          transaction_count: entry.transaction_count,
          blocked_count: entry.blocked_count,
          anomaly_count: entry.anomaly_count,
          last_seen: entry.last_seen,
          flagged: entry.blocked_count > 2 || entry.anomaly_count > 1
        };
      })
      .sort((a, b) => (b.last_seen > a.last_seen ? 1 : -1));

    return res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/agent/list?card_id=xxx
// ─────────────────────────────────────────────────────────────

router.get('/list', verifyAdminKey, async (req, res) => {
  try {
    const { card_id } = req.query;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });

    const { data: card } = await supabase
      .from('cards')
      .select('members')
      .eq('id', card_id)
      .single();

    if (!card) return res.status(404).json({ error: 'Card not found' });

    const memberIds = card.members || [];
    if (memberIds.length === 0) return res.json({ data: [] });

    const { data: agentProfiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('type', 'agent')
      .in('id', memberIds);

    if (error) return res.status(500).json({ error: error.message });

    const agentIds = (agentProfiles || []).map(p => p.id);
    const { data: kycs } = agentIds.length > 0
      ? await supabase.from('kyc_details').select('*').in('profile_id', agentIds)
      : { data: [] };

    const kycMap = Object.fromEntries((kycs || []).map(k => [k.profile_id, k]));

    const result = (agentProfiles || []).map(p => ({
      ...p,
      kyc: kycMap[p.id] || null
    }));

    return res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/agent/risk?card_id=xxx
// ─────────────────────────────────────────────────────────────

router.get('/risk', verifyAdminKey, async (req, res) => {
  try {
    const { card_id } = req.query;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });

    const { data: card } = await supabase
      .from('cards')
      .select('members')
      .eq('id', card_id)
      .single();

    if (!card) return res.status(404).json({ error: 'Card not found' });

    const memberIds = card.members || [];
    if (memberIds.length === 0) return res.json({ data: [] });

    const { data, error } = await supabase
      .from('profile_risk_scores')
      .select('*')
      .in('profile_id', memberIds)
      .order('total_risk_score', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ data: data || [] });
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
