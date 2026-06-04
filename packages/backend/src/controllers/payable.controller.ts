import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ContaAzulService from '../services/contaAzul.service';

const prisma = new PrismaClient();
const contaAzulService = new ContaAzulService(prisma);

/**
 * POST /api/payables/sync-all
 * Trigger synchronization for all authorized companies (Payables & Receivables)
 */
export const syncAllPayables = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[Backend] Global sync requested (Payables & Receivables)');
    
    // Trigger global sync in background
    const syncPromise = contaAzulService.syncAllCompaniesFinancials();

    res.json({
      success: true,
      message: 'Global synchronization of all financial records started',
    });

    syncPromise.then((results) => {
      const totalPayables = results.reduce((acc, curr) => acc + curr.payables, 0);
      const totalReceivables = results.reduce((acc, curr) => acc + curr.receivables, 0);
      console.log(`[Backend] Global sync completed. Payables: ${totalPayables}, Receivables: ${totalReceivables}`);
    }).catch((error) => {
      console.error('[Backend] Global sync failed:', error);
    });
  } catch (error) {
    console.error('Error triggering global sync:', error);
    res.status(500).json({
      error: 'Failed to trigger global synchronization',
    });
  }
};

/**
 * GET /api/receivables/:companyId
 * List all receivables for a company
 */
export const listReceivables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const skip = (page - 1) * pageSize;

    const [receivables, total] = await Promise.all([
      prisma.receivable.findMany({
        where: { companyId },
        orderBy: { dueDate: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.receivable.count({ where: { companyId } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    res.json({
      data: receivables,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error listing receivables:', error);
    res.status(500).json({ error: 'Failed to list receivables' });
  }
};

/**
 * GET /api/payables/:companyId
 * List all payables for a company
 */
export const listPayables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

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

    // Check if company has authentication
    const auth = await prisma.contaAzulAuth.findUnique({
      where: { companyId },
    });

    if (!auth) {
      res.status(401).json({
        error: 'Company not authenticated with Conta Azul',
        isAuthenticated: false,
      });
      return;
    }

    // Get payables from database with pagination
    const skip = (page - 1) * pageSize;

    const [payables, total] = await Promise.all([
      prisma.payable.findMany({
        where: { companyId },
        select: {
          id: true,
          contaAzulId: true,
          description: true,
          value: true,
          dueDate: true,
          status: true,
          createdAt: true,
        },
        orderBy: { dueDate: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.payable.count({ where: { companyId } }),
    ]);

    console.log(`[Backend] Found ${payables.length} payables for company ${companyId}. Total in DB: ${total}`);

    const totalPages = Math.ceil(total / pageSize);

    res.json({
      data: payables,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error listing payables:', error);
    res.status(500).json({
      error: 'Failed to list payables',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * GET /api/payables/:companyId/:payableId
 * Get a single payable
 */
export const getPayable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, payableId } = req.params;

    const payable = await prisma.payable.findFirst({
      where: {
        id: payableId,
        companyId,
      },
    });

    if (!payable) {
      res.status(404).json({
        error: 'Payable not found',
      });
      return;
    }

    res.json(payable);
  } catch (error) {
    console.error('Error getting payable:', error);
    res.status(500).json({
      error: 'Failed to get payable',
    });
  }
};

/**
 * GET /api/receivables/:companyId/:receivableId
 * Get a single receivable
 */
export const getReceivable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId, receivableId } = req.params;

    const receivable = await prisma.receivable.findFirst({
      where: {
        id: receivableId,
        companyId,
      },
    });

    if (!receivable) {
      res.status(404).json({ error: 'Receivable not found' });
      return;
    }

    res.json(receivable);
  } catch (error) {
    console.error('Error getting receivable:', error);
    res.status(500).json({ error: 'Failed to get receivable' });
  }
};

/**
 * POST /api/receivables/:companyId/sync
 * Trigger manual synchronization of receivables from Conta Azul API
 */
export const syncReceivables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    // Verify company exists
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Trigger sync in background
    const syncPromise = contaAzulService.syncReceivables(companyId);

    res.json({
      success: true,
      message: 'Receivables synchronization started',
      companyId,
    });

    syncPromise.then((count) => {
      console.log(`Successfully synced ${count} receivables for company ${companyId}`);
    }).catch((error) => {
      console.error(`Failed to sync receivables for company ${companyId}:`, error);
    });
  } catch (error) {
    console.error('Error triggering receivables sync:', error);
    res.status(500).json({ error: 'Failed to trigger synchronization' });
  }
};

/**
 * POST /api/payables/:companyId/sync
 * Trigger manual synchronization of payables from Conta Azul API
 */
export const syncPayables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

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

    // Check if company has authentication
    const auth = await prisma.contaAzulAuth.findUnique({
      where: { companyId },
    });

    if (!auth) {
      res.status(401).json({
        error: 'Company not authenticated with Conta Azul',
        isAuthenticated: false,
      });
      return;
    }

    // Trigger sync in background (optional: could use a queue)
    const syncPromise = contaAzulService.syncPayables(companyId);

    // Return immediately (don't wait for completion in production)
    // This prevents timeout on large syncs
    res.json({
      success: true,
      message: 'Synchronization started',
      companyId,
    });

    // Log sync result in background
    syncPromise
      .then((count) => {
        console.log(`Successfully synced ${count} payables for company ${companyId}`);
      })
      .catch((error) => {
        console.error(`Failed to sync payables for company ${companyId}:`, error);
      });
  } catch (error) {
    console.error('Error triggering sync:', error);
    res.status(500).json({
      error: 'Failed to trigger synchronization',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * GET /api/payables/:companyId/sync/status
 * Get the status of the last synchronization
 */
export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

    // Get the last updated payable for this company
    const lastPayable = await prisma.payable.findFirst({
      where: { companyId },
      select: {
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Count total payables
    const totalPayables = await prisma.payable.count({
      where: { companyId },
    });

    res.json({
      lastSyncAt: lastPayable?.updatedAt || null,
      totalPayables,
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      error: 'Failed to get sync status',
    });
  }
};

/**
 * DELETE /api/payables/:companyId
 * Delete all payables for a company (useful for testing)
 */
export const deleteAllPayables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;

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

    const result = await prisma.payable.deleteMany({
      where: { companyId },
    });

    res.json({
      success: true,
      deletedCount: result.count,
      message: `Deleted ${result.count} payables`,
    });
  } catch (error) {
    console.error('Error deleting payables:', error);
    res.status(500).json({
      error: 'Failed to delete payables',
    });
  }
};
