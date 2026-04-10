// Transfers routes - deposit/ach/rtp/withdraw for MT/Astra
const express = require('express');
const router = express.Router();
const { supabase, modernTreasuryClient, astraClient, PROVIDER_BANK_RAILS, TEST_ACCOUNTS, MODERN_TREASURY_ORG_ID } = require('../config/providers');
const { createLedgerEntry, updateGroupBalance } = require('../utils/ledger');
const idempotencyMiddleware = require('../middleware/idempotency');

/**
 * Create ACH transfer (Modern Treasury)
 * POST /api/transfers/ach
 */
router.post('/ach', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, direction = 'credit', description, account_number, routing_number } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
    }

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
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

    // Create ACH transfer in Modern Treasury
    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'ach',
      amount: Math.abs(amount) * 100, // Convert to cents
      direction: direction.toLowerCase(),
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `Transfer for group ${group.name}`,
      counterparty: {
        name: group.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    // Store transfer in database
    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        group_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'ach',
        direction,
        amount: Math.abs(amount),
        status: paymentOrder.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // If credit (deposit), update ledger and balance
    if (direction === 'credit') {
      await createLedgerEntry({
        group_id,
        transaction_id: null,
        debit_account: 'cash',
        credit_account: 'external',
        amount: Math.abs(amount),
        description: description || 'ACH deposit',
        metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
      });
      await updateGroupBalance(group_id);
    }

    res.status(201).json({
      ...transfer,
      modern_treasury_data: paymentOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Create wire transfer (Modern Treasury)
 * POST /api/transfers/wire
 */
router.post('/wire', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, description, account_number, routing_number } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
    }

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
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

    // Check balance for withdrawals
    if (group.total_balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create wire transfer in Modern Treasury
    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'wire',
      amount: Math.abs(amount) * 100,
      direction: 'debit',
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `Wire transfer for group ${group.name}`,
      counterparty: {
        name: group.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    // Store transfer
    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        group_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'wire',
        direction: 'debit',
        amount: Math.abs(amount),
        status: paymentOrder.status || 'pending',
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
      debit_account: 'external',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description: description || 'Wire withdrawal',
      metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
    });
    await updateGroupBalance(group_id);

    res.status(201).json({
      ...transfer,
      modern_treasury_data: paymentOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Create FedNow transfer (Modern Treasury)
 * POST /api/transfers/fednow
 */
router.post('/fednow', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, description, account_number, routing_number } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
    }

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
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

    // Create FedNow transfer
    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'fednow',
      amount: Math.abs(amount) * 100,
      direction: 'debit',
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `FedNow transfer for group ${group.name}`,
      counterparty: {
        name: group.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    // Store transfer
    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        group_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'fednow',
        direction: 'debit',
        amount: Math.abs(amount),
        status: paymentOrder.status || 'pending',
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
      debit_account: 'external',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description: description || 'FedNow transfer',
      metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
    });
    await updateGroupBalance(group_id);

    res.status(201).json({
      ...transfer,
      modern_treasury_data: paymentOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Create RTP (Real-Time Payments) transfer (Astra)
 * POST /api/transfers/rtp
 */
router.post('/rtp', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, description, account_number, routing_number } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
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

    // Check balance
    if (group.total_balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create RTP transfer in Astra
    const astraResponse = await astraClient.post('/transfers', {
      account_id: TEST_ACCOUNTS.astra,
      amount: Math.abs(amount) * 100,
      type: 'rtp',
      description: description || `RTP transfer for group ${group.name}`,
      destination: {
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const astraTransfer = astraResponse.data;

    // Store transfer
    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        group_id,
        provider: 'astra',
        provider_transfer_id: astraTransfer.id || astraTransfer.transfer_id,
        type: 'rtp',
        direction: 'debit',
        amount: Math.abs(amount),
        status: astraTransfer.status || 'pending',
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
      debit_account: 'external',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description: description || 'RTP transfer',
      metadata: { transfer_id: transfer.id, provider: 'astra' }
    });
    await updateGroupBalance(group_id);

    res.status(201).json({
      ...transfer,
      astra_data: astraTransfer
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Deposit funds (generic)
 * POST /api/transfers/deposit
 */
router.post('/deposit', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, description, method = 'ach' } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
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

    // Create deposit based on method
    if (method === 'ach' && PROVIDER_BANK_RAILS === 'modern_treasury') {
      // Create ACH transfer in Modern Treasury
      try {
        const mtResponse = await modernTreasuryClient.post('/payment_orders', {
          type: 'ach',
          amount: Math.abs(amount) * 100,
          direction: 'credit',
          account_id: TEST_ACCOUNTS.modern_treasury,
          description: description || `Deposit for group ${group.name}`,
          counterparty: {
            name: group.name,
            account_number: '1234567890',
            routing_number: '021000021'
          }
        });

        const paymentOrder = mtResponse.data;

        // Store transfer
        const { data: transfer, error: txError } = await supabase
          .from('transfers')
          .insert({
            group_id,
            provider: 'modern_treasury',
            provider_transfer_id: paymentOrder.id,
            type: 'ach',
            direction: 'credit',
            amount: Math.abs(amount),
            status: paymentOrder.status || 'pending',
            description,
            owner_id: req.user.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!txError) {
          await createLedgerEntry({
            group_id,
            transaction_id: null,
            debit_account: 'cash',
            credit_account: 'external',
            amount: Math.abs(amount),
            description: description || 'ACH deposit',
            metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
          });
          await updateGroupBalance(group_id);
        }

        return res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
      } catch (mtError) {
        return res.status(500).json({ error: mtError.message, details: mtError.response?.data });
      }
    }

    // Default: just update ledger
    await createLedgerEntry({
      group_id,
      transaction_id: null,
      debit_account: 'cash',
      credit_account: 'external',
      amount: Math.abs(amount),
      description: description || 'Deposit',
      metadata: { method }
    });
    await updateGroupBalance(group_id);

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Withdraw funds (generic)
 * POST /api/transfers/withdraw
 */
router.post('/withdraw', idempotencyMiddleware, async (req, res) => {
  try {
    const { group_id, amount, description, method = 'ach' } = req.body;

    if (!group_id || !amount) {
      return res.status(400).json({ error: 'group_id and amount are required' });
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

    // Check balance
    if (group.total_balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create withdrawal based on method
    if (method === 'ach' && PROVIDER_BANK_RAILS === 'modern_treasury') {
      // Create ACH withdrawal in Modern Treasury
      try {
        const mtResponse = await modernTreasuryClient.post('/payment_orders', {
          type: 'ach',
          amount: Math.abs(amount) * 100,
          direction: 'debit',
          account_id: TEST_ACCOUNTS.modern_treasury,
          description: description || `Withdrawal for group ${group.name}`,
          counterparty: {
            name: group.name,
            account_number: '1234567890',
            routing_number: '021000021'
          }
        });

        const paymentOrder = mtResponse.data;

        // Store transfer
        const { data: transfer, error: txError } = await supabase
          .from('transfers')
          .insert({
            group_id,
            provider: 'modern_treasury',
            provider_transfer_id: paymentOrder.id,
            type: 'ach',
            direction: 'debit',
            amount: Math.abs(amount),
            status: paymentOrder.status || 'pending',
            description,
            owner_id: req.user.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!txError) {
          await createLedgerEntry({
            group_id,
            transaction_id: null,
            debit_account: 'external',
            credit_account: 'cash',
            amount: Math.abs(amount),
            description: description || 'ACH withdrawal',
            metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
          });
          await updateGroupBalance(group_id);
        }

        return res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
      } catch (mtError) {
        return res.status(500).json({ error: mtError.message, details: mtError.response?.data });
      }
    } else if (method === 'rtp') {
      // Create RTP transfer in Astra
      try {
        const astraResponse = await astraClient.post('/transfers', {
          account_id: TEST_ACCOUNTS.astra,
          amount: Math.abs(amount) * 100,
          type: 'rtp',
          description: description || `RTP withdrawal for group ${group.name}`,
          destination: {
            account_number: '1234567890',
            routing_number: '021000021'
          }
        });

        const astraTransfer = astraResponse.data;

        // Store transfer
        const { data: transfer, error: txError } = await supabase
          .from('transfers')
          .insert({
            group_id,
            provider: 'astra',
            provider_transfer_id: astraTransfer.id || astraTransfer.transfer_id,
            type: 'rtp',
            direction: 'debit',
            amount: Math.abs(amount),
            status: astraTransfer.status || 'pending',
            description,
            owner_id: req.user.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!txError) {
          await createLedgerEntry({
            group_id,
            transaction_id: null,
            debit_account: 'external',
            credit_account: 'cash',
            amount: Math.abs(amount),
            description: description || 'RTP withdrawal',
            metadata: { transfer_id: transfer.id, provider: 'astra' }
          });
          await updateGroupBalance(group_id);
        }

        return res.status(201).json({ ...transfer, astra_data: astraTransfer });
      } catch (astraError) {
        return res.status(500).json({ error: astraError.message, details: astraError.response?.data });
      }
    }

    // Default: just update ledger
    await createLedgerEntry({
      group_id,
      transaction_id: null,
      debit_account: 'external',
      credit_account: 'cash',
      amount: Math.abs(amount),
      description: description || 'Withdrawal',
      metadata: { method }
    });
    await updateGroupBalance(group_id);

    res.json({ success: true, message: 'Withdrawal processed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test Modern Treasury connection
 * GET /api/transfers/test/modern-treasury
 */
router.get('/test/modern-treasury', async (req, res) => {
  try {
    const response = await modernTreasuryClient.get('/accounts', {
      params: { per_page: 5 }
    });
    res.json({
      success: true,
      message: 'Modern Treasury connection successful',
      accounts: response.data || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

/**
 * Test Astra connection
 * GET /api/transfers/test/astra
 */
router.get('/test/astra', async (req, res) => {
  try {
    const response = await astraClient.get('/accounts');
    res.json({
      success: true,
      message: 'Astra connection successful',
      accounts: response.data || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

module.exports = router;
