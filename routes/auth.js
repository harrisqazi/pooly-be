// MODIFIED: 2026-04-11 — remove Astra callback; add GET /profile, PUT /profile,
//   POST /kyc endpoints using profiles and kyc_details tables
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('../config/providers');

/**
 * Verify JWT token
 * GET /api/auth/verify
 */
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token', details: error?.message });

    res.json({
      valid: true,
      user: { id: user.id, email: user.email, metadata: user.user_metadata }
    });
  } catch (err) {
    res.status(500).json({ error: 'Token verification failed', details: err.message });
  }
});

/**
 * Get current user from req.user (set by authMiddleware)
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    id: req.user.id,
    email: req.user.email,
    metadata: req.user.user_metadata
  });
});

/**
 * Get full profile including KYC details
 * GET /api/auth/profile
 */
router.get('/profile', async (req, res) => {
  if (!req.profile) return res.status(401).json({ error: 'Not authenticated' });

  const { data: kyc } = await supabase
    .from('kyc_details')
    .select('*')
    .eq('profile_id', req.profile.id)
    .single();

  res.json({ ...req.profile, kyc: kyc || null });
});

/**
 * Update profile fields
 * PUT /api/auth/profile
 * Body: { first_name, last_name, phone }
 */
router.put('/profile', async (req, res) => {
  if (!req.profile) return res.status(401).json({ error: 'Not authenticated' });

  const { first_name, last_name, phone } = req.body;

  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name,
      last_name,
      phone,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.profile.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * Submit KYC information
 * POST /api/auth/kyc
 * Body: { first_name, last_name, date_of_birth, ssn_last_four,
 *         address_line1, address_line2, city, state, zip, id_type }
 */
router.post('/kyc', async (req, res) => {
  if (!req.profile) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const {
      first_name, last_name, date_of_birth, ssn_last_four,
      address_line1, address_line2, city, state, zip, id_type
    } = req.body;

    const ssn_hash = crypto
      .createHash('sha256')
      .update(ssn_last_four + req.profile.id)
      .digest('hex');

    const fingerprint = crypto
      .createHash('sha256')
      .update(ssn_hash + date_of_birth + first_name.toLowerCase() + last_name.toLowerCase())
      .digest('hex');

    // Check for duplicate identity
    const { data: duplicate } = await supabase
      .from('kyc_details')
      .select('profile_id')
      .eq('fingerprint', fingerprint)
      .neq('profile_id', req.profile.id)
      .single();

    if (duplicate) {
      return res.status(409).json({ error: 'Identity already registered' });
    }

    const { error: kycError } = await supabase
      .from('kyc_details')
      .upsert({
        profile_id: req.profile.id,
        fingerprint,
        date_of_birth,
        ssn_last_four,
        ssn_hash,
        address_line1,
        address_line2: address_line2 || null,
        city,
        state,
        zip,
        id_type,
        submitted_at: new Date().toISOString()
      }, { onConflict: 'profile_id' });

    if (kycError) return res.status(500).json({ error: kycError.message });

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name,
        last_name,
        kyc_status: 'pending',
        kyc_submitted_at: new Date().toISOString()
      })
      .eq('id', req.profile.id);

    if (profileError) return res.status(500).json({ error: profileError.message });

    res.json({ submitted: true, fingerprint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
