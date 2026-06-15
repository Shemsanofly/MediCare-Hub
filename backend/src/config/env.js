import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '8000', 10),
  DATABASE_URL: process.env.DATABASE_URL || './data/medicare_hub.sqlite',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  REDIS_URL: process.env.REDIS_URL || '',
  SEED_TEST_PASSWORD: process.env.SEED_TEST_PASSWORD || 'LocalTestPass1!',
  PAYMENT_GATEWAYS: {
    selcom: {
      apiKey: process.env.SELCOM_API_KEY || '',
      apiSecret: process.env.SELCOM_API_SECRET || '',
    },
    mpesa: {
      apiKey: process.env.MPESA_API_KEY || '',
      apiSecret: process.env.MPESA_API_SECRET || '',
    },
    airtel: {
      apiKey: process.env.AIRTEL_API_KEY || '',
      apiSecret: process.env.AIRTEL_API_SECRET || '',
    },
  },
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE ?? 'true') !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
    fromName: process.env.SMTP_FROM_NAME || 'MediCare Hub',
    appBaseUrl: process.env.APP_BASE_URL || 'https://agent01.overssh.com',
  },
  STRIPE: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: (process.env.STRIPE_CURRENCY || 'usd').toLowerCase(),
    appBaseUrl: process.env.APP_BASE_URL || 'https://agent01.overssh.com',
  },
  SMS_API_KEY: process.env.SMS_API_KEY || '',
};
