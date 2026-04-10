// Frontend component for Astra OAuth callback
// File: pooly-fe/src/pages/oauth/astra/callback.jsx (or similar path based on your structure)

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const ASTRA_CALLBACK_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function AstraCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get authorization code from URL
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Handle OAuth errors from Astra
        if (errorParam) {
          setError(errorDescription || errorParam || 'OAuth authorization failed');
          setStatus('error');
          setTimeout(() => {
            navigate('/dashboard');
          }, 3000);
          return;
        }

        if (!code) {
          setError('No authorization code received from Astra');
          setStatus('error');
          setTimeout(() => {
            navigate('/dashboard');
          }, 3000);
          return;
        }

        // Get current redirect URI (for validation)
        const currentRedirectUri = window.location.origin + window.location.pathname;

        // Get auth token from localStorage or session
        const authToken = localStorage.getItem('auth_token') || 
                         sessionStorage.getItem('auth_token') ||
                         null;

        if (!authToken) {
          setError('You must be logged in to connect Astra. Redirecting to login...');
          setStatus('error');
          setTimeout(() => {
            navigate('/login');
          }, 2000);
          return;
        }

        // Send code to backend to exchange for access token
        const response = await axios.post(
          `${ASTRA_CALLBACK_URL}/api/auth/astra/callback`,
          {
            code: code,
            redirect_uri: currentRedirectUri
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.success) {
          setStatus('success');
          
          // Optionally store Astra connection status
          localStorage.setItem('astra_connected', 'true');
          localStorage.setItem('astra_connected_at', new Date().toISOString());

          // Redirect to dashboard after short delay
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        } else {
          throw new Error(response.data.error || 'Failed to connect Astra');
        }
      } catch (err) {
        console.error('Astra OAuth callback error:', err);
        
        let errorMessage = 'Failed to connect Astra account';
        
        if (err.response) {
          // Handle API errors
          if (err.response.status === 401) {
            errorMessage = 'Authentication required. Please log in and try again.';
            setTimeout(() => {
              navigate('/login');
            }, 2000);
          } else if (err.response.status === 400) {
            errorMessage = err.response.data.error || 'Invalid authorization code';
          } else {
            errorMessage = err.response.data.error || `Error: ${err.response.status}`;
          }
        } else if (err.request) {
          errorMessage = 'Unable to reach server. Please check your connection.';
        } else {
          errorMessage = err.message || 'An unexpected error occurred';
        }

        setError(errorMessage);
        setStatus('error');
        
        // Redirect to dashboard after error
        setTimeout(() => {
          navigate('/dashboard');
        }, 5000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {status === 'processing' && (
        <>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '1rem'
          }} />
          <h2 style={{ margin: '0.5rem 0', color: '#333' }}>Connecting Astra...</h2>
          <p style={{ color: '#666', textAlign: 'center' }}>
            Please wait while we connect your Astra account.
          </p>
        </>
      )}

      {status === 'success' && (
        <>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 style={{ margin: '0.5rem 0', color: '#10b981' }}>Success!</h2>
          <p style={{ color: '#666', textAlign: 'center' }}>
            Your Astra account has been connected successfully.
          </p>
          <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Redirecting to dashboard...
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
          <h2 style={{ margin: '0.5rem 0', color: '#ef4444' }}>Connection Failed</h2>
          <p style={{ color: '#666', textAlign: 'center', maxWidth: '400px' }}>
            {error || 'An error occurred while connecting your Astra account.'}
          </p>
          <p style={{ color: '#999', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Redirecting...
          </p>
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
