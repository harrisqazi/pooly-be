require('dotenv').config();  // Make sure this is at the VERY TOP if not already
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
  next();
};

// Public routes that don't require authentication
// Note: /api/auth/astra/callback requires auth but is handled in the route itself
const publicRoutes = ['/health', '/api/webhooks', '/api/agent'];

// Apply auth middleware globally except for public routes
app.use((req, res, next) => {
  // Check if path starts with any public route
  const isPublic = publicRoutes.some(route => req.path.startsWith(route));
  if (isPublic) {
    return next();
  }
  return authMiddleware(req, res, next);
});

// ========= ROUTES =========
const authRoutes = require('./routes/auth');
const groupsRoutes = require('./routes/groups');
const transactionsRoutes = require('./routes/transactions');
const cardsRoutes = require('./routes/cards');
const transfersRoutes = require('./routes/transfers');
const topupsRoutes = require('./routes/topups');
const webhooksRoutes = require('./routes/webhooks');
const agentRoutes = require('./routes/agent');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/topups', topupsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/agent', agentRoutes);

// Legacy routes for backward compatibility
// These routes are kept for backward compatibility but use the new route handlers
app.get('/groups', async (req, res) => {
  const { supabase } = require('./config/providers');
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .or(`owner_id.eq.${req.user.id},member_ids.cs.{${req.user.id}}`)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/groups', async (req, res) => {
  const { supabase } = require('./config/providers');
  const { name, description } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name,
      description,
      owner_id: req.user.id,
      group_code: code,
      member_ids: [req.user.id],
      total_balance: 0
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/approvals', async (req, res) => {
  const { supabase } = require('./config/providers');
  const { data, error } = await supabase
    .from('transactions')
    .select('*, groups(name), approvals(*)')
    .eq('status', 'pending')
    .or(`approver_ids.cs.{${req.user.id}},owner_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json(error);
  res.json(data || []);
});

// ========= TEST ROUTES =========
app.get('/api/lithic/test', async (req, res) => {
  try {
    const { lithic } = require('./config/providers');
    const cards = await lithic.cards.list({ limit: Number(1) });  // Explicit integer
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

app.get('/api/paytheory/test', authMiddleware, async (req, res) => {
  try {
    const { payTheoryClient } = require('./config/providers');
    const response = await payTheoryClient.get('/accounts');
    res.json({
      success: true,
      message: 'Pay Theory connection successful',
      accounts: response.data || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

app.get('/api/astra/test', authMiddleware, async (req, res) => {
  try {
    const { astraClient } = require('./config/providers');
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

// ========= HEALTH =========
app.get('/health', (req, res) => res.json({
  status: 'POOLY BACKEND LIVE',
  time: new Date(),
  providers: {
    issuing: process.env.PROVIDER_ISSUING || 'lithic',
    bank_rails: process.env.PROVIDER_BANK_RAILS || 'modern_treasury',
    acquiring: process.env.PROVIDER_ACQUIRING || 'paytheory',
    stripe_enabled: process.env.PROVIDER_STRIPE === 'true'
  }
}));

// ========= TEST AUTH ROUTE =========
app.get('/api/test-auth', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No user — token missing or invalid' });
  res.json({ success: true, userId: req.user.id, message: 'JWT verified! Backend sees you.' });
});

// ========= LITHIC CARD CREATION (REAL) =========
app.post('/api/cards/create', async (req, res) => {
  try {
    const { groupId, dailyLimit = 50000, monthlyLimit = 500000 } = req.body;
    if (!groupId) return res.status(400).json({ error: 'Missing groupId' });

    const { lithic } = require('./config/providers');

    // Lithic requires `spend_limit.amount` to be an integer (in cents).
    // Postman commonly sends numbers as strings, so we coerce + validate strictly.
    const monthlyLimitNum = Number(monthlyLimit);
    if (!Number.isInteger(monthlyLimitNum)) {
      return res.status(400).json({
        error: 'monthlyLimit must be an integer',
        received: monthlyLimit,
        parsed: monthlyLimitNum
      });
    }

    const card = await lithic.cards.create({
      type: 'VIRTUAL',
      // Lithic expects `spend_limit` to be an integer and `spend_limit_duration`
      // to be a separate field.
      spend_limit: monthlyLimitNum,
      spend_limit_duration: 'FOREVER'
    });

    // Save card token to your groups table
    const { error: updateError } = await supabase
      .from('groups')
      .update({ card_token: card.token })
      .eq('id', groupId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Also insert into `cards` table so `/api/cards?group_id=...` returns it.
    const { error: cardInsertError } = await supabase
      .from('cards')
      .insert({
        group_id: groupId,
        lithic_card_token: card.token,
        card_type: 'VIRTUAL',
        status: card.state || 'OPEN',
        spend_limit: monthlyLimitNum,
        spend_limit_duration: 'FOREVER',
        owner_id: req.user.id,
        created_at: new Date().toISOString()
      });

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

const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log(`POOLY-BE LIVE ON PORT ${port}`);
  console.log(`Provider config: ISSUING=${process.env.PROVIDER_ISSUING || 'lithic'}, BANK_RAILS=${process.env.PROVIDER_BANK_RAILS || 'modern_treasury'}, ACQUIRING=${process.env.PROVIDER_ACQUIRING || 'paytheory'}`);
});
