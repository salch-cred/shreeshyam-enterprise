/* API tests against a real Postgres engine (PGlite). Tables match what `prisma db push`
   creates, including the absence of column defaults that Prisma fills in client-side.

   Setup:  npm i -D @electric-sql/pglite @electric-sql/pglite-socket
   Run:    npx tsx tests/api.test.ts                                                */
import { createHmac } from 'crypto';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { join } from 'path';

const req = createRequire(process.env.PGLITE_PATH ? join(process.env.PGLITE_PATH, 'x.js') : __filename);
const SCHEMA = `
CREATE TABLE products(id text PRIMARY KEY,name text NOT NULL,brand text NOT NULL DEFAULT '-',category text NOT NULL DEFAULT 'General',unit text NOT NULL DEFAULT 'pcs',hsn text NOT NULL DEFAULT '',image text NOT NULL DEFAULT '',rate_retail int NOT NULL,rate_wholesale int NOT NULL,gst_pct int NOT NULL DEFAULT 18,stock int NOT NULL DEFAULT 0,min_stock int NOT NULL DEFAULT 5,updated_at timestamp(3) NOT NULL);
CREATE TABLE users(id text PRIMARY KEY,name text NOT NULL,phone text NOT NULL UNIQUE,password_hash text NOT NULL,role text NOT NULL DEFAULT 'customer',created_at timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE invoices(no text PRIMARY KEY,date timestamp(3) NOT NULL DEFAULT now(),type text NOT NULL DEFAULT 'TAX',customer text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',items jsonb NOT NULL,subtotal int NOT NULL DEFAULT 0,discount int NOT NULL DEFAULT 0,gst int NOT NULL DEFAULT 0,grand int NOT NULL DEFAULT 0,paid int NOT NULL DEFAULT 0,balance int NOT NULL DEFAULT 0);
CREATE TABLE orders(id text PRIMARY KEY,source text NOT NULL DEFAULT 'web',text text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'new',created timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE stock_log(id serial PRIMARY KEY,product_id text NOT NULL,delta int NOT NULL,reason text NOT NULL DEFAULT '',date timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE content(key text PRIMARY KEY,value jsonb NOT NULL);
INSERT INTO products(id,name,rate_retail,rate_wholesale,gst_pct,stock,updated_at) VALUES('A','Priced part',1000,900,18,10,now()),('Q','Quote part',0,0,18,10,now());
`;

