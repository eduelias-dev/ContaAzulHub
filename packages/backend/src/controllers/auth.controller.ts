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
    // 1. Capturar o Code
    const { code, error, error_description, state } = req.query;

    console.log('=== OAuth Callback Received ===');
    console.log('Query params:', req.query);

    // Handle error from Conta Azul
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

    console.log('Code received:', code);

    // 2 & 3. Converter Credenciais para Base64 e Disparar o POST (done inside service)
    const tokenResponse = await contaAzulService.exchangeCodeForToken(code as string);

    // 4. Tratamento de Resposta (Sucesso)
    console.log('Successfully exchanged code for tokens:', tokenResponse);

    // Create or find company
    let companyId = req.query.state; // Using state as a potential carrier for companyId if needed, or check query
    
    let company;
    
    // Check if we already have a valid companyId to link to
    if (companyId && companyId.length > 10) { // Simple check to see if it looks like a CUID/UUID
       company = await prisma.company.findUnique({ where: { id: companyId } });
    }

    if (!company) {
      const companyName = (req.query.companyName as string) || `Company ${Date.now()}`;
      
      // Using create instead of upsert as 'name' is not unique
      company = await prisma.company.create({
        data: {
          name: companyName,
        },
      });
      console.log('Created new company:', company.id);
    } else {
      console.log('Using existing company:', company.id);
    }

    // Save authentication for the company
    await contaAzulService.saveCompanyAuth(
      company.id,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
    );

    console.log('Successfully authenticated company:', company.id);

    // Redirecionar para o frontend com o ID da empresa e status de sucesso
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}?companyId=${company.id}&authenticated=true`);
  } catch (error) {
    // 4. Tratamento de Resposta (Falha)
    console.error('Error in OAuth callback:', error);
    
    // Detailed error logging is already handled in the service, but we catch it here too
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
    const tokenResponse = await contaAzulService.exchangeCodeForToken(code as string);

    // Save authentication for the company
    await contaAzulService.saveCompanyAuth(
      companyId,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
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
