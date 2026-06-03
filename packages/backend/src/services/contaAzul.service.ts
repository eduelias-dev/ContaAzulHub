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
      baseURL: process.env.CONTA_AZUL_API_BASE_URL || 'https://api-v2.contaazul.com',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
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
        const errorData = error.response.data;
        console.error('[OAuth] Error Response Data:', JSON.stringify(errorData, null, 2));
        
        // If the error is 'invalid_grant', the refresh token is no longer valid
        // and we should disconnect the company by removing the auth record
        if (errorData.error === 'invalid_grant') {
          console.log(`[OAuth] Refresh token is invalid (invalid_grant). Disconnecting company ${companyId}...`);
          await this.prisma.contaAzulAuth.delete({
            where: { companyId }
          }).catch(deleteError => {
            console.error('[OAuth] Failed to delete invalid auth record:', deleteError);
          });
          
          throw new Error('CONTA_AZUL_DISCONNECTED');
        }
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
    const url = 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar';
    let currentToken = '';
    
    try {
      // Ensure we have a valid token
      currentToken = await this.getValidAccessToken(companyId);

      // Calcular intervalo de datas padrão (1 ano atrás até 2 anos no futuro)
      const now = new Date();
      const startDate = new Date();
      startDate.setFullYear(now.getFullYear() - 1);
      const endDate = new Date();
      endDate.setFullYear(now.getFullYear() + 2);

      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      console.log(`[API] Fetching payables for company ${companyId} (Page ${page})...`);
      console.log(`[API] Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${currentToken.trim()}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        params: {
          pagina: page,
          tamanho_pagina: pageSize,
          data_vencimento_de: formatDate(startDate),
          data_vencimento_ate: formatDate(endDate)
        },
        timeout: 10000
      });

      const data = Array.isArray(response.data) 
        ? response.data 
        : (response.data.itens || response.data.items || response.data.data || []);
      
      // Helper para converter qualquer valor da API em número (trata string "1.250,50", null, etc)
      const parseValue = (val: any): number => {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          // Remove símbolos de moeda e trata formato brasileiro (1.000,50 -> 1000.50)
          const clean = val.replace(/[R$\s.]/g, '').replace(',', '.');
          return parseFloat(clean) || 0;
        }
        return 0;
      };

      if (data.length > 0) {
        console.log('[API] First item raw data:', JSON.stringify(data[0], null, 2));
      }
      
      return {
        data: data.map((item: any) => {
          // Identify value - Based on raw data, the field is 'total'
          const rawValue = item.total !== undefined ? item.total : 
                        item.valor !== undefined ? item.valor :
                        item.valor_total !== undefined ? item.valor_total :
                        (item.value || 0);

          const value = parseValue(rawValue);

          console.log(`[API] Mapping item: ${item.descricao || 'N/A'} -> Total Field: ${item.total} -> Parsed: ${value}`);

          return {
            id: item.id,
            description: item.descricao || item.nome_fornecedor || 'Sem descrição',
            value: value,
            dueDate: item.data_vencimento || item.dueDate || new Date().toISOString(),
            // Based on raw data, status is in 'status_traduzido'
            status: item.status_traduzido || item.situacao || item.status || 'PENDENTE',
          };
        }),
        pagination: {
          page: response.data.pagina || page,
          pageSize: response.data.tamanho_pagina || pageSize,
          totalPages: response.data.total_paginas || 1,
          totalCount: response.data.total_elementos || data.length,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(`[API] Error ${error.response.status} for company ${companyId}`);
        console.error(`[API] Response Body:`, JSON.stringify(error.response.data, null, 2));
        
        // Se for 401, tentar UM auto-refresh se ainda não tentamos nesta execução
        if (error.response.status === 401) {
          console.log(`[OAuth] 401 Detected. Attempting force refresh...`);
          try {
            const tokenResponse = await this.refreshAccessToken(companyId);
            const newToken = tokenResponse.access_token;
            
            const retryResponse = await axios.get(url, {
              headers: {
                'Authorization': `Bearer ${newToken.trim()}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              params: {
                pagina: page,
                tamanho_pagina: pageSize,
              },
              timeout: 10000
            });

            const data = Array.isArray(retryResponse.data) 
              ? retryResponse.data 
              : (retryResponse.data.itens || retryResponse.data.items || retryResponse.data.data || []);

            return {
              data: data.map((item: any) => ({
                id: item.id,
                description: item.description || item.nome_fornecedor || 'Sem descrição',
                value: item.valor || item.value || 0,
                dueDate: item.data_vencimento || item.dueDate || new Date().toISOString(),
                status: item.status || 'PENDING',
              })),
              pagination: {
                page: retryResponse.data.pagina || page,
                pageSize: retryResponse.data.tamanho_pagina || pageSize,
                totalPages: retryResponse.data.total_paginas || 1,
                totalCount: retryResponse.data.total_elementos || data.length,
              },
            };
          } catch (refreshError) {
            console.error('[OAuth] Force refresh or retry failed:', refreshError);
            if (refreshError instanceof Error && refreshError.message === 'CONTA_AZUL_DISCONNECTED') {
              throw new Error('Sua conexão com a Conta Azul expirou. Por favor, conecte novamente em Configurações.');
            }
          }
        }
      }

      if (error instanceof Error && error.message === 'CONTA_AZUL_DISCONNECTED') {
        throw new Error('Sua conexão com a Conta Azul expirou. Por favor, conecte novamente em Configurações.');
      }

      console.error(`Error fetching payables for company ${companyId}:`, error);
      throw new Error('Sua conexão com a Conta Azul expirou. Por favor, conecte novamente em Configurações.');
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
          console.log(`[DB] Upserting payable ${payable.id} for company ${companyId}`);
          try {
            const result = await this.prisma.payable.upsert({
              where: { contaAzulId: payable.id },
              update: {
                companyId, // Ensure it's linked to the correct company even if it existed before
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
            console.log(`[DB] Successfully saved payable ${result.id}`);
            totalSynced++;
          } catch (dbError) {
            console.error(`[DB] Error saving payable ${payable.id}:`, dbError);
          }
        }

        // Check if there are more pages
        const { totalPages, page: currentPage } = response.pagination;
        hasMorePages = currentPage < totalPages;
        page++;

        // Safety break for tests or unexpected API behavior
        if (page > 100) break;
      }

      return totalSynced;
    } catch (error) {
      console.error(`Error syncing payables for company ${companyId}:`, error);
      // Propagate the friendly message if it's what we got from fetchPayablesFromAPI
      if (error instanceof Error && error.message.includes('Sua conexão com a Conta Azul expirou')) {
        throw error;
      }
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
    let redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || 'https://shut-embassy-polio.ngrok-free.dev/api/auth/callback/';
    
    // Ensure redirectUri matches what we use in exchangeCodeForToken
    if (!redirectUri.endsWith('/')) {
      redirectUri += '/';
    }

    if (!clientId) {
      throw new Error('CONTA_AZUL_CLIENT_ID environment variable is required');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      // API v2 requires these specific Cognito scopes. 
      // Permissions are managed in the Developer Portal, not via these scopes.
      scope: 'openid profile aws.cognito.signin.user.admin', 
    });

    console.log('[OAuth] Generating authorization URL with Cognito scopes');
    // Production OAuth authorization endpoint
    return `https://auth.contaazul.com/login?${params.toString()}`;
  }
}

export default ContaAzulService;
