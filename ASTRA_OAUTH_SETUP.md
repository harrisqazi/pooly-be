# Astra OAuth Setup Instructions

## Backend Setup

The Astra OAuth callback route has been added to `routes/auth.js`:
- **Endpoint**: `POST /api/auth/astra/callback`
- **Requires**: JWT authentication token in Authorization header
- **Body**: `{ code: string, redirect_uri: string }`

## Environment Variables

Add these to your `.env` file:

```env
ASTRA_CLIENT_ID=your_astra_client_id
ASTRA_CLIENT_SECRET=your_astra_client_secret
ASTRA_API_KEY=astra_placeholder
ASTRA_BASE_URL=https://api.astra.finance
ASTRA_OAUTH_BASE_URL=https://api.astra.finance/oauth
ASTRA_REDIRECT_URI=https://pooly-fe-harrisqazi.vercel.app/oauth/astra/callback
```

## Database Setup

Ensure you have a `users_extended` table in Supabase with the following schema:

```sql
CREATE TABLE IF NOT EXISTS users_extended (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  astra_token TEXT,
  astra_refresh_token TEXT,
  astra_token_expires_at TIMESTAMPTZ,
  astra_token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_extended_user_id ON users_extended(user_id);
```

## Frontend Setup

1. Copy the component code from `frontend-astra-callback-component.jsx` to your frontend project
2. Set up the route in your router (e.g., React Router):
   ```jsx
   <Route path="/oauth/astra/callback" element={<AstraCallback />} />
   ```

3. Add environment variable:
   ```env
   VITE_API_URL=https://your-backend-url.com
   ```

## Astra Dashboard Configuration

**IMPORTANT**: Add these redirect URIs in your Astra OAuth application settings:

1. **Production**: `https://pooly-fe-harrisqazi.vercel.app/oauth/astra/callback`
2. **Local Development**: `http://localhost:5173/oauth/astra/callback`

### Steps to add redirect URIs in Astra Dashboard:

1. Log in to your Astra dashboard
2. Navigate to your OAuth application settings
3. Find the "Redirect URIs" or "Allowed Callback URLs" section
4. Add both URIs listed above
5. Save the changes

## OAuth Flow

1. User clicks "Connect Astra" button in frontend
2. Frontend redirects to Astra OAuth authorization URL:
   ```
   https://api.astra.finance/oauth/authorize?
     client_id=YOUR_CLIENT_ID&
     redirect_uri=https://pooly-fe-harrisqazi.vercel.app/oauth/astra/callback&
     response_type=code&
     scope=read write
   ```

3. User authorizes the application
4. Astra redirects to callback URL with `code` parameter
5. Frontend component extracts code and sends to backend
6. Backend exchanges code for access token
7. Backend stores token in `users_extended` table
8. Frontend redirects to dashboard

## Testing

1. Start your backend server
2. Start your frontend development server
3. Navigate to the OAuth initiation page
4. Click "Connect Astra"
5. Complete the OAuth flow
6. Verify token is stored in `users_extended` table

## Troubleshooting

- **401 Unauthorized**: Ensure user is logged in before initiating OAuth
- **400 Bad Request**: Check that redirect_uri matches exactly what's in Astra dashboard
- **Token exchange fails**: Verify `ASTRA_CLIENT_ID` and `ASTRA_CLIENT_SECRET` are correct
- **Database errors**: Ensure `users_extended` table exists and has correct schema
