import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';

import * as authController from './controllers/auth.controller';
import * as payableController from './controllers/payable.controller';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ============ Authentication Routes ============
// GET /api/auth/authorize - Initiate OAuth flow
app.get('/api/auth/authorize', authController.initiateOAuth);

// GET /api/auth/callback/ - OAuth callback handler
app.get('/api/auth/callback/', authController.handleOAuthCallback);

// GET /api/auth/company/:companyId - Get company details
app.get('/api/auth/company/:companyId', authController.getCompanyDetails);

// POST /api/auth/authorize/:companyId - Authorize a specific company
app.post('/api/auth/authorize/:companyId', authController.authorizeCompany);

// GET /api/auth/status/:companyId - Check authentication status
app.get('/api/auth/status/:companyId', authController.getAuthStatus);

// POST /api/auth/refresh/:companyId - Manually refresh access token
app.post('/api/auth/refresh/:companyId', authController.refreshToken);

// DELETE /api/auth/disconnect/:companyId - Remove authentication
app.delete('/api/auth/disconnect/:companyId', authController.disconnectCompany);

// ============ Payable Routes ============
// GET /api/payables/:companyId - List payables
app.get('/api/payables/:companyId', payableController.listPayables);

// GET /api/payables/:companyId/:payableId - Get single payable
app.get('/api/payables/:companyId/:payableId', payableController.getPayable);

// POST /api/payables/:companyId/sync - Trigger manual sync
app.post('/api/payables/:companyId/sync', payableController.syncPayables);

// GET /api/payables/:companyId/sync/status - Get sync status
app.get('/api/payables/:companyId/sync/status', payableController.getSyncStatus);

// DELETE /api/payables/:companyId - Delete all payables (testing)
app.delete('/api/payables/:companyId', payableController.deleteAllPayables);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📚 API Health: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📛 Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
