// MODIFIED: 2026-04-11 — remove Astra clients; keep supabase, lithic,
//   modernTreasuryClient, payTheoryClient, stripe, PROVIDER_* flags
require('dotenv').config();
const Lithic = require('lithic');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL?.trim() || 'https://txudnxchbsruohnstznk.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dWRueGNoYnNydW9obnN0em5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NjU5ODIsImV4cCI6MjA3NzI0MTk4Mn0.buWxGSci7tYHM-DPtXoronTgEKOhID0JyaIwx-pNMvk';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);

// Provider flags
const PROVIDER_ISSUING = process.env.PROVIDER_ISSUING || 'lithic';
const PROVIDER_BANK_RAILS = process.env.PROVIDER_BANK_RAILS || 'modern_treasury';
const PROVIDER_ACQUIRING = process.env.PROVIDER_ACQUIRING || 'paytheory';

// Lithic (Virtual Cards)
const lithic = new Lithic({
  apiKey: process.env.LITHIC_API_KEY || 'b931a00b-fb14-4d81-b6fa-ec5153f87153',
  environment: 'sandbox'
});

// Modern Treasury (ACH/Wire/FedNow)
const MODERN_TREASURY_ORG_ID = process.env.MODERN_TREASURY_ORG_ID || '7e7f7655-25ec-4ff6-87fe-e1735f14ad87';
const MODERN_TREASURY_API_KEY = process.env.MODERN_TREASURY_API_KEY || process.env.MODERN_TREASURY_PUBLISHABLE_KEY || 'publishable-test-OTRkOGNiNWYtMzZjNy00YjU2LWIyZjMtZmRjNGIwNWNmNzhlOkxrVW1zZ0dqQ1gySHk0WEFWeERZd1dRVE5LWGpLU0NWRFNMWmJWd0RQTjFicWlrNEtrOW9EeXNTVkxxNjRBcXM=';
const MODERN_TREASURY_BASE_URL = 'https://app.moderntreasury.com/api';

const modernTreasuryClient = axios.create({
  baseURL: MODERN_TREASURY_BASE_URL,
  auth: {
    username: MODERN_TREASURY_ORG_ID,
    password: MODERN_TREASURY_API_KEY
  },
  headers: { 'Content-Type': 'application/json' }
});

// Pay Theory (Card Top-ups)
const PAY_THEORY_API_KEY = process.env.PAY_THEORY_API_KEY || 'pt_sandbox_placeholder';
const PAY_THEORY_BASE_URL = process.env.PAY_THEORY_BASE_URL || 'https://api.paytheory.com';

const payTheoryClient = axios.create({
  baseURL: PAY_THEORY_BASE_URL,
  headers: {
    'Authorization': `Bearer ${PAY_THEORY_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Test account IDs
const TEST_ACCOUNTS = {
  modern_treasury: process.env.MT_TEST_ACCOUNT_ID || 'fake_test_id',
  paytheory: process.env.PT_TEST_ACCOUNT_ID || 'pt_test_account_123'
};

// Stripe (optional — only initialized when PROVIDER_STRIPE=true)
const stripe = process.env.PROVIDER_STRIPE === 'true'
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

module.exports = {
  supabase,
  lithic,
  modernTreasuryClient,
  payTheoryClient,
  stripe,
  PROVIDER_ISSUING,
  PROVIDER_BANK_RAILS,
  PROVIDER_ACQUIRING,
  TEST_ACCOUNTS,
  MODERN_TREASURY_ORG_ID
};
