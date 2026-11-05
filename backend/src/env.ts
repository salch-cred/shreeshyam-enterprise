import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  // Optional at import so /health and offline messaging work without a DB.
  // requireDb() in db.ts throws 503 on routes that truly need Postgres.
  DATABASE_URL: z.string().default(''),
  JWT_SECRET: z.string().min(32, 'Set a random JWT_SECRET of at least 32 characters'),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters'),
  CORS_ORIGIN: z.string().default('https://shreeshyamhardware.site'),
  PORT: z.coerce.number().default(4000),
  UPI_ID: z.string().default(''),
  // Optional: set both on Vercel to enable card/netbanking checkout via Cashfree.
  CASHFREE_APP_ID: z.string().default(''),
  CASHFREE_SECRET_KEY: z.string().default(''),
  // Test keys only work with sandbox. Switch to production once the live keys are in.
  CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  // This API's public address, so Cashfree can reach the webhook.
  PUBLIC_API_URL: z.string().default(''),
  // Optional: set both to turn on SMS sign-in. The template must be DLT approved.
  MSG91_AUTH_KEY: z.string().default(''),
  MSG91_TEMPLATE_ID: z.string().default(''),
  // Optional: text the owner on every paid order. The template carries ##invoice## and ##amount##.
  MSG91_OWNER_TEMPLATE_ID: z.string().default(''),
  OWNER_PHONE: z.string().regex(/^$|^[6-9][0-9]{9}$/).default(''),
  OTP_DAILY_CAP: z.coerce.number().int().min(1).default(300),
});

export const env = Env.parse(process.env);
export type Role = 'admin' | 'billing' | 'customer';

// The sample values are public. Refuse to boot on them rather than run with known credentials.
if (/change-me/i.test(env.JWT_SECRET)) throw new Error('JWT_SECRET is still the sample value');
