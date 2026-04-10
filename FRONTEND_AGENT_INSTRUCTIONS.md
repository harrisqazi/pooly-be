# Instructions for Frontend Agent

## What You Need to Add

### ✅ REQUIRED: Astra OAuth Callback Component

**Why**: Only Astra requires OAuth (user authorization flow). The other providers (Lithic, Modern Treasury, Pay Theory) use server-side API keys, so they don't need OAuth components.

**What to do**:
1. Copy the component from `frontend-astra-callback-component.jsx` 
2. Place it in your frontend project at: `src/pages/oauth/astra/callback.jsx` (or similar)
3. Add the route in your router:
   ```jsx
   <Route path="/oauth/astra/callback" element={<AstraCallback />} />
   ```

**What it does**:
- Handles the OAuth callback when Astra redirects back to your app
- Extracts the authorization `code` from the URL
- Sends the code to backend `POST /api/auth/astra/callback`
- Shows loading/success/error states
- Redirects to dashboard when done

### ❌ NOT NEEDED: OAuth Components for Other Providers

**Lithic, Modern Treasury, Pay Theory** don't need OAuth components because:
- They use **server-side API keys** (already configured in backend)
- No user authorization flow required
- Frontend just calls the backend APIs directly

## What Frontend DOES Need (But Not OAuth)

For the other providers, you just need regular UI components that call the backend APIs:

### 1. **Groups Management UI**
   - Create groups: `POST /api/groups`
   - List groups: `GET /api/groups`
   - Join group: `POST /api/groups/join`

### 2. **Cards Management UI** (Lithic)
   - Create card: `POST /api/cards`
   - List cards: `GET /api/cards?group_id=xxx`
   - Pause/resume: `POST /api/cards/:id/pause` or `/resume`
   - Set limits: `POST /api/cards/:id/limits`

### 3. **Transactions UI**
   - Create transaction: `POST /api/transactions`
   - List transactions: `GET /api/transactions?group_id=xxx`
   - Approve/deny: `POST /api/transactions/:id/approve` or `/deny`

### 4. **Transfers UI** (Modern Treasury/Astra)
   - ACH transfer: `POST /api/transfers/ach`
   - Wire transfer: `POST /api/transfers/wire`
   - RTP transfer: `POST /api/transfers/rtp`
   - Deposit: `POST /api/transfers/deposit`
   - Withdraw: `POST /api/transfers/withdraw`

### 5. **Top-ups UI** (Pay Theory)
   - Top up card: `POST /api/topups`
   - List top-ups: `GET /api/topups?group_id=xxx`

### 6. **Astra Connection Button** (The Only OAuth Thing)
   - Button that redirects to Astra OAuth:
     ```jsx
     const connectAstra = () => {
       const clientId = import.meta.env.VITE_ASTRA_CLIENT_ID;
       const redirectUri = window.location.origin + '/oauth/astra/callback';
       window.location.href = `https://api.astra.finance/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=read write`;
     };
     ```

## Summary

**Tell the frontend agent**:
> "Add the Astra OAuth callback component from `frontend-astra-callback-component.jsx` to handle Astra OAuth redirects. The other providers (Lithic, Modern Treasury, Pay Theory) don't need OAuth - they just need regular UI components that call the backend APIs. All backend routes are ready at `/api/*` endpoints."

## Environment Variables Needed

Add to frontend `.env`:
```env
VITE_API_URL=https://your-backend-url.com
VITE_ASTRA_CLIENT_ID=your_astra_client_id  # Only if you want to initiate OAuth from frontend
```

## Backend API Endpoints (All Ready)

All these endpoints are already implemented in the backend:

- `/api/auth/*` - Authentication
- `/api/groups/*` - Group management
- `/api/transactions/*` - Transaction management  
- `/api/cards/*` - Card management (Lithic)
- `/api/transfers/*` - Transfer operations (Modern Treasury/Astra)
- `/api/topups/*` - Card top-ups (Pay Theory)
- `/api/webhooks/*` - Webhook handlers (backend only)

All endpoints require JWT authentication except `/health` and `/api/webhooks/*`.
