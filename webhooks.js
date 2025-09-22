const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { alreadyProcessed, markProcessed } = require('./middleware/dedupeEvent');

// Verify HMAC signature (hex) with SHA-256 over the raw body (and timestamp if required)
function verifyHmac(rawBody, headerSig, secret) {
  if (!headerSig || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(headerSig, 'hex'));
  } catch {
    return false;
  }
}

// PAY THEORY (PayFac) webhooks
router.post('/acquiring', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.get('X-Signature'); // header name may differ; adjust to their docs
  const ok = verifyHmac(req.body, sig, process.env.PAYTHEORY_SIGNING_SECRET);
  if (!ok) return res.status(400).send('bad signature');

  const evt = JSON.parse(req.body.toString('utf8'));
  if (alreadyProcessed(evt.id)) return res.sendStatus(200);

  // TODO: enqueue -> update ledger_entries based on evt.type (e.g., payment.captured)
  markProcessed(evt.id);
  res.sendStatus(200);
});

// MODERN TREASURY (bank rails) webhooks
router.post('/bank', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.get('X-Signature');
  const ok = verifyHmac(req.body, sig, process.env.MODERN_TREASURY_SIGNING_SECRET);
  if (!ok) return res.status(400).send('bad signature');

  const evt = JSON.parse(req.body.toString('utf8'));
  if (alreadyProcessed(evt.id)) return res.sendStatus(200);

  // TODO: ledger update for credit_received, payment_sent, return, etc.
  markProcessed(evt.id);
  res.sendStatus(200);
});

// LITHIC (issuing) webhooks
router.post('/issuing', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.get('X-Signature');
  const ok = verifyHmac(req.body, sig, process.env.LITHIC_SIGNING_SECRET);
  if (!ok) return res.status(400).send('bad signature');

  const evt = JSON.parse(req.body.toString('utf8'));
  if (alreadyProcessed(evt.id)) return res.sendStatus(200);

  // TODO: handle auth.request (approve/deny), transaction.clearing, reversal → ledger
  markProcessed(evt.id);
  res.sendStatus(200);
});

module.exports = router;
