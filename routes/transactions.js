// Transactions routes - preapprove/create/approve/deny/list
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/providers');
const { createLedgerEntry, updateGroupBalance } = require('../utils/ledger');

/**
 * List transactions for a group
 * GET /api/transactions?group_id=xxx
 */
router.get('/', async (req, res) => {
  try {
    const { group_id, status } = req.query;
    let query = supabase
      .from('transactions')
      .select('*, groups(name), approvals(*)')
      .order('created_at', { ascending: false });

    if (group_id) {
      query = query.eq('group_id', group_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // Filter by user's groups
    const { data: userGroups } = await supabase
      .from('groups')
      .select('id')
      .or(`owner_id.eq.${req.user.id},member_ids.cs.{${req.user.id}}`);

    const groupIds = userGroups?.map(g => g.id) || [];
    if (groupIds.length > 0) {
      query = query.in('group_id', groupIds);
    } else {
      return res.json([]);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get pending approvals for user
 * GET /api/transactions/approvals
 */
router.get('/approvals', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, groups(name), approvals(*)')
      .eq('status', 'pending')
      .or(`approver_ids.cs.{${req.user.id}},owner_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Preapprove a transaction (create pending transaction)
 * POST /api/transactions/preapprove
 */
router.post('/preapprove', async (req, res) => {
  try {
    const { group_id, amount, description, merchant, approver_ids } = req.body;

    if (!group_id || !amount || !description) {
      return res.status(400).json({ error: 'group_id, amount, and description are required' });
    }

    // Verify user is member of group
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', group_id)
      .single();

    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        group_id,
        amount: Math.abs(amount), // Ensure positive
        description,
        merchant: merchant || null,
        status: 'pending',
        owner_id: req.user.id,
        approver_ids: approver_ids || [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create and execute a transaction
 * POST /api/transactions
 */
router.post('/', async (req, res) => {
  try {
    const { group_id, amount, description, merchant, card_id, transfer_id } = req.body;

    if (!group_id || !amount || !description) {
      return res.status(400).json({ error: 'group_id, amount, and description are required' });
    }

    // Verify user is member of group
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', group_id)
      .single();

    if (!group || (!group.member_ids?.includes(req.user.id) && group.owner_id !== req.user.id)) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    // Check balance
    if (group.total_balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        group_id,
        amount: Math.abs(amount),
        description,
        merchant: merchant || null,
        status: 'completed',
        owner_id: req.user.id,
        card_id: card_id || null,
        transfer_id: transfer_id || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (txError) {
      return res.status(500).json({ error: txError.message });
    }

    // Create ledger entry
    await createLedgerEntry({
      group_id,
      transaction_id: transaction.id,
      debit_account: 'expenses',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description,
      metadata: { merchant, card_id, transfer_id }
    });

    // Update group balance
    await updateGroupBalance(group_id);

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Approve a pending transaction
 * POST /api/transactions/:id/approve
 */
router.post('/:id/approve', async (req, res) => {
  try {
    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, groups(*)')
      .eq('id', req.params.id)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction is not pending' });
    }

    // Check if user is approver
    if (!transaction.approver_ids?.includes(req.user.id) && transaction.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to approve this transaction' });
    }

    // Create approval record
    const { error: approvalError } = await supabase
      .from('approvals')
      .insert({
        transaction_id: transaction.id,
        approver_id: req.user.id,
        status: 'approved',
        created_at: new Date().toISOString()
      });

    if (approvalError) {
      return res.status(500).json({ error: approvalError.message });
    }

    // Check if all approvers have approved
    const { data: approvals } = await supabase
      .from('approvals')
      .select('*')
      .eq('transaction_id', transaction.id)
      .eq('status', 'approved');

    const requiredApprovers = transaction.approver_ids?.length || 0;
    if (approvals.length >= requiredApprovers || requiredApprovers === 0) {
      // Execute transaction
      const group = transaction.groups;
      if (group.total_balance >= transaction.amount) {
        await supabase
          .from('transactions')
          .update({ status: 'completed' })
          .eq('id', transaction.id);

        // Create ledger entry
        await createLedgerEntry({
          group_id: transaction.group_id,
          transaction_id: transaction.id,
          debit_account: 'expenses',
          credit_account: 'cash',
          amount: transaction.amount,
          description: transaction.description,
          metadata: { merchant: transaction.merchant }
        });

        // Update balance
        await updateGroupBalance(transaction.group_id);
      }
    }

    res.json({ success: true, message: 'Transaction approved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Deny a pending transaction
 * POST /api/transactions/:id/deny
 */
router.post('/:id/deny', async (req, res) => {
  try {
    const { reason } = req.body;

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction is not pending' });
    }

    // Check if user is approver
    if (!transaction.approver_ids?.includes(req.user.id) && transaction.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to deny this transaction' });
    }

    // Create denial record
    await supabase
      .from('approvals')
      .insert({
        transaction_id: transaction.id,
        approver_id: req.user.id,
        status: 'denied',
        reason: reason || null,
        created_at: new Date().toISOString()
      });

    // Update transaction status
    await supabase
      .from('transactions')
      .update({ status: 'denied' })
      .eq('id', transaction.id);

    res.json({ success: true, message: 'Transaction denied' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
