import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface PayableItem {
  id: string;
  description: string;
  value: number;
  dueDate: string;
  status: string;
}

interface PayablesResponse {
  data: PayableItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export class ContaAzulService {
  private apiClient: AxiosInstance;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.apiClient = axios.create({
      baseURL: process.env.CONTA_AZUL_API_BASE_URL || 'https://api.contaazul.com',
      timeout: 10000,
    });
  }

  /**
   * Exchange authorization code for access token and refresh token
   * Production endpoint: https://auth.contaazul.com/oauth2/token
   * 
   * @param code - The authorization code received from the OAuth login flow
   * @returns TokenResponse with access_token, refresh_token, and expires_in
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    try {
      const clientId = process.env.CONTA_AZUL_CLIENT_ID || '';
      const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET || '';
      
      // 4. Redirect URI: Garantir que termine com /
      let redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || 'https://shut-embassy-polio.ngrok-free.dev/api/auth/callback/';
      if (!redirectUri.endsWith('/')) {
        redirectUri += '/';
      }
      
      if (!clientId || !clientSecret) {
        throw new Error('Missing CONTA_AZUL_CLIENT_ID or CONTA_AZUL_CLIENT_SECRET environment variables');
      }

      // 3. Authorization Header: Conversão para Base64
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      // 1. Formato do Body: Utilizar URLSearchParams para x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('redirect_uri', redirectUri);

      console.log('[OAuth] Exchanging authorization code for tokens (x-www-form-urlencoded)...');

      // 2. Headers Corretos: application/x-www-form-urlencoded
      const response = await axios.post(
        'https://auth.contaazul.com/oauth2/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
        }
      );

      // 4. Tratamento de Resposta (Sucesso)
      console.log('[OAuth] Token exchange successful!');
      console.log('[OAuth] Scopes granted:', response.data.scope || 'default');

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      // 5. Tratamento de Erro: console.error detalhado
      console.error('[OAuth] Token exchange failed');
      if (axios.isAxiosError(error) && error.response) {
        console.error('[OAuth] Error Response Data:', JSON.stringify(error.response.data, null, 2));
        throw new Error(`OAuth Error: ${JSON.stringify(error.response.data)}`);
      } else if (error instanceof Error) {
        console.error('[OAuth] Error Message:', error.message);
        throw error;
      } else {
        console.error('[OAuth] Unknown error:', error);
        throw new Error('Unknown OAuth error');
      }
    }
  }

  /**
   * Check if token has expired based on expiresAt timestamp
   */
  private isTokenExpired(expiresAt: Date): boolean {
    const now = new Date();
    // Add a 5-minute buffer to refresh before actual expiration
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return now.getTime() >= expiresAt.getTime() - bufferTime;
  }

