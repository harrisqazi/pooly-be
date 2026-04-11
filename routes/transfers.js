// MODIFIED: 2026-04-11 — groups → cards, group_id → card_id,
//   membership uses members jsonb pattern; Astra routes removed
const express = require('express');
const router = express.Router();
const { supabase, modernTreasuryClient, PROVIDER_BANK_RAILS, TEST_ACCOUNTS, MODERN_TREASURY_ORG_ID } = require('../config/providers');
const { createLedgerEntry, updateCardBalance } = require('../utils/ledger');
const idempotencyMiddleware = require('../middleware/idempotency');

/**
 * Create ACH transfer (Modern Treasury)
 * POST /api/transfers/ach
 */
router.post('/ach', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, direction = 'credit', description, account_number, routing_number } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);

    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'ach',
      amount: amount_cents,
      direction: direction.toLowerCase(),
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `ACH transfer for card ${card.name}`,
      counterparty: {
        name: card.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        card_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'ach',
        direction,
        amount: amount_cents,
        status: paymentOrder.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (direction === 'credit') {
      await createLedgerEntry({
        transaction_id: null,
        debit_account: 'cash',
        credit_account: 'external',
        amount: amount_cents
      });
      await updateCardBalance(card_id);
    }

    res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/**
 * Create wire transfer (Modern Treasury)
 * POST /api/transfers/wire
 */
router.post('/wire', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, description, account_number, routing_number } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);
    if (Number(card.total_balance) < amount_cents) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'wire',
      amount: amount_cents,
      direction: 'debit',
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `Wire transfer for card ${card.name}`,
      counterparty: {
        name: card.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        card_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'wire',
        direction: 'debit',
        amount: amount_cents,
        status: paymentOrder.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await createLedgerEntry({
      transaction_id: null,
      debit_account: 'external',
      credit_account: 'cash',
      amount: amount_cents
    });
    await updateCardBalance(card_id);

    res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/**
 * Create FedNow transfer (Modern Treasury)
 * POST /api/transfers/fednow
 */
router.post('/fednow', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, description, account_number, routing_number } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    if (PROVIDER_BANK_RAILS !== 'modern_treasury') {
      return res.status(400).json({ error: 'Modern Treasury is not configured as bank rails provider' });
    }

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);

    const mtResponse = await modernTreasuryClient.post('/payment_orders', {
      type: 'fednow',
      amount: amount_cents,
      direction: 'debit',
      account_id: TEST_ACCOUNTS.modern_treasury,
      description: description || `FedNow transfer for card ${card.name}`,
      counterparty: {
        name: card.name,
        account_number: account_number || '1234567890',
        routing_number: routing_number || '021000021'
      }
    });

    const paymentOrder = mtResponse.data;

    const { data: transfer, error } = await supabase
      .from('transfers')
      .insert({
        card_id,
        provider: 'modern_treasury',
        provider_transfer_id: paymentOrder.id,
        type: 'fednow',
        direction: 'debit',
        amount: amount_cents,
        status: paymentOrder.status || 'pending',
        description,
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await createLedgerEntry({
      transaction_id: null,
      debit_account: 'external',
      credit_account: 'cash',
      amount: amount_cents
    });
    await updateCardBalance(card_id);

    res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/**
 * Deposit funds (generic)
 * POST /api/transfers/deposit
 */
router.post('/deposit', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, description, method = 'ach' } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);

    if (method === 'ach' && PROVIDER_BANK_RAILS === 'modern_treasury') {
      try {
        const mtResponse = await modernTreasuryClient.post('/payment_orders', {
          type: 'ach',
          amount: amount_cents,
          direction: 'credit',
          account_id: TEST_ACCOUNTS.modern_treasury,
          description: description || `Deposit for card ${card.name}`,
          counterparty: { name: card.name, account_number: '1234567890', routing_number: '021000021' }
        });

        const paymentOrder = mtResponse.data;

        const { data: transfer, error: txError } = await supabase
          .from('transfers')
          .insert({
            card_id,
            provider: 'modern_treasury',
            provider_transfer_id: paymentOrder.id,
            type: 'ach',
            direction: 'credit',
            amount: amount_cents,
            status: paymentOrder.status || 'pending',
            description,
            owner_id: req.user.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!txError) {
          await createLedgerEntry({
            transaction_id: null,
            debit_account: 'cash',
            credit_account: 'external',
            amount: amount_cents
          });
          await updateCardBalance(card_id);
        }

        return res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
      } catch (mtError) {
        return res.status(500).json({ error: mtError.message, details: mtError.response?.data });
      }
    }

    await createLedgerEntry({
      transaction_id: null,
      debit_account: 'cash',
      credit_account: 'external',
      amount: amount_cents
    });
    await updateCardBalance(card_id);

    res.json({ success: true, message: 'Deposit processed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Withdraw funds (generic)
 * POST /api/transfers/withdraw
 */
router.post('/withdraw', idempotencyMiddleware, async (req, res) => {
  try {
    const { card_id, amount, description, method = 'ach' } = req.body;
    if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount are required' });

    const { data: card } = await supabase.from('cards').select('*').eq('id', card_id).single();
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const members = card.members || [];
    if (!members.includes(req.profile.id) && card.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const amount_cents = Math.round(Math.abs(amount) * 100);
    if (Number(card.total_balance) < amount_cents) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    if (method === 'ach' && PROVIDER_BANK_RAILS === 'modern_treasury') {
      try {
        const mtResponse = await modernTreasuryClient.post('/payment_orders', {
          type: 'ach',
          amount: amount_cents,
          direction: 'debit',
          account_id: TEST_ACCOUNTS.modern_treasury,
          description: description || `Withdrawal for card ${card.name}`,
          counterparty: { name: card.name, account_number: '1234567890', routing_number: '021000021' }
        });

        const paymentOrder = mtResponse.data;

        const { data: transfer, error: txError } = await supabase
          .from('transfers')
          .insert({
            card_id,
            provider: 'modern_treasury',
            provider_transfer_id: paymentOrder.id,
            type: 'ach',
            direction: 'debit',
            amount: amount_cents,
            status: paymentOrder.status || 'pending',
            description,
            owner_id: req.user.id,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!txError) {
          await createLedgerEntry({
            transaction_id: null,
            debit_account: 'external',
            credit_account: 'cash',
            amount: amount_cents
          });
          await updateCardBalance(card_id);
        }

        return res.status(201).json({ ...transfer, modern_treasury_data: paymentOrder });
      } catch (mtError) {
        return res.status(500).json({ error: mtError.message, details: mtError.response?.data });
      }
    }

    await createLedgerEntry({
      transaction_id: null,
      debit_account: 'external',
      credit_account: 'cash',
      amount: amount_cents
    });
    await updateCardBalance(card_id);

    res.json({ success: true, message: 'Withdrawal processed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test Modern Treasury connection
 * GET /api/transfers/test/modern-treasury
 */
router.get('/test/modern-treasury', async (req, res) => {
  try {
    const response = await modernTreasuryClient.get('/accounts', { params: { per_page: 5 } });
    res.json({ success: true, message: 'Modern Treasury connection successful', accounts: response.data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

module.exports = router;
