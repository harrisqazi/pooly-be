// RENAMED: 2026-04-11 — was routes/groups.js; now manages wallet card CRUD
//   against the cards table (new unified schema)
const express = require('express');
const router = express.Router();
const { randomBytes } = require('crypto');
const { supabase } = require('../config/providers');

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

    const members = card.members || [];
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

    const invite_code = randomBytes(6).toString('hex').toUpperCase();

    const { data, error } = await supabase
      .from('cards')
      .insert({
        name,
        card_name: card_name || name,
        description: description || null,
        owner_id: req.user.id,
        members: JSON.stringify([req.profile.id]),
        total_balance: 0,
        spending_limits: { daily_cap: 0, max_per_txn: 0 },
        invite_code,
        blocked_mcc: []
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
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

    const members = card.members || [];
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
 * Delete a card (wallet) — owner only
 * DELETE /api/cards/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('owner_id')
      .eq('id', req.params.id)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });
    if (card.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this card' });

    const { error } = await supabase.from('cards').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });

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
