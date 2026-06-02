import axios from 'axios';

/**
 * OAuth 2.0 Configuration (Production)
 */
const OAUTH_CONFIG = {
  authorizationEndpoint: 'https://auth.contaazul.com/login',
  tokenEndpoint: 'https://auth.contaazul.com/oauth2/token',
  redirectUri: 'https://contaazul.com',
  scope: 'openid profile aws.cognito.signin.user.admin',
};

/**
 * OAuth 2.0 Token Response from Conta Azul
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Generate OAuth 2.0 authorization URL for Conta Azul login (Production)
 * 
 * User should be redirected to this URL to authenticate and authorize.
 * After authorization, Conta Azul will redirect back to redirect_uri with the authorization code.
 * 
 * @param state - Random state string for CSRF protection (should be unique per request)
 * @returns Full authorization URL for production
 * 
 * @example
 * const authUrl = generateAuthorizationUrl('random_state_123');
 * // Redirect user to this URL
 * res.redirect(authUrl);
 */
export function generateAuthorizationUrl(state: string): string {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('CONTA_AZUL_CLIENT_ID environment variable is required');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    state,
    scope: OAUTH_CONFIG.scope,
  });

  return `${OAUTH_CONFIG.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange authorization code for OAuth tokens from Conta Azul (Production)
 * 
 * This function implements the Authorization Code Grant flow:
 * 1. User is redirected to https://auth.contaazul.com/login with client_id and scopes
 * 2. User authorizes the application
 * 3. User is redirected back with an authorization code
 * 4. Backend exchanges the code for tokens using this function
 * 
 * @param code - Authorization code received from the OAuth login redirect
 * @returns OAuth tokens (access_token, refresh_token, id_token)
 * @throws Error if token exchange fails
 * 
 * @example
 * const tokens = await exchangeCodeForTokens('auth_code_from_redirect');
 * console.log(tokens.access_token); // Use this for API requests
 */
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokenResponse> {
  try {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

    // Validate required environment variables
    if (!clientId || !clientSecret) {
      throw new Error(
        'Missing required OAuth credentials. ' +
        'Set CONTA_AZUL_CLIENT_ID and CONTA_AZUL_CLIENT_SECRET environment variables.'
      );
    }

    if (!code) {
      throw new Error('Authorization code is required');
    }

    // Create Basic Authentication header
    // Format: Authorization: Basic <base64(client_id:client_secret)>
    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');

    // Redirect URI must match exactly what was registered in Conta Azul app settings
    const redirectUri = OAUTH_CONFIG.redirectUri;

    // Prepare request body (application/x-www-form-urlencoded)
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    });

    console.log('[OAuth] Starting token exchange (Production)...');

    // POST request to token endpoint
    const response = await axios.post<OAuthTokenResponse>(
      OAUTH_CONFIG.tokenEndpoint,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encodedCredentials}`,
        },
        timeout: 10000, // 10 second timeout
      }
    );

    console.log('[OAuth] Token exchange completed successfully');

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      id_token: response.data.id_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type,
    };

  } catch (error) {
    console.error('[OAuth] Token exchange failed');

    // Handle Axios errors with detailed response data
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error status
        console.error('[OAuth] Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data, // Full error payload from Conta Azul API
        });

        // Re-throw with API error details
        throw new Error(
          `OAuth token exchange failed: ${error.response.status} - ${
            typeof error.response.data === 'string'
              ? error.response.data
              : JSON.stringify(error.response.data)
          }`
        );
      } else if (error.request) {
        // Request made but no response received
        console.error('[OAuth] No response from server');
        throw new Error('OAuth token endpoint did not respond. Check your network connection.');
      }
    }

    // Handle other errors
    if (error instanceof Error) {
      console.error('[OAuth] Error:', error.message);
      throw error;
    }

    throw new Error('Unknown error during OAuth token exchange');
  }
}

/**
 * Refresh expired access token using refresh token
 * 
 * @param refreshToken - Refresh token obtained during initial token exchange
 * @returns New OAuth tokens
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  try {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID;
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Missing OAuth credentials');
    }

    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');

    const requestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    console.log('[OAuth] Refreshing access token (Production)...');

    const response = await axios.post<OAuthTokenResponse>(
      OAUTH_CONFIG.tokenEndpoint,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encodedCredentials}`,
        },
        timeout: 10000,
      }
    );

    console.log('[OAuth] Access token refreshed successfully');

    return response.data;

  } catch (error) {
    console.error('[OAuth] Token refresh failed');

    if (axios.isAxiosError(error) && error.response) {
      console.error('[OAuth] Error Response:', error.response.data);
    }

    throw new Error('Failed to refresh access token');
  }
}
