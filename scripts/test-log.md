# Pooly Auto-Test Log
Generated: 2026-04-13T18:48:40.728Z

# Pooly Auto-Test Log
Started: 2026-04-13T18:48:17.350Z
BASE_URL: https://8e840236-9463-41e3-838e-7c1a148ad062-00-1lm822cdti16a.kirk.replit.dev
CARD_ID: b99854e1-a8a6-4165-a065-44320457b117
AGENT_PROFILE_ID: c2d7497e-33dc-4c2b-9c32-d167268aebc6

## DATABASE FIXES

--- FIX 1: Clean members array ---
✅ FIX 1 PASSED: Clean members array

--- FIX 2: Set spending limits ---
✅ FIX 2 PASSED: Set spending limits

--- FIX 3: Set balance to $1000 ---
✅ FIX 3 PASSED: Set balance to $1000

--- FIX 4: Ensure agent approved and active ---
✅ FIX 4 PASSED: Ensure agent approved and active

✅ All database fixes complete — starting tests

## HTTP TESTS

=== TEST 1: Health check ===
--- Attempt 1 of 5 ---
✅ PASS: Health check
Response: {
  "status": "POOLY BACKEND LIVE",
  "time": "2026-04-13T18:48:20.184Z",
  "providers": {
    "card_issuer": "lithic",
    "bank_rails": "modern_treasury",
    "acquiring": "paytheory",
    "stripe_deposits": true
  }
}

=== TEST 2: Agent token issuance ===
--- Attempt 1 of 5 ---
AGENT_TOKEN saved (first 30 chars): eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
TOKEN_HASH: 4f84f32f61b423727c16ae5b54ee43abc3b16b09ad4d7beed7994552dd47dbd5
✅ PASS: Agent token issuance
Response: {
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlX2lkIjoiYzJkNzQ5N2UtMzNkYy00YzJiLTljMzItZDE2NzI2OGFlYmM2IiwiY2FyZF9pZCI6ImI5OTg1NGUxLWE4YTYtNDE2NS1hMDY1LTQ0MzIwNDU3YjExNyIsInR5cGUiOiJhZ2VudCIsImlhdCI6MTc3NjEwNjEwMCwiZXhwIjoxNzc2MTA5NzAwfQ.Hcubkb96DR-9dUpFCjgtZxbJ1Q4y7cQXTvMilIvP3aY",
  "expires_at": "2026-04-13T19:48:20.911Z",
  "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6"
}

=== TEST 3: Agent pay valid $5 ===
--- Attempt 1 of 5 ---
✅ PASS: Agent pay valid $5
Response: {
  "approved": true,
  "amount_dollars": 5,
  "provider": "lithic",
  "provider_ref": "9754f869-5482-44f3-a4d3-eaf303c8b15a_agent_txn_1776106102702",
  "transaction_id": "d9c06c36-2509-4eec-bba3-80584b3a7311",
  "anomaly_flagged": false
}

=== TEST 4: Agent pay over cap $50 (expect 403) ===
--- Attempt 1 of 5 ---
✅ PASS: Agent pay over cap $50 (expect 403)
Response: {
  "error": "Exceeds per-transaction cap",
  "cap_dollars": 25
}

=== TEST 5: Spend log ===
--- Attempt 1 of 5 ---
✅ PASS: Spend log
Response: {
  "data": [
    {
      "id": "edcc138e-4e29-40bb-b2a7-72acec2e7351",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "4f84f32f61b423727c16ae5b54ee43abc3b16b09ad4d7beed7994552dd47dbd5",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T18:48:24.559427+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "073502d6-6bfe-489c-b0a3-27e64fc71206",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "4f84f32f61b423727c16ae5b54ee43abc3b16b09ad4d7beed7994552dd47dbd5",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T18:48:23.574627+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "2135122a-f2f1-4327-8935-617772115918",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "cbf8890ff56a7c09aec07be931b05884a6dda610a6a98743ee183adb48e2ef9d",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T16:22:36.89384+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "3f7cbf85-341a-4966-9387-f5a9b74efbbb",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "cbf8890ff56a7c09aec07be931b05884a6dda610a6a98743ee183adb48e2ef9d",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T16:22:36.197749+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "31bf46a0-0a1e-4212-b02e-91468509f0c3",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "8057ab6ad67cf98c7959bf0c3a841570593a9adf9cd421147bfddf90fff067ab",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T16:11:40.778488+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "23a3976b-5f20-490d-ac98-b0cd5dddc39f",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "8057ab6ad67cf98c7959bf0c3a841570593a9adf9cd421147bfddf90fff067ab",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T16:11:40.14977+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    }
  ],
  "total_count": 6,
  "limit": 50,
  "offset": 0
}

=== TEST 6: Agent audit ===
--- Attempt 1 of 5 ---
✅ PASS: Agent audit
Response: {
  "data": [
    {
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "model_version": "2024-11",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d",
      "kyc_status": "approved",
      "risk_level": "low",
      "total_spent_dollars": 15,
      "transaction_count": 3,
      "blocked_count": 3,
      "anomaly_count": 0,
      "last_seen": "2026-04-13T18:48:24.559427+00:00",
      "flagged": true
    }
  ]
}