let pass = 0, fail = 0;
const check = (name: string, ok: unknown, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(detail)}`); };

function boots(env: Record<string, string>) {
  try { execFileSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/env.ts')"], { env: { ...process.env, ...env, DOTENV_CONFIG_PATH: 'none' }, stdio: 'pipe' }); return true; } catch { return false; }
}
const JWT = 'x'.repeat(16) + 'y'.repeat(32);
check('Refuses to boot on the sample JWT secret', !boots({ JWT_SECRET: 'change-me-to-32-random-chars-000000', ADMIN_PIN: '749163', BILLING_PIN: '749164' }));
check('Refuses to boot on a short PIN', !boots({ JWT_SECRET: JWT, ADMIN_PIN: '2580', BILLING_PIN: '749164' }));
check('Refuses to boot with identical PINs', !boots({ JWT_SECRET: JWT, ADMIN_PIN: '749163', BILLING_PIN: '749163' }));
check('Boots on proper values', boots({ JWT_SECRET: JWT, ADMIN_PIN: '749163', BILLING_PIN: '749164' }));

async function main() {
  const { PGlite } = req('@electric-sql/pglite');
  const { PGLiteSocketServer } = req('@electric-sql/pglite-socket');
  const pg = await PGlite.create();
  await pg.exec(SCHEMA);
  const sock = new PGLiteSocketServer({ db: pg, port: 54329, host: '127.0.0.1', maxConnections: 20 });
  await sock.start();
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable', JWT_SECRET: JWT,
    ADMIN_PIN: '749163', BILLING_PIN: '749164', UPI_ID: 'test@upi', CASHFREE_SECRET_KEY: '', CORS_ORIGIN: 'https://shreeshyamhardware.site',
  });
  const { createApp } = await import('../src/app.js');
  const { tx, requireDb } = await import('../src/db.js');
  const { signToken } = await import('../src/auth.js');
  const { env } = await import('../src/env.js');
  const srv = createApp().listen(0);
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const call = async (path: string, opts: { method?: string; body?: unknown; token?: string; raw?: string; headers?: Record<string, string> } = {}) => {
    const r = await fetch(base + path, {
      method: opts.method || (opts.body !== undefined || opts.raw ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: 'Bearer ' + opts.token } : {}), ...opts.headers },
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) as Record<string, any> };
  };
  const q = async (sql: string, a: unknown[] = []) => (await requireDb().query(sql, a)).rows;
  const buyer = { name: 'Test Plant', phone: '9876543210', address: 'Plot 1, RIICO', method: 'cod' };

  let r = await call('/payments/create-order', { body: { ...buyer, items: [{ id: 'A', qty: 2, rate: 1, gst_pct: 0, name: 'cheap' }] } });
  check('Tampered price is ignored: server charges its own rate', r.status === 201 && r.json.grand === 2360, r);
  r = await call('/payments/create-order', { body: { ...buyer, items: [{ id: 'NOPE', qty: 1 }] } });
  check('Unknown item is refused', r.status === 409, r);
  r = await call('/payments/create-order', { body: { ...buyer, items: [{ id: 'Q', qty: 1 }] } });
  check('Unpriced item becomes a quote, nothing charged', r.status === 201 && r.json.mode === 'quote', r);
  r = await call('/payments/create-order', { body: { ...buyer, phone: '123', items: [{ id: 'A', qty: 1 }] } });
  check('Bad phone is refused without leaking internals', r.status === 400 && !/issues|zod/i.test(JSON.stringify(r.json)), r);

  r = await call('/auth/login', { body: { pin: '749163' } });
  const admin = r.json.token as string;
  check('Admin PIN logs in', r.status === 200 && r.json.role === 'admin', r);
  const bill = (await call('/auth/login', { body: { pin: '749164' } })).json.token as string;
  check('Billing PIN gets the billing role only', !!bill);
  r = await call('/products', { body: { name: 'New part', rate_retail: 500, rate_wholesale: 450 } });
  check('Adding a product needs a token', r.status === 401, r);
  r = await call('/products', { body: { name: 'New part', rate_retail: 500, rate_wholesale: 450 }, token: bill });
  check('Billing role cannot edit products', r.status === 403, r);
  r = await call('/products', { body: { name: 'New part', rate_retail: 500, rate_wholesale: 450 }, token: admin });
  check('Admin can add a product (insert was broken)', r.status === 201, r);
  const pid = r.json.id;
  r = await call('/products?page=abc&pageSize=xyz');
  check('Junk paging values do not crash', r.status === 200 && r.json.total === 3, r);
  r = await call(`/products/${pid}/stock`, { body: { delta: 5 }, token: bill });
  check('Stock move works in one transaction', r.status === 200 && (await q('SELECT stock FROM products WHERE id=$1', [pid]))[0].stock === 5, r);
  r = await call('/products/NOPE/stock', { body: { delta: 5 }, token: bill });
  check('Stock move on a missing product is 404', r.status === 404, r);
  r = await call(`/products/${pid}`, { method: 'DELETE', token: admin });
  check('Admin can delete a product', r.status === 200, r);

  const items = [{ id: 'A', name: 'Priced part', qty: 2, rate: 1000, gst_pct: 18 }];
  r = await call('/invoices', { body: { items, customer: 'X', discount: 200, paid: 1000 }, token: bill });
  check('Bill: discount comes off before GST', r.status === 201 && r.json.grand === 2124 && r.json.gst === 324 && r.json.balance === 1124, r);
  check('Bill number uses this financial year', /^SSE\/\d\d-\d\d\/0001$/.test(r.json.no), r);
  check('Tax bill cut the stock', (await q(`SELECT stock FROM products WHERE id='A'`))[0].stock === 8);
  r = await call('/invoices', { body: { items, paid: 99999 }, token: bill });
  check('Received above the total is refused', r.status === 400, r);
  r = await call('/invoices', { body: { items, discount: 99999 }, token: bill });
  check('Discount above the value is refused', r.status === 400, r);
  r = await call('/invoices', { body: { items, paid: 0 } });
  check('Bills need a login', r.status === 401, r);
  const before = (await q('SELECT count(*)::int c FROM orders'))[0].c;
  await tx(async (c) => { await c.query(`INSERT INTO orders(id) VALUES('ROLLME')`); throw new Error('boom'); }).catch(() => {});
  check('A failed transaction rolls back fully', (await q('SELECT count(*)::int c FROM orders'))[0].c === before);

  r = await call('/auth/register', { body: { name: 'Plant', phone: '9000000001', password: 'longenough1' } });
  check('Customer can register (insert was broken)', r.status === 201, r);
  const cust = r.json.token as string;
  r = await call('/auth/register', { body: { name: 'Plant', phone: '9000000001', password: 'longenough1' } });
  check('Duplicate phone is refused', r.status === 409, r);
  r = await call('/auth/register', { body: { name: 'Plant', phone: '9000000002', password: 'short' } });
  check('Weak password is refused', r.status === 400, r);
  r = await call('/auth/login-customer', { body: { phone: '9000000001', password: 'longenough1' } });
  check('Customer can sign in', r.status === 200, r);
  r = await call('/auth/login-customer', { body: { phone: '9000000099', password: 'wrongwrong' } });
  check('Unknown phone gets the same error', r.status === 401 && /Wrong phone or password/.test(r.json.error), r);
  r = await call('/invoices/mine', { token: cust });
  check('Unverified phone cannot read anyone’s bills', r.status === 404 || r.status === 401, r);
  r = await call('/orders', { token: cust });
  check('Customer token cannot list orders', r.status === 403, r);

  const forged = Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from('{"role":"admin"}').toString('base64url') + '.';
  r = await call('/orders', { token: forged });
  check('Forged alg=none token is rejected', r.status === 401, r);
  r = await call('/content', { method: 'PUT', body: { evil: 1 }, token: admin });
  check('Settings accept known keys only', r.status === 400, r);
  r = await call('/orders', { body: { text: "x'); DROP TABLE orders; --" } });
  check('SQL injection is stored as plain text', r.status === 201 && (await q('SELECT count(*)::int c FROM orders'))[0].c > 0, r);
  r = await call("/products?q=' OR 1=1 --");
  check('SQL injection in search returns nothing', r.status === 200 && r.json.total === 0, r);
  r = await call('/products', { raw: '{bad json', token: admin });
  check('Malformed JSON is a clean 400', r.status === 400, r);
  const huge = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(400000) }) });
  check('Oversized body is refused', huge.status === 413, huge.status);

  // webhook
  (env as { CASHFREE_SECRET_KEY: string }).CASHFREE_SECRET_KEY = 'cf_secret';
  const made = await q(`SELECT id,text FROM orders WHERE source='checkout' LIMIT 1`);
  const id = made[0].id, amount = JSON.parse(made[0].text).amount;
  const hook = (amt: number, secret = 'cf_secret') => {
    const raw = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: id }, payment: { payment_status: 'SUCCESS', payment_amount: amt } } });
    const ts = '1700000000', sig = createHmac('sha256', secret).update(ts + raw).digest('base64');
    return call('/payments/webhook', { raw, headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': sig } });
  };
  const status = async () => (await q('SELECT status FROM orders WHERE id=$1', [id]))[0].status;
  r = await hook(amount, 'wrong_secret');
  check('Forged webhook is rejected', r.status === 401 && await status() === 'new', r);
  await hook(1);
  check('Underpaid webhook does not mark the order paid', await status() === 'new');
  await hook(amount);
  check('Signed webhook with the right amount marks it paid', await status() === 'paid');

  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call('/auth/login', { body: { pin: '000000' } })).status;
  check('PIN guessing is rate limited', last === 429, last);

  srv.close();
  await requireDb().end();
  await sock.stop();
  console.log(`\n${pass} of ${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
