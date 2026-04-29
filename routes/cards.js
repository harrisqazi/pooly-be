// RENAMED: 2026-04-11 — was routes/groups.js; now manages wallet card CRUD
//   against the cards table (new unified schema)
const express = require('express');
const router = express.Router();
const { randomBytes } = require('crypto');
const { supabase } = require('../config/providers');

function normalizeJsonArrayField(raw) {
  let value = raw || [];
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/**
 * List all cards (wallets) the user owns or is a member of
 * GET /api/cards
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .or(`owner_id.eq.${req.user.id},members.cs.["${req.profile.id}"]`)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Members with profile rows (auth UUID for owner checks)
 * GET /api/cards/:id/members
 */
router.get('/:id/members', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ error: 'Card not found' });

    let memberIds = normalizeJsonArrayField(card.members);

    const isMember = memberIds.includes(req.profile.id);
    const isOwner = card.owner_id === req.user.id;
    if (!isMember && !isOwner) {
      return res.status(403).json({ error: 'Not authorized to view this card' });
    }

    // Owner profile UUID is often omitted from legacy `cards.members`; always merge so humans show with agents.
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, auth_id, first_name, last_name, email, type, avatar_url')
      .eq('auth_id', card.owner_id)
      .maybeSingle();

    const ownerProfileId = ownerProfile?.id;
    const idsToFetchSet = new Set(memberIds.filter(Boolean));
    if (ownerProfileId) idsToFetchSet.add(ownerProfileId);

    const idsToFetch = [...idsToFetchSet];
    if (idsToFetch.length === 0) return res.json([]);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, auth_id, first_name, last_name, email, type, avatar_url')
      .in('id', idsToFetch);

    if (profilesError) return res.status(500).json({ error: profilesError.message });

    const adminIds = normalizeJsonArrayField(card.admin_ids);

    const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

    const ordered = [];
    const seen = new Set();
    const pushProfile = (p) => {
      if (!p || seen.has(p.id)) return;
      seen.add(p.id);
      ordered.push(p);
    };

    if (ownerProfileId) pushProfile(byId[ownerProfileId]);
    for (const id of memberIds) {
      pushProfile(byId[id]);
    }

    const payload = ordered.map((p) => ({
      ...p,
      is_owner: !!p.auth_id && p.auth_id === card.owner_id,
      is_admin:
        (!!p.auth_id && p.auth_id === card.owner_id) ||
        adminIds.includes(p.id),
    }));

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get a specific card (wallet)
 * GET /api/cards/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ error: 'Card not found' });

    const members = normalizeJsonArrayField(card.members);
    const isMember = members.includes(req.profile.id);
    const isOwner = card.owner_id === req.user.id;
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized to view this card' });

    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new card (wallet)
 * POST /api/cards
 * Body: { name, card_name, description }
 */
