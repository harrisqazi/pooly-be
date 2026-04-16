// MODIFIED: 2026-04-11 — authMiddleware creates/upserts profiles row;
//   route mounts updated to /api/cards (wallet) and /api/lithic (Lithic ops);
//   all groups table references removed; Astra test route removed
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { supabase } = require('./config/providers');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true)
    if (
      origin.endsWith('.vercel.app') ||
      origin === 'http://localhost:5173' ||
      origin === 'http://localhost:3000'
    ) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// ========= AUTH MIDDLEWARE =========
const authMiddleware = require('./middleware/auth');

// Public routes — no auth required
const publicRoutes = ['/health', '/api/webhooks', '/api/agent', '/api/dev'];

app.use((req, res, next) => {
  const isPublic = publicRoutes.some(route => req.path.startsWith(route));
  if (isPublic) return next();
  return authMiddleware(req, res, next);
});

// ========= ROUTES =========
const authRoutes = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const lithicRoutes = require('./routes/lithic');
const transactionsRoutes = require('./routes/transactions');
const transfersRoutes = require('./routes/transfers');
const topupsRoutes = require('./routes/topups');
const webhooksRoutes = require('./routes/webhooks');
const agentRoutes = require('./routes/agent');

app.use('/api/auth', authRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/lithic', lithicRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/topups', topupsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/agent', agentRoutes);

// ========= POST /api/cards/create (Lithic virtual card) =========
app.post('/api/cards/create', async (req, res) => {
  try {
    const { groupId, monthlyLimit = 500000 } = req.body;
    if (!groupId) {
      return res.status(400).json({ error: 'Missing groupId' });
    }

    const monthlyLimitNum = Number(monthlyLimit);
    if (!Number.isInteger(monthlyLimitNum)) {
      return res.status(400).json({
        error: 'monthlyLimit must be an integer',
        received: monthlyLimit
      });
    }

    const { lithic } = require('./config/providers');
    const card = await lithic.cards.create({
      type: 'VIRTUAL',
      spend_limit: monthlyLimitNum,
      spend_limit_duration: 'FOREVER'
    });

    const { error: updateError } = await supabase
      .from('cards')
      .update({ card_token: card.token })
      .eq('id', groupId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    const { error: cardInsertError } = await supabase
      .from('cards')
      .update({
        card_token: card.token,
        card_status: card.state || 'OPEN'
      })
      .eq('id', groupId);

    if (cardInsertError) {
      return res.status(500).json({ error: cardInsertError.message });
    }

    res.json({
      success: true,
      cardToken: card.token,
      message: 'Virtual card created for group'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========= LEGACY INLINE ROUTES (updated — cards table) =========
app.get('/cards', async (req, res) => {
  if (!req.user || !req.profile) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .or(`owner_id.eq.${req.user.id},members.cs.["${req.profile.id}"]`)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Approvals are served at GET /api/transactions/approvals (routes/transactions.js)

// ========= TEST ROUTES =========
app.get('/api/lithic/test', async (req, res) => {
  try {
    const { lithic } = require('./config/providers');
    const cards = await lithic.cards.list({ limit: Number(1) });
    res.json({
      success: true,
      message: 'Lithic API connected!',
      cards_count: cards.data.length,
      first_card: cards.data[0] || 'No cards yet'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/modern-treasury/test', authMiddleware, async (req, res) => {
  try {
    const { modernTreasuryClient } = require('./config/providers');
    const response = await modernTreasuryClient.get('/accounts', { params: { per_page: 5 } });
    res.json({ success: true, message: 'Modern Treasury connection successful', accounts: response.data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

app.get('/api/paytheory/test', authMiddleware, async (req, res) => {
  try {
    const { payTheoryClient } = require('./config/providers');
    const response = await payTheoryClient.get('/accounts');
    res.json({ success: true, message: 'Pay Theory connection successful', accounts: response.data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// ========= HEALTH =========
app.get('/health', (req, res) => res.json({
  status: 'POOLY BACKEND LIVE',
  time: new Date(),
  providers: {
    card_issuer: 'lithic',
    bank_rails: process.env.PROVIDER_BANK_RAILS || 'modern_treasury',
    acquiring: process.env.PROVIDER_ACQUIRING || 'paytheory',
    stripe_deposits: process.env.PROVIDER_STRIPE === 'true'
  }
}));

// ========= DEV ONLY: test-token =========
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/test-token', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: error.message });
      return res.json({
        access_token: data.session.access_token,
        user_id: data.user.id,
        email: data.user.email,
        expires_at: data.session.expires_at
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}

// ========= TEST AUTH ROUTE =========
app.get('/api/test-auth', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No user — token missing or invalid' });
  res.json({ success: true, userId: req.user.id, profileId: req.profile?.id, message: 'JWT verified! Backend sees you.' });
});

const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log(`POOLY-BE LIVE ON PORT ${port}`);
  console.log(`Provider config: ISSUING=${process.env.PROVIDER_ISSUING || 'lithic'}, BANK_RAILS=${process.env.PROVIDER_BANK_RAILS || 'modern_treasury'}, ACQUIRING=${process.env.PROVIDER_ACQUIRING || 'paytheory'}`);
});
