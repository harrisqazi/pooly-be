# Pooly Backend (pooly-be)

## Overview
A Node.js/Express REST API backend for the Pooly financial platform. It manages groups, shared balances, virtual cards, and money transfers by orchestrating several fintech APIs on top of a Supabase (PostgreSQL) database.

## Tech Stack
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **Package Manager**: npm

## External Integrations
- **Lithic**: Virtual card issuance and management (sandbox mode)
- **Modern Treasury**: ACH, Wire, RTP bank rails
- **Astra**: RTP/Push-to-Debit payments and OAuth bank connectivity
- **Pay Theory**: Card top-ups / acquiring

## Project Structure
```
server.js              # Main entry point, routes, middleware
config/
  providers.js         # External API client initialization
middleware/
  idempotency.js       # Idempotency key middleware
routes/
  auth.js              # Auth & Astra OAuth
  cards.js             # Lithic virtual card operations
  groups.js            # Group management
  topups.js            # Pay Theory top-ups
  transactions.js      # Transaction ledger & approvals
  transfers.js         # Modern Treasury / Astra transfers
  webhooks.js          # Incoming webhook handlers
utils/
  ledger.js            # Internal balance tracking helpers
```

## Running the App
- **Start**: `npm start` (runs `node server.js`)
- **Port**: 5000 (bound to 0.0.0.0)
- **Health check**: `GET /health`

## Environment Variables
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (preferred for server writes) |
| `LITHIC_API_KEY` | Lithic API key |
| `MODERN_TREASURY_ORG_ID` | Modern Treasury organization ID |
| `MODERN_TREASURY_API_KEY` | Modern Treasury API key |
| `PAY_THEORY_API_KEY` | Pay Theory API key |
| `ASTRA_API_KEY` | Astra API key |
| `ASTRA_CLIENT_ID` | Astra OAuth client ID |
| `ASTRA_CLIENT_SECRET` | Astra OAuth client secret |
| `PORT` | Server port (defaults to 5000) |

## Architecture Notes
- `trust proxy` is enabled for correct rate-limiting behind Replit's proxy
- Auth middleware validates Supabase JWTs on all routes except `/health` and `/api/webhooks`
- Default API keys in `config/providers.js` are sandbox/placeholder values — set real keys via environment secrets
