import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase } from './config/database.js';
import { initCartTable } from './services/cartService.js';
import { env } from './config/env.js';
import { errorResponse } from './utils/errors.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import marketplaceRoutes from './routes/marketplaceRoutes.js';
import ordersRoutes from './routes/ordersRoutes.js';
import paymentsRoutes from './routes/paymentsRoutes.js';
import paymentSimulationRoutes from './routes/paymentSimulationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import notificationsRoutes from './routes/notificationsRoutes.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Health check
app.get('/health/', (req, res) => {
  res.json({ status: 'ok', service: 'medicare-hub-backend', version: '1.0.0' });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static uploads (product images)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/payments/simulate', paymentSimulationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND' });
});

// Error handler
app.use((err, req, res, next) => {
  errorResponse(res, err);
});

// Initialize database and start server
initDatabase();
initCartTable();

const PORT = env.PORT;
app.listen(PORT, () => {
  if (env.NODE_ENV !== 'test') {
    console.log(`MediCare Hub API running on http://127.0.0.1:${PORT}/api/v1/`);
  }
});

export default app;
