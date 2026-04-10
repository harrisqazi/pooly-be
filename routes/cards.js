// Cards routes - create/pause/set-limits for Lithic
const express = require('express');
const router = express.Router();
const { supabase, lithic, PROVIDER_ISSUING } = require('../config/providers');

/**
 * List cards for a group
 * GET /api/cards?group_id=xxx
 */
router.get('/', async (req, res) => {
  try {
    const { group_id } = req.query;

    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required' });
    }

    // Verify user is member
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', group_id)
      .single();

    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get cards from database
    const { data: cards, error } = await supabase
      .from('cards')
      .select('*')
      .eq('group_id', group_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(cards || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a virtual card
 * POST /api/cards
 */
router.post('/', async (req, res) => {
  try {
    const { group_id, type = 'VIRTUAL', spend_limit, spend_limit_duration } = req.body;

    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required' });
    }

    if (PROVIDER_ISSUING !== 'lithic') {
      return res.status(400).json({ error: 'Lithic is not configured as issuing provider' });
    }

    // Verify user is member
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', group_id)
      .single();

    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Create card in Lithic
    const lithicCard = await lithic.cards.create({
      type: type.toUpperCase(),
      spend_limit: spend_limit ? spend_limit * 100 : null, // Convert to cents
      spend_limit_duration: spend_limit_duration || null
    });

    // Store card in database
    const { data: card, error } = await supabase
      .from('cards')
      .insert({
        group_id,
        lithic_card_token: lithicCard.token,
        card_number: lithicCard.pan || null,
        card_type: type,
        status: lithicCard.state || 'OPEN',
        spend_limit: spend_limit || null,
        spend_limit_duration: spend_limit_duration || null,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      ...card,
      lithic_data: {
        token: lithicCard.token,
        last_four: lithicCard.last_four,
        state: lithicCard.state
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get card details
 * GET /api/cards/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('cards')
      .select('*, groups(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify user is member
    const group = card.groups;
    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Fetch latest from Lithic if token exists
    if (card.lithic_card_token && PROVIDER_ISSUING === 'lithic') {
      try {
        const lithicCard = await lithic.cards.retrieve(card.lithic_card_token);
        card.lithic_data = {
          token: lithicCard.token,
          last_four: lithicCard.last_four,
          state: lithicCard.state,
          spend_limit: lithicCard.spend_limit,
          spend_limit_duration: lithicCard.spend_limit_duration
        };
      } catch (err) {
        console.error('Error fetching from Lithic:', err);
      }
    }

    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pause a card
 * POST /api/cards/:id/pause
 */
router.post('/:id/pause', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('cards')
      .select('*, groups(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify user is member
    const group = card.groups;
    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (card.lithic_card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.lithic_card_token, { state: 'PAUSED' });
    }

    await supabase
      .from('cards')
      .update({ status: 'PAUSED' })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'Card paused' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resume a card
 * POST /api/cards/:id/resume
 */
router.post('/:id/resume', async (req, res) => {
  try {
    const { data: card, error } = await supabase
      .from('cards')
      .select('*, groups(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify user is member
    const group = card.groups;
    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (card.lithic_card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.lithic_card_token, { state: 'OPEN' });
    }

    await supabase
      .from('cards')
      .update({ status: 'OPEN' })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'Card resumed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set spending limits
 * POST /api/cards/:id/limits
 */
router.post('/:id/limits', async (req, res) => {
  try {
    const { spend_limit, spend_limit_duration } = req.body;

    const { data: card, error } = await supabase
      .from('cards')
      .select('*, groups(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify user is member
    const group = card.groups;
    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (card.lithic_card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.lithic_card_token, {
        spend_limit: spend_limit ? spend_limit * 100 : null,
        spend_limit_duration: spend_limit_duration || null
      });
    }

    await supabase
      .from('cards')
      .update({
        spend_limit: spend_limit || null,
        spend_limit_duration: spend_limit_duration || null
      })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'Limits updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test Lithic connection
 * GET /api/cards/test/lithic
 */
router.get('/test/lithic', async (req, res) => {
  try {
    const cards = await lithic.cards.list({ limit: 5 });
    res.json({
      success: true,
      message: 'Lithic connection successful',
      cards_count: cards.data?.length || 0,
      cards: cards.data || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
