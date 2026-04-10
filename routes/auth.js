// Auth routes - JWT verification via Supabase
const express = require('express');
const router = express.Router();
const { supabase, astraOAuthClient, ASTRA_CLIENT_ID } = require('../config/providers');
const axios = require('axios');

/**
 * Verify JWT token
 * GET /api/auth/verify
 */
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token', details: error?.message });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Token verification failed', details: error.message });
  }
});

/**
 * Get current user info
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    id: req.user.id,
    email: req.user.email,
    metadata: req.user.user_metadata
  });
});

/**
 * Astra OAuth callback - exchange code for access token
 * POST /api/auth/astra/callback
 * 
 * Body: { code: string, redirect_uri: string }
 */
router.post('/astra/callback', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Get user from JWT token (user must be authenticated)
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in first.' });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Validate redirect_uri matches expected values
    const validRedirectUris = [
      'https://pooly-fe-harrisqazi.vercel.app/oauth/astra/callback',
      'http://localhost:5173/oauth/astra/callback',
      process.env.ASTRA_REDIRECT_URI
    ].filter(Boolean);

    const finalRedirectUri = redirect_uri || validRedirectUris[0];
    
    if (!validRedirectUris.includes(finalRedirectUri)) {
      console.warn(`Invalid redirect_uri: ${finalRedirectUri}. Expected one of: ${validRedirectUris.join(', ')}`);
    }

    // Exchange authorization code for access token
    const tokenResponse = await axios.post(
      'https://api.astra.finance/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: finalRedirectUri
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: {
          username: process.env.ASTRA_CLIENT_ID || ASTRA_CLIENT_ID || 'astra_placeholder',
          password: process.env.ASTRA_CLIENT_SECRET || 'astra_placeholder'
        }
      }
    );

    const { access_token, refresh_token, expires_in, token_type } = tokenResponse.data;

    if (!access_token) {
      return res.status(500).json({ error: 'Failed to obtain access token from Astra' });
    }

    // Store token in users_extended table
    // First, check if record exists
    const { data: existingRecord } = await supabase
      .from('users_extended')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const tokenData = {
      user_id: user.id,
      astra_token: access_token,
      astra_refresh_token: refresh_token || null,
      astra_token_expires_at: expires_in 
        ? new Date(Date.now() + expires_in * 1000).toISOString()
        : null,
      astra_token_type: token_type || 'Bearer',
      updated_at: new Date().toISOString()
    };

    let result;
    if (existingRecord) {
      // Update existing record
      const { data, error } = await supabase
        .from('users_extended')
        .update(tokenData)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }
      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('users_extended')
        .insert({
          ...tokenData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }
      result = data;
    }

    res.json({
      success: true,
      message: 'Astra OAuth connection successful',
      user_id: user.id,
      token_stored: true,
      expires_at: tokenData.astra_token_expires_at
    });
  } catch (error) {
    console.error('Astra OAuth callback error:', error);
    
    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        return res.status(400).json({ 
          error: 'Invalid authorization code or redirect URI',
          details: data 
        });
      } else if (status === 401) {
        return res.status(401).json({ 
          error: 'Astra OAuth authentication failed. Please check your client credentials.',
          details: data 
        });
      }
      
      return res.status(status).json({ 
        error: 'Astra OAuth token exchange failed',
        details: data 
      });
    }

    res.status(500).json({ 
      error: 'Internal server error during OAuth callback',
      details: error.message 
    });
  }
});

module.exports = router;