=== TEST 7: Agent risk scores ===
--- Attempt 1 of 5 ---
✅ PASS: Agent risk scores
Response: {
  "data": [
    {
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "type": "agent",
      "name": "gpt4-purchasing-bot",
      "email": null,
      "current_ip": "127.0.0.1",
      "kyc_status": "approved",
      "anomaly_count": 4,
      "total_risk_score": 78,
      "last_anomaly": "2026-04-13T18:48:24.717493+00:00",
      "anomaly_types": [
        "new_ip",
        "rule_breach"
      ],
      "risk_level": "medium"
    },
    {
      "profile_id": "ecbd07cb-9227-421a-91e2-24f22a20e7da",
      "type": "human",
      "name": "Unknown",
      "email": "harrisahmedqazi@gmail.com",
      "current_ip": null,
      "kyc_status": "pending",
      "anomaly_count": 0,
      "total_risk_score": 0,
      "last_anomaly": null,
      "anomaly_types": null,
      "risk_level": "low"
    }
  ]
}

=== TEST 8: Revoke token ===
--- Attempt 1 of 5 ---
✅ PASS: Revoke token
Response: {
  "revoked": true
}

=== TEST 9: Revoked token rejected ===
--- Attempt 1 of 5 ---
✅ PASS: Revoked token rejected
Response: {
  "error": "Token revoked"
}

=== TEST 10: List agents on card ===
--- Attempt 1 of 5 ---
✅ PASS: List agents on card
Response: {
  "data": [
    {
      "id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "auth_id": null,
      "type": "agent",
      "first_name": "gpt4-purchasing-bot",
      "last_name": null,
      "email": null,
      "phone": null,
      "current_ip": "127.0.0.1",
      "last_seen_ip": null,
      "last_seen": "2026-04-13T18:48:23.652+00:00",
      "model_name": "gpt-4o",
      "model_version": "2024-11",
      "system_prompt_hash": "39e5573d66dbe5b1e09f7630a85b9f0e7f77660fca92ad1cd999628614e081b6",
      "owner_id": "ecbd07cb-9227-421a-91e2-24f22a20e7da",
      "kyc_status": "approved",
      "kyc_submitted_at": null,
      "kyc_approved_at": "2026-04-12T07:55:24.621+00:00",
      "status": "active",
      "suspension_reason": null,
      "created_at": "2026-04-11T22:18:18.812426+00:00",
      "updated_at": "2026-04-11T22:18:18.812426+00:00",
      "kyc": {
        "id": "e9bf50e6-8cf2-495a-9e4f-7cefea077ee0",
        "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
        "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d",
        "date_of_birth": null,
        "ssn_last_four": null,
        "ssn_hash": null,
        "address_line1": null,
        "address_line2": null,
        "city": null,
        "state": null,
        "zip": null,
        "country": "US",
        "id_type": null,
        "id_number_hash": null,
        "id_verified": false,
        "id_verified_at": null,
        "model_card_url": null,
        "intended_use": "autonomous payment agent",
        "risk_level": "low",
        "submitted_at": null,
        "reviewed_at": "2026-04-12T07:55:25.074+00:00",
        "reviewed_by": null,
        "created_at": "2026-04-11T22:18:18.992681+00:00",
        "updated_at": "2026-04-11T22:18:18.992681+00:00"
      }
    }
  ]
}

## USER AUTH TESTS

=== TEST 11: Get user JWT ===
--- Attempt 1 of 5 ---
✅ PASS: Get user JWT
Response: {
  "access_token": "eyJhbGciOiJIUzI1NiIsImtpZCI6In..."
}

=== TEST 12: Profile created on login ===
--- Attempt 1 of 5 ---
✅ PASS: Profile created on login
Response: {
  "id": "5fe6ba1e-f02b-400f-959c-8442532396f8",
  "auth_id": "79ad6c1b-d44d-4470-98e1-be337e519999",
  "type": "human",
  "first_name": null,
  "last_name": null,
  "email": "test@pooly.com",
  "phone": null,
  "current_ip": "127.0.0.1",
  "last_seen_ip": null,
  "last_seen": "2026-04-13T18:48:27.964+00:00",
  "model_name": null,
  "model_version": null,
  "system_prompt_hash": null,
  "owner_id": null,
  "kyc_status": "pending",
  "kyc_submitted_at": null,
  "kyc_approved_at": null,
  "status": "active",
  "suspension_reason": null,
  "created_at": "2026-04-13T18:48:28.026427+00:00",
  "updated_at": "2026-04-13T18:48:28.026427+00:00",
  "kyc": null
}

