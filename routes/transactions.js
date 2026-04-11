// MODIFIED: 2026-04-11 — groups → cards, group_id → card_id,
//   membership uses members jsonb, profile_id added to inserts
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/providers');
const { createLedgerEntry, updateCardBalance } = require('../utils/ledger');

/**
 * List transactions for a card (wallet)
 * GET /api/transactions?card_id=xxx&status=xxx
 */
router.get('/', async (req, res) => {
  try {
    const { card_id, status } = req.query;

    // Get cards the user belongs to
    const { data: userCards } = await supabase
      .from('cards')
      .select('id')
      .or(`owner_id.eq.${req.user.id},members.cs.["${req.profile.id}"]`);

    const cardIds = (userCards || []).map(c => c.id);
    if (cardIds.length === 0) return res.json([]);

    let query = supabase
      .from('transactions')
      .select('*, cards(name), approvals(*)')
      .in('card_id', cardIds)
      .order('created_at', { ascending: false });

    if (card_id) query = query.eq('card_id', card_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get pending approvals
 * GET /api/transactions/approvals
 */
router.get('/approvals', async (req, res) => {
  try {
    const { data: userCards } = await supabase
      .from('cards')
      .select('id')
      .or(`owner_id.eq.${req.user.id},members.cs.["${req.profile.id}"]`);

    const cardIds = (userCards || []).map(c => c.id);
    if (cardIds.length === 0) return res.json([]);

    const { data, error } = await supabase
      .from('transactions')
      .select('*, cards(name), approvals(*)')
      .eq('status', 'pending')
      .in('card_id', cardIds)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Preapprove a transaction (create pending)
 * POST /api/transactions/preapprove
 */
router.post('/preapprove', async (req, res) => {
  try {
    const { card_id, amount, description, merchant_name, approver_ids } = req.body;
    if (!card_id || !amount || !description) {
      return res.status(400).json({ error: 'card_id, amount, and description are required' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not a member of this card' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        card_id,
        profile_id: req.profile.id,
        user_id: req.user.id,
        amount: Math.round(Math.abs(amount) * 100),
        description,
        merchant_name: merchant_name || null,
        status: 'pending',
        created_at: new Date().toISOString()
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
 * Create and execute a transaction
 * POST /api/transactions
 */
router.post('/', async (req, res) => {
  try {
    const { card_id, amount, description, merchant_name } = req.body;
    if (!card_id || !amount || !description) {
      return res.status(400).json({ error: 'card_id, amount, and description are required' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not a member of this card' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);
    if (Number(card.total_balance) < amount_cents) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        card_id,
        profile_id: req.profile.id,
        user_id: req.user.id,
        amount: amount_cents,
        description,
        merchant_name: merchant_name || null,
        status: 'completed',
        created_at: new Date().toISOString()
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

    await updateCardBalance(card_id);
    res.status(201).json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Approve a pending transaction
 * POST /api/transactions/:id/approve
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, cards(*)')
      .eq('id', req.params.id)
      .single();

    if (txError || !transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });

    const card = transaction.cards;
    const members = card?.members || [];
    if (!members.includes(req.profile.id) && card?.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to approve this transaction' });
    }

    await supabase.from('approvals').insert({
      transaction_id: transaction.id,
      card_id: transaction.card_id,
      requester_id: transaction.profile_id,
      approver_id: req.profile.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    const { data: approvals } = await supabase
      .from('approvals')
      .select('*')
      .eq('transaction_id', transaction.id)
      .eq('status', 'approved');

    const threshold = card?.approval_threshold || 1;
    if ((approvals || []).length >= threshold) {
      if (Number(card.total_balance) >= Number(transaction.amount)) {
        await supabase.from('transactions').update({ status: 'completed' }).eq('id', transaction.id);
        await createLedgerEntry({
          transaction_id: transaction.id,
          debit_account: 'expenses',
          credit_account: 'cash',
          amount: Number(transaction.amount)
        });
        await updateCardBalance(transaction.card_id);
      }
    }

    res.json({ success: true, message: 'Transaction approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Deny a pending transaction
 * POST /api/transactions/:id/deny
 */
router.post('/:id/deny', async (req, res) => {
  try {
    const { reason } = req.body;

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, cards(*)')
      .eq('id', req.params.id)
      .single();

    if (txError || !transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.status !== 'pending') return res.status(400).json({ error: 'Transaction is not pending' });

    const card = transaction.cards;
    const members = card?.members || [];
    if (!members.includes(req.profile.id) && card?.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to deny this transaction' });
    }

    await supabase.from('approvals').insert({
      transaction_id: transaction.id,
      card_id: transaction.card_id,
      requester_id: transaction.profile_id,
      approver_id: req.profile.id,
      status: 'denied',
      notes: reason || null,
      created_at: new Date().toISOString()
    });

    await supabase.from('transactions').update({ status: 'denied' }).eq('id', transaction.id);
    res.json({ success: true, message: 'Transaction denied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
