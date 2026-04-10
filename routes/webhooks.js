// Webhooks routes - raw-body/HMAC/dedupe for all providers
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase, lithic, modernTreasuryClient, payTheoryClient, astraClient } = require('../config/providers');
const { createLedgerEntry, updateGroupBalance } = require('../utils/ledger');

// Middleware to capture raw body for HMAC verification
const rawBodyMiddleware = express.raw({ type: 'application/json', limit: '10mb' });

/**
 * Verify HMAC signature
 */
function verifyHMAC(signature, secret, body) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Deduplicate webhook by checking if we've processed this event ID
 */
async function isDuplicate(provider, eventId) {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single();

  return !!data;
}

/**
 * Store webhook event for deduplication
 */
async function storeWebhookEvent(provider, eventId, payload) {
  await supabase
    .from('webhook_events')
    .insert({
      provider,
      event_id: eventId,
      payload,
      processed_at: new Date().toISOString()
    });
}

/**
 * Lithic webhook handler
 * POST /api/webhooks/lithic
 */
router.post('/lithic', rawBodyMiddleware, async (req, res) => {
  try {
    const signature = req.headers['lithic-signature'] || req.headers['x-lithic-signature'];
    const webhookSecret = process.env.LITHIC_WEBHOOK_SECRET || 'lithic_webhook_secret';

    // Verify HMAC if secret is configured
    if (webhookSecret && webhookSecret !== 'lithic_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.event_id || event.id || `${Date.now()}-${Math.random()}`;

    // Deduplicate
    if (await isDuplicate('lithic', eventId)) {
      return res.json({ received: true, duplicate: true });
    }

    await storeWebhookEvent('lithic', eventId, event);

    // Handle different event types
    if (event.type === 'card.created' || event.type === 'card.updated') {
      // Update card in database
      if (event.data?.token) {
        await supabase
          .from('cards')
          .update({
            status: event.data.state || 'OPEN',
            spend_limit: event.data.spend_limit ? event.data.spend_limit / 100 : null,
            updated_at: new Date().toISOString()
          })
          .eq('lithic_card_token', event.data.token);
      }
    } else if (event.type === 'transaction.settled' || event.type === 'transaction.authorization') {
      // Update transaction status
      if (event.data?.card_token) {
        const { data: card } = await supabase
          .from('cards')
          .select('group_id')
          .eq('lithic_card_token', event.data.card_token)
          .single();

        if (card) {
          // Create or update transaction
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('card_id', card.id)
            .eq('provider_transaction_id', event.data.token)
            .single();

          if (!existingTx) {
            await supabase
              .from('transactions')
              .insert({
                group_id: card.group_id,
                card_id: card.id,
                amount: event.data.amount ? event.data.amount / 100 : 0,
                description: event.data.merchant?.name || 'Card transaction',
                merchant: event.data.merchant?.name || null,
                status: event.type === 'transaction.settled' ? 'completed' : 'pending',
                provider_transaction_id: event.data.token,
                created_at: new Date().toISOString()
              });
          }

          // Update balance if settled
          if (event.type === 'transaction.settled') {
            await createLedgerEntry({
              group_id: card.group_id,
              transaction_id: existingTx?.id || null,
              debit_account: 'expenses',
              credit_account: 'cards',
              amount: event.data.amount ? event.data.amount / 100 : 0,
              description: event.data.merchant?.name || 'Card transaction',
              metadata: { provider: 'lithic', transaction_id: event.data.token }
            });
            await updateGroupBalance(card.group_id);
          }
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Lithic webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Modern Treasury webhook handler
 * POST /api/webhooks/modern-treasury
 */
router.post('/modern-treasury', rawBodyMiddleware, async (req, res) => {
  try {
    const signature = req.headers['x-signature'] || req.headers['modern-treasury-signature'];
    const webhookSecret = process.env.MODERN_TREASURY_WEBHOOK_SECRET || 'mt_webhook_secret';

    // Verify HMAC if secret is configured
    if (webhookSecret && webhookSecret !== 'mt_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.id || event.event_id || `${Date.now()}-${Math.random()}`;

    // Deduplicate
    if (await isDuplicate('modern_treasury', eventId)) {
      return res.json({ received: true, duplicate: true });
    }

    await storeWebhookEvent('modern_treasury', eventId, event);

    // Handle payment order updates
    if (event.object === 'payment_order' || event.type === 'payment_order.updated') {
      const paymentOrder = event.data || event;
      const { data: transfer } = await supabase
        .from('transfers')
        .select('*, groups(*)')
        .eq('provider_transfer_id', paymentOrder.id)
        .single();

      if (transfer) {
        // Update transfer status
        await supabase
          .from('transfers')
          .update({
            status: paymentOrder.status || 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.id);

        // If completed and credit, update balance
        if (paymentOrder.status === 'posted' && transfer.direction === 'credit') {
          await createLedgerEntry({
            group_id: transfer.group_id,
            transaction_id: null,
            debit_account: 'cash',
            credit_account: 'external',
            amount: transfer.amount,
            description: transfer.description || 'Transfer',
            metadata: { transfer_id: transfer.id, provider: 'modern_treasury' }
          });
          await updateGroupBalance(transfer.group_id);
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Modern Treasury webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pay Theory webhook handler
 * POST /api/webhooks/paytheory
 */
router.post('/paytheory', rawBodyMiddleware, async (req, res) => {
  try {
    const signature = req.headers['x-paytheory-signature'] || req.headers['paytheory-signature'];
    const webhookSecret = process.env.PAY_THEORY_WEBHOOK_SECRET || 'pt_webhook_secret';

    // Verify HMAC if secret is configured
    if (webhookSecret && webhookSecret !== 'pt_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.id || event.event_id || `${Date.now()}-${Math.random()}`;

    // Deduplicate
    if (await isDuplicate('paytheory', eventId)) {
      return res.json({ received: true, duplicate: true });
    }

    await storeWebhookEvent('paytheory', eventId, event);

    // Handle top-up updates
    if (event.type === 'topup.completed' || event.type === 'topup.failed') {
      const { data: topup } = await supabase
        .from('topups')
        .select('*, groups(*)')
        .eq('provider_topup_id', event.data?.id || event.data?.topup_id)
        .single();

      if (topup) {
        await supabase
          .from('topups')
          .update({
            status: event.type === 'topup.completed' ? 'completed' : 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', topup.id);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Pay Theory webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Astra webhook handler
 * POST /api/webhooks/astra
 */
router.post('/astra', rawBodyMiddleware, async (req, res) => {
  try {
    const signature = req.headers['x-astra-signature'] || req.headers['astra-signature'];
    const webhookSecret = process.env.ASTRA_WEBHOOK_SECRET || 'astra_webhook_secret';

    // Verify HMAC if secret is configured
    if (webhookSecret && webhookSecret !== 'astra_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.id || event.event_id || `${Date.now()}-${Math.random()}`;

    // Deduplicate
    if (await isDuplicate('astra', eventId)) {
      return res.json({ received: true, duplicate: true });
    }

    await storeWebhookEvent('astra', eventId, event);

    // Handle transfer updates
    if (event.type === 'transfer.completed' || event.type === 'transfer.failed') {
      const { data: transfer } = await supabase
        .from('transfers')
        .select('*, groups(*)')
        .eq('provider_transfer_id', event.data?.id || event.data?.transfer_id)
        .single();

      if (transfer) {
        await supabase
          .from('transfers')
          .update({
            status: event.type === 'transfer.completed' ? 'completed' : 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', transfer.id);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Astra webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
