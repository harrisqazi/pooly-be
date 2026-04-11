#!/bin/bash
BASE_URL="${BASE_URL:-https://your-replit-url.repl.co}"
ADMIN_KEY="${ADMIN_KEY}"
GROUP_ID="${GROUP_ID:-paste-a-real-group-id-from-supabase-here}"

echo "=== 1. Health check ==="
curl -s "$BASE_URL/health" | jq .

echo "=== 2. Create agent rules ==="
curl -s -X POST "$BASE_URL/api/agent/rules" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":\"$GROUP_ID\",\"daily_spend_cap\":100,\"max_per_txn\":25,\"quorum_required\":1}" | jq .

echo "=== 3. Get agent token ==="
TOKEN=$(curl -s -X POST "$BASE_URL/api/agent/token" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":\"$GROUP_ID\"}" | jq -r '.token')
echo "Token received: ${TOKEN:0:20}..."

echo "=== 4. Agent pay — valid $5 payment ==="
curl -s -X POST "$BASE_URL/api/agent/pay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-pay-001" \
  -d "{\"amount\":5,\"merchant_name\":\"Test Merchant\",\"memo\":\"Test agent payment\",\"idempotency_key\":\"test-pay-001\"}" | jq .

echo "=== 5. Agent pay — over cap ($50, should 403) ==="
curl -s -X POST "$BASE_URL/api/agent/pay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-pay-002" \
  -d "{\"amount\":50,\"merchant_name\":\"Test Merchant\",\"memo\":\"Over cap test\",\"idempotency_key\":\"test-pay-002\"}" | jq .

echo "=== 6. Spend log ==="
curl -s -X POST "$BASE_URL/api/agent/spend-log" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":\"$GROUP_ID\",\"limit\":10}" | jq .

echo "=== 7. Revoke token ==="
TOKEN_HASH=$(echo -n "$TOKEN" | sha256sum | cut -d' ' -f1)
curl -s -X POST "$BASE_URL/api/agent/revoke" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"token_hash\":\"$TOKEN_HASH\"}" | jq .

echo "=== 8. Pay with revoked token (should 401) ==="
curl -s -X POST "$BASE_URL/api/agent/pay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-pay-003" \
  -d "{\"amount\":5,\"memo\":\"Should fail\",\"idempotency_key\":\"test-pay-003\"}" | jq .
