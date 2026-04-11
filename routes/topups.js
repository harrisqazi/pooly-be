// MODIFIED: 2026-04-11 — groups → cards, group_id → card_id,
//   membership uses members jsonb pattern
const express = require('express');
const router = express.Router();
const { supabase, payTheoryClient, PROVIDER_ACQUIRING, TEST_ACCOUNTS } = require('../config/providers');
const { createLedgerEntry, updateCardBalance } = require('../utils/ledger');
const idempotencyMiddleware = require('../middleware/idempotency');

/**
 * Top up a card
 * POST /api/topups
 */
router.post('/', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, description } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    if (PROVIDER_ACQUIRING !== 'paytheory') {
      return res.status(400).json({ error: 'Pay Theory is not configured as acquiring provider' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);

    const ptResponse = await payTheoryClient.post('/topups', {
      card_token: card.card_token || card_id,
      amount: amount_cents,
      description: description || `Top-up for card ${card.name}`,
      account_id: TEST_ACCOUNTS.paytheory
    });

    const topup = ptResponse.data;

    const { data: topupRecord, error } = await supabase
      .from('topups')
      .insert({
        card_id,
        provider: 'paytheory',
        provider_topup_id: topup.id || topup.topup_id,
        amount: amount_cents,
        status: topup.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await createLedgerEntry({
      transaction_id: null,
      debit_account: 'cash',
      credit_account: 'external',
      amount: amount_cents
    });
    await updateCardBalance(card_id);

    res.status(201).json({ ...topupRecord, paytheory_data: topup });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/**
 * List top-ups for a card
 * GET /api/topups?card_id=xxx
 */
router.get('/', async (req, res) => {
  try {
    const { card_id } = req.query;
    if (!card_id) return res.status(400).json({ error: 'card_id is required' });

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { data: topups, error } = await supabase
      .from('topups')
      .select('*')
      .eq('card_id', card_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(topups || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test Pay Theory connection
 * GET /api/topups/test/paytheory
 */
router.get('/test/paytheory', async (req, res) => {
  try {
    const response = await payTheoryClient.get('/accounts');
    res.json({ success: true, message: 'Pay Theory connection successful', accounts: response.data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

module.exports = router;
