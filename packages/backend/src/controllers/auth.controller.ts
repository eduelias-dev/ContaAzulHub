import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ContaAzulService from '../services/contaAzul.service';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const contaAzulService = new ContaAzulService(prisma);

interface AuthRequest extends Request {
  query: {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
    companyName?: string;
  };
}

/**
 * GET /api/auth/authorize
 * Redirects user to Conta Azul authorization URL
 */
export const initiateOAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('=== Initiate OAuth ===');
    const state = randomUUID();
    const authUrl = contaAzulService.getAuthorizationUrl(state);

    console.log('Auth URL:', authUrl);

    res.json({
      authUrl,
      message: 'Redirect to this URL to authorize',
    });
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({
      error: 'Failed to initiate OAuth flow',
    });
  }
};

/**
 * GET /api/auth/callback
 * Receives authorization code from Conta Azul and exchanges it for tokens
 * Expects query params: code, state, and optionally companyName
 */
export const handleOAuthCallback = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { code, error, error_description } = req.query;

    console.log('=== OAuth Callback Received ===');

    if (error) {
      console.error('Error from Conta Azul:', error, error_description);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}?error=${error}&description=${error_description}`);
    }

    if (!code) {
      console.error('Authorization code is missing');
      res.status(400).json({ error: 'Authorization code is missing' });
      return;
    }

    // 1. Exchange code for tokens (could be multiple companies)
    const tokenResponses = await contaAzulService.exchangeCodeForToken(code as string);
    console.log(`[OAuth] Received tokens for ${tokenResponses.length} companies.`);

    const results = [];

    // 2. Iterate through each company token and save/update
    for (const token of tokenResponses) {
      // If we only have one token and it doesn't have company info, it might be an accountant token
      // Let's try to discover companies using it
      if (tokenResponses.length === 1 && !token.company_id) {
        console.log('[OAuth] Single token detected without company ID. Attempting discovery flow...');
        const discoveredCompanies = await contaAzulService.fetchCompanies(token.access_token);
        
        if (discoveredCompanies.length > 0) {
           console.log(`[OAuth] Discovered ${discoveredCompanies.length} companies under this login.`);
           for (const disc of discoveredCompanies) {
              let company = await prisma.company.findFirst({ where: { name: disc.name } });
              if (!company) {
                company = await prisma.company.create({ data: { name: disc.name } });
              }
              
              // Note: In BPO flow, sometimes we use the SAME token for all companies
              // or the API provides a way to switch context. For now, we link the same token.
              await contaAzulService.saveCompanyAuth(
                company.id,
                token.access_token,
                token.refresh_token,
                token.expires_in
              );
              results.push({ id: company.id, name: company.name, caId: disc.id });
           }
           continue; // Move to next token (though there is only one in this branch)
        }
      }

      // Standard single-company or batch-token flow
      const caCompanyId = token.company_id || `ca_${Date.now()}`;
      const caCompanyName = token.company_name || `Empresa ${caCompanyId}`;

      let company = await prisma.company.findFirst({
        where: { name: caCompanyName }
      });

      if (!company) {
        company = await prisma.company.create({
          data: { name: caCompanyName }
        });
      }

      await contaAzulService.saveCompanyAuth(
        company.id,
        token.access_token,
        token.refresh_token,
        token.expires_in
      );

      results.push({
        id: company.id,
        name: company.name,
        caId: caCompanyId
      });
      
      console.log(`[OAuth] Saved/Updated company: ${company.name} (${company.id})`);
    }

    // 3. Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const firstCompanyId = results.length > 0 ? results[0].id : '';
    
    return res.redirect(`${frontendUrl}/dashboard?authenticated=true&count=${results.length}&companyId=${firstCompanyId}`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).json({
      error: 'callback_error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * POST /api/auth/authorize/:companyId
 * Manually authorize a company with new credentials
 */
export const authorizeCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        error: 'Authorization code is required',
      });
      return;
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      res.status(404).json({
        error: 'Company not found',
      });
      return;
    }

    // Exchange code for tokens
    const tokenResponses = await contaAzulService.exchangeCodeForToken(code as string);

    if (tokenResponses.length === 0) {
      res.status(400).json({ error: 'No tokens received' });
      return;
    }

    // Since we are authorizing a specific company, we take the first token
    // In a multi-company scenario, this manual authorize might need more context
    const token = tokenResponses[0];

    // Save authentication for the company
    await contaAzulService.saveCompanyAuth(
      companyId,
      token.access_token,
      token.refresh_token,
      token.expires_in
    );

    res.json({
      success: true,
      companyId,
      message: 'Company authorization updated successfully',
    });
  } catch (error) {
    console.error('Error authorizing company:', error);
    res.status(500).json({
      error: 'Failed to authorize company',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * POST /api/auth/refresh/:companyId
 * Manually refresh the access token for a company
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      res.status(400).json({ error: 'Company ID is required' });
      return;
    }

    console.log(`=== Manual Token Refresh for Company: ${companyId} ===`);

    const tokenResponse = await contaAzulService.refreshAccessToken(companyId);

    res.json({
      success: true,
      companyId,
      tokens: tokenResponse,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing token in controller:', error);
    res.status(500).json({
      error: 'refresh_error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/auth/company/:companyId
 * Get company details
 */
export const getCompanyDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        contaAzulAuth: {
          select: {
            id: true,
            expiresAt: true,
            updatedAt: true,
          }
        }
      }
    });

    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(company);
  } catch (error) {
    console.error('Error fetching company details:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
};

/**
 * DELETE /api/auth/disconnect/:companyId
 * Remove Conta Azul authentication for a company
 */
export const disconnectCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    await prisma.contaAzulAuth.deleteMany({
      where: { companyId }
    });

    res.json({
      success: true,
      message: 'Disconnected from Conta Azul successfully'
    });
  } catch (error) {
    console.error('Error disconnecting company:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};

/**
 * GET /api/auth/status/:companyId
 * Check if a company has active Conta Azul authentication
 */
export const getAuthStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    const auth = await prisma.contaAzulAuth.findUnique({
      where: { companyId },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!auth) {
      res.json({
        isAuthenticated: false,
      });
      return;
    }

    const isExpired = new Date() > auth.expiresAt;

    res.json({
      isAuthenticated: true,
      isExpired,
      expiresAt: auth.expiresAt,
      createdAt: auth.createdAt,
      updatedAt: auth.updatedAt,
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({
      error: 'Failed to check authentication status',
    });
  }
};
