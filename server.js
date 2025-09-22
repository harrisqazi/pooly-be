require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// 1) Mount webhook routes FIRST so raw-body can work for signatures
const webhookRouter = require('./webhooks');
app.use('/webhooks', webhookRouter);

// 2) For normal API routes, use JSON body parsing
app.use(cors());
app.use(express.json());

// Idempotency middleware for money-moving routes
const idempotency = require('./middleware/idempotency');

// Funds Engine endpoints (stubs)
app.post('/funds/deposit', idempotency, (req, res) => {
  // TODO: route by rail (acquiring|ach|rtp|fednow|push_to_debit)
  // e.g., if acquiring -> Pay Theory top-up; return a placeholder for now
  return res.json({ ok: true, action: 'deposit', rail: req.body?.rail || 'acquiring' });
});

app.post('/funds/withdraw', idempotency, (req, res) => {
  // TODO: route by rail via Modern Treasury or push-to-debit provider
  return res.json({ ok: true, action: 'withdraw', rail: req.body?.rail || 'ach' });
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('API listening on :' + port));
