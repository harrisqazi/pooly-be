require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(helmet());
app.use(cors({ origin: [/vercel\.app$/, /localhost/] }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

const supabase = createClient(
  process.env.SUPABASE_URL,     // ← This is the HTTP URL
  process.env.SUPABASE_ANON_KEY // ← This is the anon key
);

// ========= AUTH MIDDLEWARE =========
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
};

// ========= GROUPS =========
app.get('/groups', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .or(`owner_id.eq.${req.user.id},member_ids.cs.{${req.user.id}}`)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/groups', authMiddleware, async (req, res) => {
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

// ========= APPROVALS =========
app.get('/approvals', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, groups(name), approvals(*)')
    .eq('status', 'pending')
    .or(`approver_ids.cs.{${req.user.id}},owner_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json(error);
  res.json(data || []);
});

// ========= FUNDS ENGINE (SANDBOX MODE) =========
app.post('/funds/deposit', authMiddleware, async (req, res) => {
  const { group_id, amount } = req.body;

  // In real life: route to Pay Theory → Modern Treasury
  // Right now: instant sandbox success
  const { error } = await supabase
    .from('groups')
    .update({ total_balance: supabase.raw(`total_balance + ${amount}`) })
    .eq('id', group_id);

  if (error) return res.status(500).json(error);
  res.json({ success: true, new_balance: 'instant sandbox credit' });
});

app.post('/funds/withdraw', authMiddleware, async (req, res) => {
  // Same — instant sandbox
  res.json({ success: true, status: 'processed via Modern Treasury sandbox' });
});

// ========= HEALTH =========
app.get('/health', (req, res) => res.json({ status: 'POOLY BACKEND LIVE', time: new Date() }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`POOLY-BE LIVE ON PORT ${port}`);
});
