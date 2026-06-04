import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  company_id?: string;
  company_name?: string;
}

interface FinancialItem {
  id: string;
  description: string;
  value: number;
  dueDate: string;
  status: string;
}

interface FinancialResponse {
  data: FinancialItem[];
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
    // Forçamos o host para api-v2 para evitar que variáveis de ambiente apontem para o host legado
    this.apiClient = axios.create({
      baseURL: 'https://api-v2.contaazul.com',
      timeout: 20000,
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
   * @returns Array of TokenResponse (handles multi-tenant/batch tokens)
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse[]> {
    try {
      const clientId = process.env.CONTA_AZUL_CLIENT_ID || '';
      const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET || '';
      
      let redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || '';
      if (redirectUri && !redirectUri.endsWith('/')) {
        redirectUri += '/';
      }
      
      if (!clientId || !clientSecret) {
        throw new Error('Missing CONTA_AZUL_CLIENT_ID or CONTA_AZUL_CLIENT_SECRET environment variables');
      }

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const params = new URLSearchParams();
      params.append('code', code);
      params.append('grant_type', 'authorization_code');
      params.append('redirect_uri', redirectUri);

      console.log('[OAuth] Exchanging authorization code for tokens...');

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

      console.log('[OAuth] Token exchange successful!');
      
      // Handle array response (Conta Azul Mais) or single object
      const tokens = Array.isArray(response.data) ? response.data : [response.data];
      
      return tokens.map((t: any) => ({
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_in: t.expires_in,
        company_id: t.company_id,
        company_name: t.company_name,
      }));
    } catch (error) {
      console.error('[OAuth] Token exchange failed');
      if (axios.isAxiosError(error) && error.response) {
        console.error('[OAuth] Error Response:', JSON.stringify(error.response.data, null, 2));
        throw new Error(`OAuth Error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Fetch all companies accessible by the current token
   * Useful for BPO/Accountant flow to discover managed clients
   */
  async fetchCompanies(accessToken: string): Promise<{ id: string, name: string }[]> {
    try {
      console.log('[API] Fetching accessible companies (Discovery via /v1/tenants)...');
      
      // Official V2 endpoint for tenant discovery
      const response = await this.apiClient.get('/v1/tenants', {
        headers: {
          'Authorization': `Bearer ${accessToken.trim()}`,
        }
      });

      const data = response.data || [];
      console.log(`[API] Discovery found ${data.length} tenants.`);

      return data.map((t: any) => ({
        id: t.id || t.company_id,
        name: t.name || t.company_name || t.corporate_name || `Empresa ${t.id}`
      }));
    } catch (error) {
      console.error('[API] Company discovery failed:');
      if (axios.isAxiosError(error) && error.response) {
        console.error(`[API] Status: ${error.response.status}`);
        console.error(`[API] Response:`, JSON.stringify(error.response.data, null, 2));
      }
      return [];
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
   * Fetch records from a specific financial endpoint (V2)
   */
  private async fetchFinancialRecordsFromAPI(
    endpoint: 'contas-a-pagar' | 'contas-a-receber',
    companyId: string,
    page: number = 1,
    pageSize: number = 20,
    isRetry: boolean = false
  ): Promise<FinancialResponse> {
    const url = `/v1/financeiro/eventos-financeiros/${endpoint}/buscar`;
    
    try {
      const currentToken = await this.getValidAccessToken(companyId);

      const now = new Date();
      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      
      const dateFrom = new Date();
      dateFrom.setFullYear(now.getFullYear() - 1);
      const dateTo = new Date();
      dateTo.setFullYear(now.getFullYear() + 1);

      console.log(`[API] Fetching ${endpoint} for company ${companyId} (Page ${page})...`);
      
      const response = await this.apiClient.get(url, {
        headers: {
          'Authorization': `Bearer ${currentToken.trim()}`,
        },
        params: {
          pagina: page,
          tamanho_pagina: pageSize,
          data_vencimento_de: formatDate(dateFrom),
          data_vencimento_ate: formatDate(dateTo),
        },
      });

      const data = response.data.itens || response.data.items || response.data.data || [];
      
      return {
        data: data.map((item: any) => ({
          id: item.id,
          description: item.descricao || item.nome_fornecedor || item.nome_cliente || 'Sem descrição',
          value: item.total || item.valor || 0,
          dueDate: item.data_vencimento || item.due_date || new Date().toISOString(),
          status: item.status_traduzido || item.status || 'PENDING',
        })),
        pagination: {
          page: response.data.pagina || page,
          pageSize: response.data.tamanho_pagina || pageSize,
          totalPages: response.data.total_paginas || 1,
          totalCount: response.data.total_elementos || data.length,
        },
      };
    } catch (error) {
      // Retry logic for 401 errors
      if (axios.isAxiosError(error) && error.response?.status === 401 && !isRetry) {
        console.log(`[API] 401 Detected for ${companyId}. Attempting forced token refresh...`);
        try {
          await this.refreshAccessToken(companyId);
          return this.fetchFinancialRecordsFromAPI(endpoint, companyId, page, pageSize, true);
        } catch (refreshError) {
          console.error('[API] Forced refresh failed:', refreshError);
        }
      }

      console.error(`Error fetching ${endpoint} for company ${companyId}:`);
      if (axios.isAxiosError(error) && error.response) {
        console.error(`[API] Status: ${error.response.status}`);
        console.error(`[API] Response:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Sync all financial records (Payables and Receivables) for all authorized companies
   */
  async syncAllCompaniesFinancials(): Promise<{ companyId: string, payables: number, receivables: number, error?: string }[]> {
    console.log('[SyncEngine] Starting global financial synchronization (Payables & Receivables)...');
    
    const authorizedCompanies = await this.prisma.contaAzulAuth.findMany({
      include: { company: true }
    });

    console.log(`[SyncEngine] Found ${authorizedCompanies.length} authorized companies.`);

    const results = [];

    for (const auth of authorizedCompanies) {
      try {
        console.log(`[SyncEngine] Processing company: ${auth.company.name} (${auth.companyId})`);
        
        const payablesCount = await this.syncPayables(auth.companyId);
        const receivablesCount = await this.syncReceivables(auth.companyId);

        results.push({ 
          companyId: auth.companyId, 
          payables: payablesCount, 
          receivables: receivablesCount 
        });
      } catch (error) {
        console.error(`[SyncEngine] Failed to sync company ${auth.companyId}:`, error);
        results.push({ 
          companyId: auth.companyId, 
          payables: 0, 
          receivables: 0,
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return results;
  }

  /**
   * Sync payables from Conta Azul API to local database
   */
  async syncPayables(companyId: string): Promise<number> {
    try {
      let page = 1;
      let totalSynced = 0;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await this.fetchFinancialRecordsFromAPI('contas-a-pagar', companyId, page, 50);
        const records = response.data;

        for (const record of records) {
          try {
            await this.prisma.payable.upsert({
              where: { contaAzulId: record.id },
              update: {
                companyId,
                description: record.description,
                value: record.value,
                dueDate: new Date(record.dueDate),
                status: record.status,
              },
              create: {
                companyId,
                contaAzulId: record.id,
                description: record.description,
                value: record.value,
                dueDate: new Date(record.dueDate),
                status: record.status,
              },
            });
            totalSynced++;
          } catch (dbError) {
            console.error(`[DB] Error saving payable ${record.id}:`, dbError);
          }
        }

        hasMorePages = page < response.pagination.totalPages;
        page++;
        if (page > 100) break;
      }

      return totalSynced;
    } catch (error) {
      console.error(`Error syncing payables for company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Sync receivables from Conta Azul API to local database
   */
  async syncReceivables(companyId: string): Promise<number> {
    try {
      let page = 1;
      let totalSynced = 0;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await this.fetchFinancialRecordsFromAPI('contas-a-receber', companyId, page, 50);
        const records = response.data;

        for (const record of records) {
          try {
            await this.prisma.receivable.upsert({
              where: { contaAzulId: record.id },
              update: {
                companyId,
                description: record.description,
                value: record.value,
                dueDate: new Date(record.dueDate),
                status: record.status,
              },
              create: {
                companyId,
                contaAzulId: record.id,
                description: record.description,
                value: record.value,
                dueDate: new Date(record.dueDate),
                status: record.status,
              },
            });
            totalSynced++;
          } catch (dbError) {
            console.error(`[DB] Error saving receivable ${record.id}:`, dbError);
          }
        }

        hasMorePages = page < response.pagination.totalPages;
        page++;
        if (page > 100) break;
      }

      return totalSynced;
    } catch (error) {
      console.error(`Error syncing receivables for company ${companyId}:`, error);
      throw error;
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
   * Scope must be 'openid profile aws.cognito.signin.user.admin'
   */
  getAuthorizationUrl(state: string): string {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID || '';
    let redirectUri = process.env.CONTA_AZUL_REDIRECT_URI || '';
    
    if (redirectUri && !redirectUri.endsWith('/')) {
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
      scope: 'openid profile aws.cognito.signin.user.admin', 
    });

    console.log('[OAuth] Generating authorization URL with scope: openid profile aws.cognito.signin.user.admin');
    return `https://auth.contaazul.com/login?${params.toString()}`;
  }
}

export default ContaAzulService;