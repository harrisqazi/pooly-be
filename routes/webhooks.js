// MODIFIED: 2026-04-11 — Astra handler removed; groups → cards, group_id → card_id;
//   storeWebhookEvent uses confirmed schema; markProcessed added; anomaly_log on HMAC fail
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase, lithic, modernTreasuryClient, payTheoryClient } = require('../config/providers');
const { createLedgerEntry, updateCardBalance } = require('../utils/ledger');

const rawBodyMiddleware = express.raw({ type: 'application/json', limit: '10mb' });

function verifyHMAC(signature, secret, body) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

async function isDuplicate(provider, eventId) {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single();
  return !!data;
}

async function storeWebhookEvent(provider, eventId, event) {
  await supabase.from('webhook_events').insert({
    provider,
    event_id: eventId,
    event_type: event.type || 'unknown',
    payload: event,
    processed: false
  });
}

async function markProcessed(provider, eventId) {
  await supabase
    .from('webhook_events')
    .update({ processed: true })
    .eq('provider', provider)
    .eq('event_id', eventId);
}

/**
 * Lithic webhook handler
 * POST /api/webhooks/lithic
 */
router.post('/lithic', rawBodyMiddleware, async (req, res) => {
  const provider = 'lithic';
  try {
    const signature = req.headers['lithic-signature'] || req.headers['x-lithic-signature'];
    const webhookSecret = process.env.LITHIC_WEBHOOK_SECRET || 'lithic_webhook_secret';

    if (webhookSecret && webhookSecret !== 'lithic_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        await supabase.from('anomaly_log').insert({
          event_type: 'bad_webhook',
          payload: { provider, source_ip: req.ip, reason: 'hmac_mismatch' }
        });
        return res.status(200).json({ received: true, error: 'invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.event_id || event.id || `${Date.now()}-${Math.random()}`;

    console.log(`[WEBHOOK] source=${provider} | event=${event.type || 'unknown'} | id=${eventId} | ip=${req.ip}`);

    if (await isDuplicate(provider, eventId)) return res.json({ received: true, duplicate: true });
    await storeWebhookEvent(provider, eventId, event);

    if (event.type === 'card.created' || event.type === 'card.updated') {
      if (event.data?.token) {
        await supabase
          .from('cards')
          .update({
            card_status: event.data.state || 'OPEN',
            updated_at: new Date().toISOString()
          })
          .eq('card_token', event.data.token);
      }
    } else if (event.type === 'transaction.settled' || event.type === 'transaction.authorization') {
      if (event.data?.card_token) {
        const { data: card } = await supabase
          .from('cards')
          .select('id')
          .eq('card_token', event.data.card_token)
          .single();

        if (card) {
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('*')
            .eq('card_id', card.id)
            .eq('payment_method', 'lithic')
            .eq('description', event.data.token)
            .single();

          if (!existingTx) {
            await supabase.from('transactions').insert({
              card_id: card.id,
              amount: event.data.amount || 0,
              description: event.data.merchant?.name || 'Card transaction',
              merchant_name: event.data.merchant?.name || null,
              status: event.type === 'transaction.settled' ? 'completed' : 'pending',
              payment_method: 'lithic',
              created_at: new Date().toISOString()
            });
          }

          if (event.type === 'transaction.settled') {
            await createLedgerEntry({
              transaction_id: existingTx?.id || null,
              debit_account: 'expenses',
              credit_account: 'cash',
              amount: event.data.amount || 0
            });
            await updateCardBalance(card.id);
          }
        }
      }
    }

    await markProcessed(provider, eventId);
    res.json({ received: true });
  } catch (err) {
    console.error('Lithic webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Modern Treasury webhook handler
 * POST /api/webhooks/modern-treasury
 */
router.post('/modern-treasury', rawBodyMiddleware, async (req, res) => {
  const provider = 'modern_treasury';
  try {
    const signature = req.headers['x-signature'] || req.headers['modern-treasury-signature'];
    const webhookSecret = process.env.MODERN_TREASURY_WEBHOOK_SECRET || 'mt_webhook_secret';

    if (webhookSecret && webhookSecret !== 'mt_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        await supabase.from('anomaly_log').insert({
          event_type: 'bad_webhook',
          payload: { provider, source_ip: req.ip, reason: 'hmac_mismatch' }
        });
        return res.status(200).json({ received: true, error: 'invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.id || event.event_id || `${Date.now()}-${Math.random()}`;

    console.log(`[WEBHOOK] source=${provider} | event=${event.type || 'unknown'} | id=${eventId} | ip=${req.ip}`);

    if (await isDuplicate(provider, eventId)) return res.json({ received: true, duplicate: true });
    await storeWebhookEvent(provider, eventId, event);

    if (event.object === 'payment_order' || event.type === 'payment_order.updated') {
      const paymentOrder = event.data || event;
      const { data: transfer } = await supabase
        .from('transfers')
        .select('*')
        .eq('provider_transfer_id', paymentOrder.id)
        .single();

      if (transfer) {
        await supabase
          .from('transfers')
          .update({ status: paymentOrder.status || 'pending', updated_at: new Date().toISOString() })
          .eq('id', transfer.id);

        if (paymentOrder.status === 'posted' && transfer.direction === 'credit') {
          await createLedgerEntry({
            transaction_id: null,
            debit_account: 'cash',
            credit_account: 'external',
            amount: transfer.amount
          });
          await updateCardBalance(transfer.card_id);
        }
      }
    }

    await markProcessed(provider, eventId);
    res.json({ received: true });
  } catch (err) {
    console.error('Modern Treasury webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pay Theory webhook handler
 * POST /api/webhooks/paytheory
 */
router.post('/paytheory', rawBodyMiddleware, async (req, res) => {
  const provider = 'paytheory';
  try {
    const signature = req.headers['x-paytheory-signature'] || req.headers['paytheory-signature'];
    const webhookSecret = process.env.PAY_THEORY_WEBHOOK_SECRET || 'pt_webhook_secret';

    if (webhookSecret && webhookSecret !== 'pt_webhook_secret') {
      if (!signature || !verifyHMAC(signature, webhookSecret, req.body)) {
        await supabase.from('anomaly_log').insert({
          event_type: 'bad_webhook',
          payload: { provider, source_ip: req.ip, reason: 'hmac_mismatch' }
        });
        return res.status(200).json({ received: true, error: 'invalid signature' });
      }
    }

    const event = JSON.parse(req.body.toString());
    const eventId = event.id || event.event_id || `${Date.now()}-${Math.random()}`;

    console.log(`[WEBHOOK] source=${provider} | event=${event.type || 'unknown'} | id=${eventId} | ip=${req.ip}`);

    if (await isDuplicate(provider, eventId)) return res.json({ received: true, duplicate: true });
    await storeWebhookEvent(provider, eventId, event);

    if (event.type === 'topup.completed' || event.type === 'topup.failed') {
      const { data: topup } = await supabase
        .from('topups')
        .select('*')
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

    await markProcessed(provider, eventId);
    res.json({ received: true });
  } catch (err) {
    console.error('Pay Theory webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
