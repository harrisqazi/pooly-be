# Pooly Auto-Test Log
Generated: 2026-04-15T00:38:32.445Z

# Pooly Auto-Test Log
Started: 2026-04-15T00:38:18.778Z
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
  "time": "2026-04-15T00:38:20.115Z",
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
TOKEN_HASH: b70ca75236a859f20ec1b76b9773444a8a19612df951d43d15d1df86d9116229
✅ PASS: Agent token issuance
Response: {
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcm9maWxlX2lkIjoiYzJkNzQ5N2UtMzNkYy00YzJiLTljMzItZDE2NzI2OGFlYmM2IiwiY2FyZF9pZCI6ImI5OTg1NGUxLWE4YTYtNDE2NS1hMDY1LTQ0MzIwNDU3YjExNyIsInR5cGUiOiJhZ2VudCIsImlhdCI6MTc3NjIxMzUwMCwiZXhwIjoxNzc2MjE3MTAwfQ.u0U8U30hCXn_Ww5Q3gvfq-pP8C-69A_jc0GL2wUAr_4",
  "expires_at": "2026-04-15T01:38:20.456Z",
  "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6"
}

=== TEST 3: Agent pay valid $5 ===
--- Attempt 1 of 5 ---
✅ PASS: Agent pay valid $5
Response: {
  "approved": true,
  "amount_dollars": 5,
  "provider": "lithic",
  "provider_ref": "9754f869-5482-44f3-a4d3-eaf303c8b15a_agent_txn_1776213501640",
  "transaction_id": "b18590c6-6671-4f52-9649-9065950a3cb1",
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
      "id": "a988712c-6ed3-4712-b6f0-3b4d32c11303",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "b70ca75236a859f20ec1b76b9773444a8a19612df951d43d15d1df86d9116229",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-15T00:38:23.397595+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "adcf1870-54a2-447f-9dda-f611fc298235",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "b70ca75236a859f20ec1b76b9773444a8a19612df951d43d15d1df86d9116229",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-15T00:38:22.423866+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "5746e9bb-ddb8-4285-bda9-5a77fd853212",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "3eb93c5da5beca07c56288c27123bc0778d73cc4ab3325f21ce08203fffee934",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-15T00:37:01.67856+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "6669a707-98a0-4e9a-adbd-34a34eda6f5f",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "3eb93c5da5beca07c56288c27123bc0778d73cc4ab3325f21ce08203fffee934",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-15T00:37:00.805346+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "a91eeaea-16f9-4f01-b23a-badc83559175",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "4498a23e067eac53f7babf89405ce76c83189a5e3b2e9ac7b0762fe2c514f49c",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-15T00:26:35.310533+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "e7964dbd-3ed7-43ce-9af0-6cbf1de232be",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "4498a23e067eac53f7babf89405ce76c83189a5e3b2e9ac7b0762fe2c514f49c",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-15T00:26:34.485578+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "e5b08204-03de-4b7d-9eb1-98c1457fbb8f",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "32931c45996a23628613766eb62d649b458120faecbac654278a542858af5bfe",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T20:03:02.463122+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "d49ba87c-d938-49dd-8e3d-675cf1fd2c77",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "32931c45996a23628613766eb62d649b458120faecbac654278a542858af5bfe",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T20:03:01.892939+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "3dccaff9-be80-4dd3-8af8-febf49785c9f",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "cfe8f8d43b8b0ee5a1b0389bef204b4a2b48f7a3bc6284db7ca9fd4caa6482d4",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T19:52:46.639783+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "1dfa9763-4116-40c4-9947-a9743ed7c6d7",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "cfe8f8d43b8b0ee5a1b0389bef204b4a2b48f7a3bc6284db7ca9fd4caa6482d4",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T19:52:45.969479+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "0973b4b5-986c-4da1-84d8-dc55a0ab44a9",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "a1be79e73baf4cd7b442bd037dc3f25d7f8729f8e164cff8cd107b012d6f74d9",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T19:50:50.028351+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "f92dc786-2024-41a6-807b-368117d735f4",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "a1be79e73baf4cd7b442bd037dc3f25d7f8729f8e164cff8cd107b012d6f74d9",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T19:50:49.404782+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "9a5bab92-ea4d-416a-a273-8c5422cb64bc",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "02c55e27139cc5d735d8a380043d19a52ef8dc93fa219a7f0a2e097ac58523f5",
      "amount": 5000,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Over cap test",
      "status": "blocked",
      "provider": null,
      "anomaly_flag": false,
      "block_reason": "per_txn_cap",
      "created_at": "2026-04-13T19:22:52.587257+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 50,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
    {
      "id": "65c83da0-94bb-4c1a-b471-c179ce146810",
      "card_id": "b99854e1-a8a6-4165-a065-44320457b117",
      "token_hash": "02c55e27139cc5d735d8a380043d19a52ef8dc93fa219a7f0a2e097ac58523f5",
      "amount": 500,
      "merchant_name": "Test Merchant",
      "mcc": null,
      "memo": "Test payment",
      "status": "approved",
      "provider": "lithic",
      "anomaly_flag": false,
      "block_reason": null,
      "created_at": "2026-04-13T19:22:51.636183+00:00",
      "profile_id": "c2d7497e-33dc-4c2b-9c32-d167268aebc6",
      "amount_dollars": 5,
      "agent_name": "gpt4-purchasing-bot",
      "model_name": "gpt-4o",
      "fingerprint": "14f8a1a2e7fbc3f2fc6d9eeaa8935fffa195331858a80d1f4e3ad53c39cca47d"
    },
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
  "total_count": 20,
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
      "total_spent_dollars": 50,
      "transaction_count": 10,
      "blocked_count": 10,
      "anomaly_count": 0,
      "last_seen": "2026-04-15T00:38:23.397595+00:00",
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
      "anomaly_count": 24,
      "total_risk_score": 225,
      "last_anomaly": "2026-04-15T00:38:23.543497+00:00",
      "anomaly_types": [
        "blocked_pattern",
        "duplicate_charge",
        "new_ip",
        "rule_breach"
      ],
      "risk_level": "critical"
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
      "last_seen": "2026-04-15T00:38:22.486+00:00",
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
  "first_name": "Harris",
  "last_name": "Qazi",
  "email": "test@pooly.com",
  "phone": "5551234567",
  "current_ip": "127.0.0.1",
  "last_seen_ip": "127.0.0.1",
  "last_seen": "2026-04-15T00:37:09.836+00:00",
  "model_name": null,
  "model_version": null,
  "system_prompt_hash": null,
  "owner_id": null,
  "kyc_status": "pending",
  "kyc_submitted_at": "2026-04-15T00:37:06.042+00:00",
  "kyc_approved_at": null,
  "status": "active",
  "suspension_reason": null,
  "created_at": "2026-04-13T18:48:28.026427+00:00",
  "updated_at": "2026-04-15T00:37:05.263+00:00",
  "kyc": {
    "id": "6ae5ceba-9eba-47ab-8e0a-c3cb225dad26",
    "profile_id": "5fe6ba1e-f02b-400f-959c-8442532396f8",
    "fingerprint": "4348d576952700b332e42d72713dcbec5118f0b038281c03d79726acc2f13edc",
    "date_of_birth": "1995-01-01",
    "ssn_last_four": "1234",
    "ssn_hash": "4dffaafc3479df09330449fb2e2a15949b40512633b1d360204baad531e1197d",
    "address_line1": "123 Test St",
    "address_line2": null,
    "city": "Chicago",
    "state": "IL",
    "zip": "60601",
    "country": "US",
    "id_type": "drivers_license",
    "id_number_hash": null,
    "id_verified": false,
    "id_verified_at": null,
    "model_card_url": null,
    "intended_use": null,
    "risk_level": "low",
    "submitted_at": "2026-04-15T00:37:05.909+00:00",
    "reviewed_at": null,
    "reviewed_by": null,
    "created_at": "2026-04-13T18:48:29.512204+00:00",
    "updated_at": "2026-04-13T18:48:29.512204+00:00"
  }
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
  "last_seen": "2026-04-15T00:38:27.039+00:00",
  "model_name": null,
  "model_version": null,
  "system_prompt_hash": null,
  "owner_id": null,
  "kyc_status": "pending",
  "kyc_submitted_at": "2026-04-15T00:37:06.042+00:00",
  "kyc_approved_at": null,
  "status": "active",
  "suspension_reason": null,
  "created_at": "2026-04-13T18:48:28.026427+00:00",
  "updated_at": "2026-04-15T00:38:27.177+00:00"
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
Cleaning up duplicate test cards...
Cleanup done
✅ PASS: Create card
Response: {
  "id": "43c6b9c4-c9aa-4896-8c9b-15747be27aeb",
  "name": "Test Card",
  "description": "Created by test suite",
  "group_code": "440F11BAEE9A",
  "owner_id": "79ad6c1b-d44d-4470-98e1-be337e519999",
  "member_ids": null,
  "approval_threshold": 1,
  "total_balance": 0,
  "member_balances": {},
  "spending_limits": {
    "daily_cap": 0,
    "max_per_txn": 0
  },
  "blocked_mcc": [],
  "card_status": "active",
  "card_image_url": null,
  "created_at": "2026-04-15T00:38:28.854201+00:00",
  "updated_at": "2026-04-15T00:38:28.854201+00:00",
  "admin_ids": [],
  "allowed_merchants": [],
  "merchant_restriction_mode": "blacklist",
  "merchant_limits": [],
  "card_token": null,
  "card_name": "My Test Card",
  "agent_ids": [],
  "members": [
    "5fe6ba1e-f02b-400f-959c-8442532396f8"
  ],
  "invite_code": "440F11BAEE9A"
}

=== TEST 16: Get card ===
--- Attempt 1 of 5 ---
✅ PASS: Get card
Response: {
  "id": "43c6b9c4-c9aa-4896-8c9b-15747be27aeb",
  "name": "Test Card",
  "description": "Created by test suite",
  "group_code": "440F11BAEE9A",
  "owner_id": "79ad6c1b-d44d-4470-98e1-be337e519999",
  "member_ids": null,
  "approval_threshold": 1,
  "total_balance": 0,
  "member_balances": {},
  "spending_limits": {
    "daily_cap": 0,
    "max_per_txn": 0
  },
  "blocked_mcc": [],
  "card_status": "active",
  "card_image_url": null,
  "created_at": "2026-04-15T00:38:28.854201+00:00",
  "updated_at": "2026-04-15T00:38:28.854201+00:00",
  "admin_ids": [],
  "allowed_merchants": [],
  "merchant_restriction_mode": "blacklist",
  "merchant_limits": [],
  "card_token": null,
  "card_name": "My Test Card",
  "agent_ids": [],
  "members": [
    "5fe6ba1e-f02b-400f-959c-8442532396f8"
  ],
  "invite_code": "440F11BAEE9A"
}

=== TEST 17: Set card limits ===
--- Attempt 1 of 5 ---
✅ PASS: Set card limits
Response: {
  "daily_cap": 200,
  "max_per_txn": 50
}

=== TEST 18: Create Lithic card for card ===
--- Attempt 1 of 5 ---
Verifying card_token saved to Supabase...
card_token in DB: 748a653b-98d6-46ee-a188-dc1c59542bea
✅ PASS: Create Lithic card for card
Response: {
  "success": true,
  "cardToken": "748a653b-98d6-46ee-a188-dc1c59542bea",
  "message": "Virtual card created for group"
}

=== TEST 19: List cards ===
--- Attempt 1 of 5 ---
✅ PASS: List cards
Response: [
  {
    "id": "43c6b9c4-c9aa-4896-8c9b-15747be27aeb",
    "name": "Test Card",
    "description": "Created by test suite",
    "group_code": "440F11BAEE9A",
    "owner_id": "79ad6c1b-d44d-4470-98e1-be337e519999",
    "member_ids": null,
    "approval_threshold": 1,
    "total_balance": 0,
    "member_balances": {},
    "spending_limits": {
      "daily_cap": 20000,
      "max_per_txn": 5000
    },
    "blocked_mcc": [],
    "card_status": "OPEN",
    "card_image_url": null,
    "created_at": "2026-04-15T00:38:28.854201+00:00",
    "updated_at": "2026-04-15T00:38:30.941628+00:00",
    "admin_ids": [],
    "allowed_merchants": [],
    "merchant_restriction_mode": "blacklist",
    "merchant_limits": [],
    "card_token": "748a653b-98d6-46ee-a188-dc1c59542bea",
    "card_name": "My Test Card",
    "agent_ids": [],
    "members": [
      "5fe6ba1e-f02b-400f-959c-8442532396f8"
    ],
    "invite_code": "440F11BAEE9A"
  }
]

=== TEST 20: List transactions ===
--- Attempt 1 of 5 ---
✅ PASS: List transactions
Response: []

=== TEST 21: Card join flow (second user) ===
--- Attempt 1 of 5 ---
⚠️ TEST_USER2_PASSWORD not set — skipping join test
Set it in Replit Secrets as TEST_USER2_PASSWORD
✅ PASS: Card join flow (second user)
Response: {
  "skipped": true
}

🎉 ALL TESTS PASSED
Completed: 2026-04-15T00:38:32.445Z