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
app.use(cors({ origin: [/vercel\.app$/, /localhost/] }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

// ========= AUTH MIDDLEWARE =========
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;

  // Create or upsert profile row
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_id', user.id)
    .single();

  if (!existingProfile) {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        auth_id: user.id,
        type: 'human',
        email: user.email,
        current_ip: req.ip,
        last_seen: new Date().toISOString(),
        kyc_status: 'pending',
        status: 'active'
      })
      .select()
      .single();
    req.profile = newProfile;
  } else {
    await supabase
      .from('profiles')
      .update({
        last_seen_ip: existingProfile.current_ip,
        current_ip: req.ip,
        last_seen: new Date().toISOString()
      })
      .eq('id', existingProfile.id);
    req.profile = existingProfile;
  }

  next();
};

// Public routes — no auth required
const publicRoutes = ['/health', '/api/webhooks', '/api/agent'];

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

app.get('/approvals', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('transactions')
    .select('*, cards(name), approvals(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json(error);
  res.json(data || []);
});

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
