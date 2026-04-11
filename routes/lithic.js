// RENAMED: 2026-04-11 — was routes/cards.js; now Lithic virtual card operations
//   against the cards table (wallet); card_token lives at cards.card_token
const express = require('express');
const router = express.Router();
const { supabase, lithic, PROVIDER_ISSUING } = require('../config/providers');

/**
 * Get Lithic card details for a wallet card
 * GET /api/lithic/:id
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
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    let lithicData = null;
    if (card.card_token && PROVIDER_ISSUING === 'lithic') {
      try {
        const lithicCard = await lithic.cards.retrieve(card.card_token);
        lithicData = {
          token: lithicCard.token,
          last_four: lithicCard.last_four,
          state: lithicCard.state,
          spend_limit: lithicCard.spend_limit,
          spend_limit_duration: lithicCard.spend_limit_duration
        };
      } catch (err) {
        console.error('Error fetching from Lithic:', err.message);
      }
    }

    res.json({ ...card, lithic_data: lithicData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a Lithic virtual card for a wallet card and store the token
 * POST /api/lithic/:id/create
 * Body: { spend_limit, spend_limit_duration }
 */
router.post('/:id/create', async (req, res) => {
  try {
    const { spend_limit, spend_limit_duration } = req.body;

    if (PROVIDER_ISSUING !== 'lithic') {
      return res.status(400).json({ error: 'Lithic is not configured as issuing provider' });
    }

    const { data: card, error: findError } = await supabase
      .from('cards')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (findError || !card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    const isMember = members.includes(req.profile.id);
    const isOwner = card.owner_id === req.user.id;
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    const lithicCard = await lithic.cards.create({
      type: 'VIRTUAL',
      spend_limit: spend_limit ? Math.round(spend_limit * 100) : undefined,
      spend_limit_duration: spend_limit_duration || undefined
    });

    const { error: updateError } = await supabase
      .from('cards')
      .update({
        card_token: lithicCard.token,
        card_status: lithicCard.state || 'OPEN',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    res.status(201).json({
      card_id: req.params.id,
      lithic_data: {
        token: lithicCard.token,
        last_four: lithicCard.last_four,
        state: lithicCard.state
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pause the Lithic card associated with a wallet card
 * POST /api/lithic/:id/pause
 */
router.post('/:id/pause', async (req, res) => {
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
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    if (card.card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.card_token, { state: 'PAUSED' });
    }

    await supabase
      .from('cards')
      .update({ card_status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'Card paused' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resume the Lithic card associated with a wallet card
 * POST /api/lithic/:id/resume
 */
router.post('/:id/resume', async (req, res) => {
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
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    if (card.card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.card_token, { state: 'OPEN' });
    }

    await supabase
      .from('cards')
      .update({ card_status: 'OPEN', updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'Card resumed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Set Lithic spend limits on a wallet card
 * POST /api/lithic/:id/limits
 * Body: { spend_limit, spend_limit_duration } — spend_limit in dollars
 */
router.post('/:id/limits', async (req, res) => {
  try {
    const { spend_limit, spend_limit_duration } = req.body;

    const { data: card, error } = await supabase
      .from('cards')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    const isMember = members.includes(req.profile.id);
    const isOwner = card.owner_id === req.user.id;
    if (!isMember && !isOwner) return res.status(403).json({ error: 'Not authorized' });

    if (card.card_token && PROVIDER_ISSUING === 'lithic') {
      await lithic.cards.update(card.card_token, {
        spend_limit: spend_limit ? Math.round(spend_limit * 100) : undefined,
        spend_limit_duration: spend_limit_duration || undefined
      });
    }

    res.json({ success: true, message: 'Lithic limits updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test Lithic connection
 * GET /api/lithic/test/connection
 */
router.get('/test/connection', async (req, res) => {
  try {
    const cards = await lithic.cards.list({ limit: 5 });
    res.json({
      success: true,
      message: 'Lithic connection successful',
      cards_count: cards.data?.length || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