  /**
   * Refresh access token using refresh token (Production)
   * Endpoint: https://auth.contaazul.com/oauth2/token
   */
  async refreshAccessToken(companyId: string): Promise<TokenResponse> {
    try {
      const auth = await this.prisma.contaAzulAuth.findUnique({
        where: { companyId },
      });

      if (!auth) {
        throw new Error(`No authentication found for company ${companyId}`);
      }

      const clientId = process.env.CONTA_AZUL_CLIENT_ID || '';
      const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET || '';

      if (!clientId || !clientSecret) {
        throw new Error('Missing CONTA_AZUL_CLIENT_ID or CONTA_AZUL_CLIENT_SECRET');
      }

      // 1. Authorization Header: Basic Auth Base64
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      // 2. Body: URLSearchParams (x-www-form-urlencoded)
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', auth.refreshToken);

      console.log(`[OAuth] Refreshing token for company ${companyId}...`);

      const response = await axios.post(
        'https://auth.contaazul.com/oauth2/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
        }
      );

      // 3. Update tokens in database
      const expiresAt = new Date(Date.now() + response.data.expires_in * 1000);
      await this.prisma.contaAzulAuth.update({
        where: { companyId },
        data: {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token || auth.refreshToken, // Use new refresh token if provided
          expiresAt,
        },
      });

      console.log(`[OAuth] Token refreshed successfully for company ${companyId}`);

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || auth.refreshToken,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      console.error(`[OAuth] Refresh token failed for company ${companyId}`);
      if (axios.isAxiosError(error) && error.response) {
        console.error('[OAuth] Error Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   * This should be called before any API request to ensure token validity
   */
  async getValidAccessToken(companyId: string): Promise<string> {
    try {
      const auth = await this.prisma.contaAzulAuth.findUnique({
        where: { companyId },
      });

      if (!auth) {
        throw new Error(`No authentication found for company ${companyId}`);
      }

      // Check if token has expired or is about to expire
      if (this.isTokenExpired(auth.expiresAt)) {
        console.log(`Token expired for company ${companyId}. Refreshing...`);
        const tokenResponse = await this.refreshAccessToken(companyId);
        return tokenResponse.access_token;
      }

      return auth.accessToken;
    } catch (error) {
      console.error('Error getting valid access token:', error);
      throw error;
    }
  }

  /**
   * Fetch payables from Conta Azul API
   * Handles pagination and returns all payables
   */
  async fetchPayablesFromAPI(
    companyId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PayablesResponse> {
    try {
      // Ensure we have a valid token
      const accessToken = await this.getValidAccessToken(companyId);

      const response = await this.apiClient.get('/v1/payables', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          page,
          pageSize,
        },
      });

      return {
        data: response.data.data || [],
        pagination: response.data.pagination || {
          page,
          pageSize,
          totalPages: 1,
          totalCount: response.data.data?.length || 0,
        },
      };
    } catch (error) {
      // Tentar auto-refresh se for erro de autenticação (401)
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log(`[OAuth] Token expired for company ${companyId}. Attempting auto-refresh...`);
        try {
          const tokenResponse = await this.refreshAccessToken(companyId);
          
          // Tentar novamente com o novo token
          const retryResponse = await this.apiClient.get('/v1/payables', {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
            params: {
              page,
              pageSize,
            },
          });

          return {
            data: retryResponse.data.data || [],
            pagination: retryResponse.data.pagination || {
              page,
              pageSize,
              totalPages: 1,
              totalCount: retryResponse.data.data?.length || 0,
            },
          };
        } catch (refreshError) {
          console.error('[OAuth] Auto-refresh failed during fetchPayables:', refreshError);
          throw new Error('Sua conexão com a Conta Azul expirou. Por favor, conecte novamente em Configurações.');
        }
      }

      console.error(`Error fetching payables for company ${companyId}:`, error);
      throw new Error('Failed to fetch payables from Conta Azul API');
    }
  }

  /**
   * Sync payables from Conta Azul API to local database
   * Fetches all pages and creates/updates payables in database
   */
  async syncPayables(companyId: string): Promise<number> {
    try {
      let page = 1;
      let totalSynced = 0;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await this.fetchPayablesFromAPI(companyId, page, 50);
        const payables = response.data;

        // Upsert payables in database
        for (const payable of payables) {
          await this.prisma.payable.upsert({
            where: { contaAzulId: payable.id },
            update: {
              description: payable.description,
              value: payable.value,
              dueDate: new Date(payable.dueDate),
              status: payable.status,
            },
            create: {
              companyId,
              contaAzulId: payable.id,
              description: payable.description,
              value: payable.value,
              dueDate: new Date(payable.dueDate),
              status: payable.status,
            },
          });
          totalSynced++;
        }

        // Check if there are more pages
        const { totalPages, page: currentPage } = response.pagination;
        hasMorePages = currentPage < totalPages;
        page++;
      }

      return totalSynced;
    } catch (error) {
      console.error(`Error syncing payables for company ${companyId}:`, error);
      throw new Error('Failed to sync payables');
    }
  }

  /**
   * Save authentication tokens for a company after OAuth flow
   */
  async saveCompanyAuth(
    companyId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      await this.prisma.contaAzulAuth.upsert({
        where: { companyId },
        update: {
          accessToken,
          refreshToken,
          expiresAt,
        },
        create: {
          companyId,
          accessToken,
          refreshToken,
          expiresAt,
        },
      });
    } catch (error) {
      console.error(`Error saving authentication for company ${companyId}:`, error);
      throw new Error('Failed to save authentication');
    }
  }

  /**
   * Get authorization URL for OAuth flow (Production)
   * Redirects user to Conta Azul login page: https://auth.contaazul.com/login
   * NO credentials should be included in this URL - they are only used in the token exchange
   */
  getAuthorizationUrl(state: string): string {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID || '';
    const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || 'https://shut-embassy-polio.ngrok-free.dev/api/auth/callback/';
    
    if (!clientId) {
      throw new Error('CONTA_AZUL_CLIENT_ID environment variable is required');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile', 
    });

    console.log('[OAuth] Generating authorization URL with scope: openid profile sales financial');
    // Production OAuth authorization endpoint
    return `https://auth.contaazul.com/login?${params.toString()}`;
  }
}

export default ContaAzulService;