router.post('/', async (req, res) => {
  try {
    const { name, card_name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_id', req.user.id)
      .single();

    const ownerProfileId = ownerProfile?.id || req.user.id;
    const invite_code = randomBytes(6).toString('hex').toUpperCase();

    const { data: newCard, error } = await supabase
      .from('cards')
      .insert({
        name,
        card_name: card_name || name,
        description: description || null,
        owner_id: req.user.id,
        members: [ownerProfileId],
        total_balance: 0,
        approval_threshold: 0,
        spending_limits: { daily_cap: 0, max_per_txn: 0 },
        invite_code,
        group_code: invite_code,
        blocked_mcc: []
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    try {
      const { lithic } = require('../config/providers');
      const lithicCard = await lithic.cards.create({
        type: 'VIRTUAL',
        spend_limit: 500000,
        spend_limit_duration: 'FOREVER'
      });

      await supabase
        .from('cards')
        .update({
          card_token: lithicCard.token,
          card_status: 'OPEN'
        })
        .eq('id', newCard.id);

      newCard.card_token = lithicCard.token;
    } catch (err) {
      console.error('Lithic auto-create failed:', err.message);
    }

    res.status(201).json(newCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Join a card (wallet) by invite code
 * POST /api/cards/join
 * Body: { invite_code }
 */
router.post('/join', async (req, res) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'invite_code is required' });

    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('*')
      .ilike('invite_code', invite_code)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });

    const members = normalizeJsonArrayField(card.members);
    if (members.includes(req.profile.id)) {
      return res.status(400).json({ error: 'Already a member' });
    }

    const updatedMembers = [...members, req.profile.id];

    const { data, error: updateError } = await supabase
      .from('cards')
      .update({ members: JSON.stringify(updatedMembers) })
      .eq('id', card.id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Promote a member to admin (additional admins beyond owner). Requires cards.admin_ids (jsonb).
 * POST /api/cards/:id/admins  Body: { profile_id }
 */
router.post('/:id/admins', async (req, res) => {
  try {
    const profileId = (req.body?.profile_id || '').trim();
    if (!profileId) {
      return res.status(400).json({ error: 'profile_id is required' });
    }

    const { data: card, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ error: 'Card not found' });
    if (card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can add admins' });
    }

    const memberIds = normalizeJsonArrayField(card.members);
    if (!memberIds.includes(profileId)) {
      return res.status(400).json({ error: 'User must be a member before they can be an admin' });
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('auth_id, type')
      .eq('id', profileId)
      .single();

    if (!target) return res.status(404).json({ error: 'Profile not found' });
    if (target.type === 'agent') {
      return res.status(400).json({ error: 'Agents cannot be admins' });
    }

    const { data: ownerProf } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_id', card.owner_id)
      .maybeSingle();

    if (ownerProf?.id === profileId) {
      return res.status(400).json({ error: 'Owner is already an admin' });
    }

    let adminIds = normalizeJsonArrayField(card.admin_ids);

    if (adminIds.includes(profileId)) {
      return res.status(400).json({ error: 'Already an admin' });
    }

    adminIds = [...adminIds, profileId];

    const { data: updated, error: upErr } = await supabase
      .from('cards')
      .update({ admin_ids: adminIds })
      .eq('id', req.params.id)
      .select()
      .single();

    if (upErr) return res.status(500).json({ error: upErr.message });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update card fields (owner only). Used for approval threshold, spending_limits, card image, etc.
 * PUT /api/cards/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('owner_id, spending_limits')
      .eq('id', id)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });
    if (card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can update this card' });
    }

    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };

    if (b.name !== undefined) patch.name = b.name;
    if (b.card_name !== undefined) patch.card_name = b.card_name;
    if (b.description !== undefined) patch.description = b.description;
    if (b.card_image_url !== undefined) patch.card_image_url = b.card_image_url;
    if (b.card_status !== undefined) patch.card_status = b.card_status;
    if (b.approval_threshold !== undefined) {
      patch.approval_threshold = Number(b.approval_threshold);
    }

    if (b.spending_limits !== undefined && typeof b.spending_limits === 'object') {
      patch.spending_limits = {
        ...(typeof card.spending_limits === 'object' && card.spending_limits
          ? card.spending_limits
          : {}),
        ...b.spending_limits,
      };
    }

    const { data: updated, error } = await supabase
      .from('cards')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a card (wallet) — owner only
 * DELETE /api/cards/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const cardId = req.params.id;
    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('owner_id')
      .eq('id', cardId)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });
    if (card.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this card' });

    // Schema-aware cleanup before deleting cards row:
    // - transactions.card_id has NO ACTION
    // - anomaly_log.card_id has NO ACTION
    // Also clear per-transaction dependents that can block transaction deletes.
    const { data: txRows, error: txErr } = await supabase
      .from('transactions')
      .select('id')
      .eq('card_id', cardId);
    if (txErr) return res.status(500).json({ error: txErr.message });
    const txIds = (txRows || []).map((t) => t.id).filter(Boolean);

    if (txIds.length > 0) {
      const { error: approvalsErr } = await supabase
        .from('approvals')
        .delete()
        .in('transaction_id', txIds);
      if (approvalsErr) return res.status(500).json({ error: approvalsErr.message });

      const { error: ledgerErr } = await supabase
        .from('ledger_entries')
        .delete()
        .in('transaction_id', txIds);
      // ledger_entries may not exist in all environments; ignore undefined-table.
      if (ledgerErr && ledgerErr.code !== '42P01') {
        return res.status(500).json({ error: ledgerErr.message });
      }
    }

    const { error: txDeleteErr } = await supabase
      .from('transactions')
      .delete()
      .eq('card_id', cardId);
    if (txDeleteErr) return res.status(500).json({ error: txDeleteErr.message });

    const { error: anomalyDeleteErr } = await supabase
      .from('anomaly_log')
      .delete()
      .eq('card_id', cardId);
    if (anomalyDeleteErr) return res.status(500).json({ error: anomalyDeleteErr.message });

    const { error } = await supabase.from('cards').delete().eq('id', cardId);
    if (error) {
      return res.status(500).json({
        error: error.message,
        code: error.code || null,
        detail: error.detail || null,
      });
    }

    res.json({ success: true, message: 'Card deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Set spending limits — owner only
 * PUT /api/cards/:id/limits
 * Body: { daily_cap, max_per_txn } — in dollars, stored as cents
 */
router.put('/:id/limits', async (req, res) => {
  try {
    const { daily_cap, max_per_txn } = req.body;

    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('owner_id')
      .eq('id', req.params.id)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });
    if (card.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can set limits' });

    const { error } = await supabase
      .from('cards')
      .update({
        spending_limits: {
          daily_cap: Math.round((daily_cap || 0) * 100),
          max_per_txn: Math.round((max_per_txn || 0) * 100)
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ daily_cap: daily_cap || 0, max_per_txn: max_per_txn || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
