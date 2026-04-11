# Pooly Backend (pooly-be)

## Overview
A Node.js/Express REST API backend for the Pooly financial platform. It manages shared wallet cards, virtual cards (Lithic), and money transfers (Modern Treasury, Pay Theory) on top of a Supabase (PostgreSQL) database.

## Tech Stack
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **Package Manager**: npm

## External Integrations
- **Lithic**: Virtual card issuance and management (sandbox mode)
- **Modern Treasury**: ACH, Wire, FedNow bank rails
- **Pay Theory**: Card top-ups / acquiring
- **Stripe**: Optional payment intents (enabled via `PROVIDER_STRIPE=true`)

## Project Structure
```
server.js              # Main entry point; authMiddleware creates/upserts profiles
config/
  providers.js         # External API clients (no Astra)
middleware/
  idempotency.js       # Idempotency key middleware
routes/
  auth.js              # JWT verify, /me, GET/PUT /profile, POST /kyc
  cards.js             # Wallet CRUD: list, create, join (invite_code), delete, limits
  lithic.js            # Lithic virtual card ops (get, create, pause, resume, limits)
  transactions.js      # Transaction ledger, approvals, deny
  transfers.js         # Modern Treasury ACH/wire/FedNow, deposit/withdraw
  topups.js            # Pay Theory top-ups
  webhooks.js          # Lithic, Modern Treasury, Pay Theory webhook handlers
  agent.js             # Autonomous payment agents (register, kyc, token, pay, audit, etc.)
  groups.js            # ORPHANED — superseded by routes/cards.js, not mounted
utils/
  ledger.js            # createLedgerEntry, updateCardBalance (alias: updateGroupBalance)
```

## Route Mounts
| Path | File | Description |
|---|---|---|
| `/api/auth` | routes/auth.js | Auth, profile, KYC |
| `/api/cards` | routes/cards.js | Wallet card CRUD |
| `/api/lithic` | routes/lithic.js | Lithic virtual card ops |
| `/api/transactions` | routes/transactions.js | Transaction ledger |
| `/api/transfers` | routes/transfers.js | Bank transfers |
| `/api/topups` | routes/topups.js | Top-ups |
| `/api/webhooks` | routes/webhooks.js | Webhooks (no auth) |
| `/api/agent` | routes/agent.js | Agent payment system (no auth) |

## Schema (Final — 2026-04-11)
Key tables:
- **cards** — wallet cards (replaces `groups`); `members` is JSONB array of `profiles.id`
- **profiles** — human (`auth_id` set) and agent (`auth_id` null) identities
- **kyc_details** — KYC data, fingerprint deduplication
- **transactions** — `card_id`, `profile_id`, `user_id` (null for agents)
- **ledger_entries** — double-entry: `transaction_id, debit_account, credit_account, amount`
- **agent_tokens** — `profile_id, card_id, token_hash, rules_hash, issued_from_ip`
- **agent_spend_log** — `profile_id, card_id, token_hash, amount, status, anomaly_flag`
- **anomaly_log** — `profile_id, card_id, event_type, severity, score, payload`
- **webhook_events** — deduplication: `provider, event_id, event_type, payload, processed`
- **approvals** — `transaction_id, card_id, requester_id, approver_id, status`

Removed tables: `groups`, `agent_rules`, `users_extended` — never reference these.

## Auth Middleware
On every protected request, `authMiddleware` in `server.js`:
1. Verifies Supabase JWT → sets `req.user`
2. Upserts a row in `profiles` → sets `req.profile`

Public routes (no auth): `/health`, `/api/webhooks`, `/api/agent`

## Agent System
- Agents are `profiles` rows with `type='agent'`
- Spending limits live in `cards.spending_limits` (`{daily_cap, max_per_txn}` in cents)
- MCC restrictions in `cards.blocked_mcc` (text array)
- Tokens: JWT signed with `AGENT_JWT_SECRET`, stored hashed in `agent_tokens`
- `POST /api/agent/register` → create agent profile + add to card members
- `POST /api/agent/kyc/approve` → approve agent
- `POST /api/agent/token` → issue JWT for approved agent
- `POST /api/agent/pay` → execute payment (idempotent)
- `GET /api/agent/audit?card_id=xxx` → fraud dashboard grouped by profile
- `GET /api/agent/list?card_id=xxx` → list agents on card
- `GET /api/agent/risk?card_id=xxx` → risk scores from `profile_risk_scores` view

## Running the App
- **Start**: `npm start` (runs `node server.js`)
- **Port**: 5000 (bound to 0.0.0.0)
- **Health check**: `GET /health`

## Environment Variables
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (preferred) |
| `LITHIC_API_KEY` | Lithic API key |
| `MODERN_TREASURY_ORG_ID` | Modern Treasury org ID |
| `MODERN_TREASURY_API_KEY` | Modern Treasury API key |
| `PAY_THEORY_API_KEY` | Pay Theory API key |
| `STRIPE_SECRET_KEY` | Stripe key (when `PROVIDER_STRIPE=true`) |
| `AGENT_JWT_SECRET` | Secret for signing agent JWTs |
| `ADMIN_KEY` | Bearer key for admin-only agent endpoints |
| `PROVIDER_ISSUING` | `lithic` (default) |
| `PROVIDER_BANK_RAILS` | `modern_treasury` (default) |
| `PROVIDER_ACQUIRING` | `paytheory` (default) |
| `PROVIDER_STRIPE` | `true` to enable Stripe |
| `PORT` | Server port (default 5000) |

## Architecture Notes
- `trust proxy: 1` for correct IP / rate-limiting behind Replit's proxy
- All amounts stored as **cents (bigint)** in DB; divide by 100 before returning to callers
- `cards.members` is a JSONB array of profile ID strings
- Membership query: `.or(\`owner_id.eq.${req.user.id},members.cs.["${req.profile.id}"]\`)`
