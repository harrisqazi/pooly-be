// Topups routes - card top-ups for Pay Theory
const express = require('express');
const router = express.Router();
const { supabase, payTheoryClient, PROVIDER_ACQUIRING, TEST_ACCOUNTS } = require('../config/providers');
const { createLedgerEntry, updateGroupBalance } = require('../utils/ledger');
const idempotencyMiddleware = require('../middleware/idempotency');

/**
 * Top up a card
 * POST /api/topups
 */
router.post('/', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, card_id, amount, description } = req.body;

    if (!group_id || !card_id || !amount) {
      return res.status(400).json({ error: 'group_id, card_id, and amount are required' });
    }

    if (PROVIDER_ACQUIRING !== 'paytheory') {
      return res.status(400).json({ error: 'Pay Theory is not configured as acquiring provider' });
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

    // Verify card belongs to group
    const { data: card } = await supabase
      .from('cards')
      .select('*')
      .eq('id', card_id)
      .eq('group_id', group_id)
      .single();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Check balance
    if (group.total_balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create top-up in Pay Theory
    const ptResponse = await payTheoryClient.post('/topups', {
      card_id: card.lithic_card_token || card.id,
      amount: Math.abs(amount) * 100, // Convert to cents
      description: description || `Top-up for card ${card.id}`,
      account_id: TEST_ACCOUNTS.paytheory
    });

    const topup = ptResponse.data;

    // Store top-up in database
    const { data: topupRecord, error } = await supabase
      .from('topups')
      .insert({
        group_id,
        card_id,
        provider: 'paytheory',
        provider_topup_id: topup.id || topup.topup_id,
        amount: Math.abs(amount),
        status: topup.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Update ledger and balance
    await createLedgerEntry({
      group_id,
      transaction_id: null,
      debit_account: 'cards',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description: description || 'Card top-up',
      metadata: { topup_id: topupRecord.id, card_id, provider: 'paytheory' }
    });
    await updateGroupBalance(group_id);

    res.status(201).json({
      ...topupRecord,
      paytheory_data: topup
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * List top-ups for a group
 * GET /api/topups?group_id=xxx
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

    const { data: topups, error } = await supabase
      .from('topups')
      .select('*, cards(*)')
      .eq('group_id', group_id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(topups || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test Pay Theory connection
 * GET /api/topups/test/paytheory
 */
router.get('/test/paytheory', async (req, res) => {
  try {
    const response = await payTheoryClient.get('/accounts');
    res.json({
      success: true,
      message: 'Pay Theory connection successful',
      accounts: response.data || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

module.exports = router;
