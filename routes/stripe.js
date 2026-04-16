const express = require('express');
const router = express.Router();
const { supabase, stripe } = require('../config/providers');

/**
 * POST /api/stripe/create-card
 * Creates a Stripe Issuing cardholder using the authenticated user's
 * profile and KYC data, then issues a virtual card.
 */
router.post('/create-card', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not enabled on this instance' });
    }

    const profile = req.profile;
    if (!profile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch KYC details for this user
    const { data: kyc, error: kycError } = await supabase
      .from('kyc_details')
      .select('*')
      .eq('profile_id', profile.id)
      .single();

    if (kycError || !kyc) {
      return res.status(400).json({
        error: 'Please complete identity verification before creating a card',
        kyc_required: true
      });
    }

    // Require at minimum: address and date of birth
    if (!kyc.address_line1 || !kyc.city || !kyc.state || !kyc.zip || !kyc.date_of_birth) {
      return res.status(400).json({
        error: 'Please complete identity verification before creating a card',
        kyc_required: true
      });
    }

    // Parse date of birth — stored as 'YYYY-MM-DD'
    const [year, month, day] = kyc.date_of_birth.split('-').map(Number);

    const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;

    const cardholderPayload = {
      type: 'individual',
      name,
      email: profile.email,
      billing: {
        address: {
          line1: kyc.address_line1,
          line2: kyc.address_line2 || undefined,
          city: kyc.city,
          state: kyc.state,
          postal_code: kyc.zip,
          country: kyc.country || 'US'
        }
      },
      individual: {
        dob: { day, month, year }
      }
    };

    if (profile.phone_number) {
      cardholderPayload.phone_number = profile.phone_number;
    }

    // Use full SSN hash if available, fall back to ssn_last_four
    const idNumber = kyc.ssn_hash || kyc.ssn_last_four;
    if (idNumber) {
      cardholderPayload.individual.id_number = idNumber;
    }

    // Create Stripe cardholder
    const cardholder = await stripe.issuing.cardholders.create(cardholderPayload);

    // Issue a virtual card for the cardholder
    const card = await stripe.issuing.cards.create({
      cardholder: cardholder.id,
      currency: 'usd',
      type: 'virtual',
      status: 'active'
    });

    // Store the Stripe card token on the user's card record if a card_id was passed
    const { card_id } = req.body;
    if (card_id) {
      await supabase
        .from('cards')
        .update({ card_token: card.id, card_status: card.status })
        .eq('id', card_id);
    }

    return res.status(201).json({
      success: true,
      cardholder_id: cardholder.id,
      card_id: card.id,
      last4: card.last4,
      status: card.status
    });
  } catch (err) {
    console.error('Stripe create-card error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
