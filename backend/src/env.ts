import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  // Optional at import so /health and offline messaging work without a DB.
  // requireDb() in db.ts throws 503 on routes that truly need Postgres.
  DATABASE_URL: z.string().default(''),
  JWT_SECRET: z.string().min(16, 'Set 32-char JWT_SECRET'),
  ADMIN_PIN: z.string().default('2580'),
  BILLING_PIN: z.string().default('2580'),
  CORS_ORIGIN: z.string().default('https://shreeshyamhardware.site'),
  PORT: z.coerce.number().default(4000),
  UPI_ID: z.string().default('shreeshyam@upi'),
  // Optional: set both on Vercel to enable card/netbanking checkout via Cashfree.
  CASHFREE_APP_ID: z.string().default(''),
  CASHFREE_SECRET_KEY: z.string().default(''),
});

export const env = Env.parse(process.env);
export type Role = 'admin' | 'billing' | 'customer';
