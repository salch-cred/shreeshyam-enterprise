import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  // Optional at import so /health and offline messaging work without a DB.
  // requireDb() in db.ts throws 503 on routes that truly need Postgres.
  DATABASE_URL: z.string().default(''),
  JWT_SECRET: z.string().min(32, 'Set a random JWT_SECRET of at least 32 characters'),
  ADMIN_PIN: z.string().min(6, 'ADMIN_PIN must be at least 6 digits'),
  BILLING_PIN: z.string().min(6, 'BILLING_PIN must be at least 6 digits'),
  CORS_ORIGIN: z.string().default('https://shreeshyamhardware.site'),
  PORT: z.coerce.number().default(4000),
  UPI_ID: z.string().default(''),
  // Optional: set both on Vercel to enable card/netbanking checkout via Cashfree.
  CASHFREE_APP_ID: z.string().default(''),
  CASHFREE_SECRET_KEY: z.string().default(''),
});

export const env = Env.parse(process.env);
export type Role = 'admin' | 'billing' | 'customer';

// The sample values are public. Refuse to boot on them rather than run with known credentials.
if (/change-me/i.test(env.JWT_SECRET)) throw new Error('JWT_SECRET is still the sample value');
if (env.ADMIN_PIN === env.BILLING_PIN) throw new Error('ADMIN_PIN and BILLING_PIN must differ');
