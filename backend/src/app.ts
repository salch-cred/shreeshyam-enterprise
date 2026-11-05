import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { authRoutes } from './routes/auth.js';
import { billing } from './routes/billing.js';
import { customer } from './routes/customer.js';
import { misc } from './routes/misc.js';
import { products } from './routes/products.js';
import { env } from './env.js';
import { payments } from './routes/payments.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Vercel/proxied deploys: real client IP for rate limiting
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), maxAge: 86400 }));
  // The webhook route reads the raw body to check its signature, so JSON parsing skips it.
  app.use((req, res, next) => (req.path === '/payments/webhook' ? next() : express.json({ limit: '256kb' })(req, res, next)));

  app.get('/health', (_req, res) => res.json({ ok: true, db: Boolean(process.env.DATABASE_URL) }));
  app.use('/auth', authRoutes);
  app.use('/products', products);
  app.use('/', customer);
  app.use('/', billing);
  app.use('/', misc);
  app.use('/', payments);

  // Typed error surface — never leaks stack to clients
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as { status?: number; message?: string; issues?: unknown };
    const status = e.status || (e.issues ? 400 : 500);
    if (status >= 500) console.error('[api]', e);
    res.status(status).json({ error: status >= 500 ? 'Server error' : (e.issues ? 'Please check the details and try again' : e.message || 'Bad request') });
  });
  return app;
}

// Default app instance for the Vercel Express builder, which loads the
// server module itself and requires a default function-or-server export.
export default createApp();