=== TEST 13: Update profile ===
--- Attempt 1 of 5 ---
✅ PASS: Update profile
Response: {
  "id": "5fe6ba1e-f02b-400f-959c-8442532396f8",
  "auth_id": "79ad6c1b-d44d-4470-98e1-be337e519999",
  "type": "human",
  "first_name": "Harris",
  "last_name": "Qazi",
  "email": "test@pooly.com",
  "phone": "5551234567",
  "current_ip": "127.0.0.1",
  "last_seen_ip": "127.0.0.1",
  "last_seen": "2026-04-13T18:48:28.581+00:00",
  "model_name": null,
  "model_version": null,
  "system_prompt_hash": null,
  "owner_id": null,
  "kyc_status": "pending",
  "kyc_submitted_at": null,
  "kyc_approved_at": null,
  "status": "active",
  "suspension_reason": null,
  "created_at": "2026-04-13T18:48:28.026427+00:00",
  "updated_at": "2026-04-13T18:48:28.73+00:00"
}

=== TEST 14: KYC submission ===
--- Attempt 1 of 5 ---
✅ PASS: KYC submission
Response: {
  "submitted": true,
  "fingerprint": "4348d576952700b332e42d72713dcbec5118f0b038281c03d79726acc2f13edc"
}

=== TEST 15: Create card ===
--- Attempt 1 of 5 ---
❌ FAIL attempt 1: Card creation failed: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
HTTP Status: 500
Response: {
  "error": "null value in column \"group_code\" of relation \"cards\" violates not-null constraint"
}
Matched predicted cause: no
Running diagnoseAndFix...
POST /api/cards response: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
USER_PROFILE_ID: 5fe6ba1e-f02b-400f-959c-8442532396f8
Check routes/cards.js POST / handler
Verify invite_code generation and members array init
Retrying test 15...
--- Attempt 2 of 5 ---
❌ FAIL attempt 2: Card creation failed: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
HTTP Status: 500
Response: {
  "error": "null value in column \"group_code\" of relation \"cards\" violates not-null constraint"
}
Matched predicted cause: no
Running diagnoseAndFix...
POST /api/cards response: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
USER_PROFILE_ID: 5fe6ba1e-f02b-400f-959c-8442532396f8
Check routes/cards.js POST / handler
Verify invite_code generation and members array init
Retrying test 15...
--- Attempt 3 of 5 ---
❌ FAIL attempt 3: Card creation failed: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
HTTP Status: 500
Response: {
  "error": "null value in column \"group_code\" of relation \"cards\" violates not-null constraint"
}
Matched predicted cause: no
Running diagnoseAndFix...
POST /api/cards response: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
USER_PROFILE_ID: 5fe6ba1e-f02b-400f-959c-8442532396f8
Check routes/cards.js POST / handler
Verify invite_code generation and members array init
Retrying test 15...
--- Attempt 4 of 5 ---
❌ FAIL attempt 4: Card creation failed: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
HTTP Status: 500
Response: {
  "error": "null value in column \"group_code\" of relation \"cards\" violates not-null constraint"
}
Matched predicted cause: no
Running diagnoseAndFix...
POST /api/cards response: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
USER_PROFILE_ID: 5fe6ba1e-f02b-400f-959c-8442532396f8
Check routes/cards.js POST / handler
Verify invite_code generation and members array init
Retrying test 15...
--- Attempt 5 of 5 ---
❌ FAIL attempt 5: Card creation failed: {"error":"null value in column \"group_code\" of relation \"cards\" violates not-null constraint"}
HTTP Status: 500
Response: {
  "error": "null value in column \"group_code\" of relation \"cards\" violates not-null constraint"
}
Matched predicted cause: no
🛑 EXHAUSTED 5 ATTEMPTS on TEST 15
Full history for this test:
[
  {
    "attempt": 1,
    "error": "Card creation failed: {\"error\":\"null value in column \\\"group_code\\\" of relation \\\"cards\\\" violates not-null constraint\"}",
    "hypothesis": "unknown",
    "fixApplied": "none",
    "result": "fail",
    "timestamp": "2026-04-13T18:48:30.344Z"
  },
  {
    "attempt": 2,
    "error": "Card creation failed: {\"error\":\"null value in column \\\"group_code\\\" of relation \\\"cards\\\" violates not-null constraint\"}",
    "hypothesis": "unknown",
    "fixApplied": "none",
    "result": "fail",
    "timestamp": "2026-04-13T18:48:32.962Z"
  },
  {
    "attempt": 3,
    "error": "Card creation failed: {\"error\":\"null value in column \\\"group_code\\\" of relation \\\"cards\\\" violates not-null constraint\"}",
    "hypothesis": "unknown",
    "fixApplied": "none",
    "result": "fail",
    "timestamp": "2026-04-13T18:48:35.536Z"
  },
  {
    "attempt": 4,
    "error": "Card creation failed: {\"error\":\"null value in column \\\"group_code\\\" of relation \\\"cards\\\" violates not-null constraint\"}",
    "hypothesis": "unknown",
    "fixApplied": "none",
    "result": "fail",
    "timestamp": "2026-04-13T18:48:38.141Z"
  },
  {
    "attempt": 5,
    "error": "Card creation failed: {\"error\":\"null value in column \\\"group_code\\\" of relation \\\"cards\\\" violates not-null constraint\"}",
    "hypothesis": "unknown",
    "fixApplied": "none",
    "result": "fail",
    "timestamp": "2026-04-13T18:48:40.727Z"
  }
]
RECOMMENDED MANUAL FIX:
Check POST /api/cards route — invite_code and members must be set on create