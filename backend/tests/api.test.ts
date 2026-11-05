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
CREATE TABLE users(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,phone text NOT NULL DEFAULT '',password_hash text NOT NULL DEFAULT '',gstin text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',role text NOT NULL DEFAULT 'customer',last_login timestamp(3),created_at timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE login_log(id serial PRIMARY KEY,email text NOT NULL,at timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE invoices(no text PRIMARY KEY,date timestamp(3) NOT NULL DEFAULT now(),type text NOT NULL DEFAULT 'TAX',customer text NOT NULL DEFAULT '',phone text NOT NULL DEFAULT '',gstin text NOT NULL DEFAULT '',address text NOT NULL DEFAULT '',order_id text NOT NULL DEFAULT '',mode text NOT NULL DEFAULT '',items jsonb NOT NULL,subtotal int NOT NULL DEFAULT 0,discount int NOT NULL DEFAULT 0,gst int NOT NULL DEFAULT 0,grand int NOT NULL DEFAULT 0,paid int NOT NULL DEFAULT 0,balance int NOT NULL DEFAULT 0);
CREATE TABLE orders(id text PRIMARY KEY,source text NOT NULL DEFAULT 'web',text text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'new',phone text NOT NULL DEFAULT '',email text NOT NULL DEFAULT '',invoice_no text NOT NULL DEFAULT '',paid_at timestamp(3),created timestamp(3) NOT NULL DEFAULT now());
CREATE TABLE otp_codes(id text PRIMARY KEY,email text NOT NULL,ip text NOT NULL,code_hash text NOT NULL,attempts int NOT NULL DEFAULT 0,used boolean NOT NULL DEFAULT false,created timestamp(3) NOT NULL DEFAULT now(),expires timestamp(3) NOT NULL);
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
check('Refuses to boot on the sample JWT secret', !boots({ JWT_SECRET: 'change-me-to-32-random-chars-000000', ADMIN_PASSWORD: 'counter-pass-1' }));
check('Refuses to boot on a short password', !boots({ JWT_SECRET: JWT, ADMIN_PASSWORD: 'short' }));
check('Boots on proper values', boots({ JWT_SECRET: JWT, ADMIN_PASSWORD: 'counter-pass-1' }));

async function main() {
  const { PGlite } = req('@electric-sql/pglite');
  const { PGLiteSocketServer } = req('@electric-sql/pglite-socket');
  const pg = await PGlite.create();
  await pg.exec(SCHEMA);
  const sock = new PGLiteSocketServer({ db: pg, port: 54329, host: '127.0.0.1', maxConnections: 20 });
  await sock.start();
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable', JWT_SECRET: JWT,
    ADMIN_PASSWORD: 'counter-pass-1', UPI_ID: 'test@upi', CASHFREE_SECRET_KEY: '', RESEND_API_KEY: 're_key', OWNER_EMAIL: 'owner@example.com', OTP_DAILY_CAP: '60', CORS_ORIGIN: 'https://shreeshyamhardware.site',
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

  r = await call('/auth/login', { body: { password: 'counter-pass-1' } });
  const admin = r.json.token as string;
  check('Admin password logs in', r.status === 200 && r.json.role === 'admin', r);
  const bill = signToken('billing');
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

  // Email sign-in. Outbound calls are captured, so no real email or payment is ever sent.
  const realFetch = globalThis.fetch, texts: { url: string; body: any; headers: any }[] = [];
  let mailDown = false, cf: { create?: any; order?: any } = {};
  globalThis.fetch = (async (u: any, o: any = {}) => {
    const url = String(u);
    if (url.includes('resend.com')) {
      texts.push({ url, body: JSON.parse(o.body), headers: o.headers });
      return new Response(JSON.stringify({ id: 'm1' }), { status: mailDown ? 500 : 200 });
    }
    if (url.includes('cashfree.com')) {
      texts.push({ url, body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
      return new Response(JSON.stringify(o.method === 'POST' ? (cf.create ?? { payment_session_id: 'sess_1' }) : cf.order), { status: 200 });
    }
    return realFetch(u, o);
  }) as typeof fetch;
  const mails = () => texts.filter((t) => t.url.includes('resend'));
  const lastCode = () => /\b(\d{6})\b/.exec(mails().at(-1)!.body.text)![1];
  const clearOtp = () => requireDb().query('DELETE FROM otp_codes');
  const email = 'plant@example.com', phone = '9000000001';

  r = await call('/auth/otp/status');
  check('Page can see email sign-in is on', r.json.email === true, r);
  r = await call('/auth/otp/request', { body: { email: 'not-an-email' } });
  check('A bad email address is refused', r.status === 400, r);
  r = await call('/auth/otp/request', { body: { email: ' Plant@Example.com ' } });
  check('A code is emailed through Resend, in lower case', r.status === 200 && mails().length === 1 && /^[0-9]{6}$/.test(lastCode()) && mails()[0].body.to[0] === email && mails()[0].headers.Authorization === 'Bearer re_key', r);
  check('The code never comes back to the browser', !JSON.stringify(r.json).includes(lastCode()));
  check('The code is stored only as a hash', !(await q('SELECT code_hash FROM otp_codes'))[0].code_hash.includes(lastCode()));
  r = await call('/auth/otp/request', { body: { email } });
  check('A second email within the cooldown is refused', r.status === 429 && mails().length === 1, r);
  const good = lastCode(), bad = good === '111111' ? '222222' : '111111';
  r = await call('/auth/otp/verify', { body: { email, phone, code: bad } });
  check('A wrong code is refused', r.status === 401, r);
  r = await call('/auth/otp/verify', { body: { email: 'other@example.com', phone, code: good } });
  check('A code does not work for another address', r.status === 401, r);
  r = await call('/auth/otp/verify', { body: { email, code: good } });
  check('Signing in needs a mobile number', r.status === 400, r);
  r = await call('/auth/otp/verify', { body: { email, phone: '12345', code: good } });
  check('Signing in refuses a bad mobile number', r.status === 400, r);
  await q(`UPDATE otp_codes SET expires = now() - interval '1 minute'`);
  r = await call('/auth/otp/verify', { body: { email, phone, code: good } });
  check('An expired code is refused', r.status === 401, r);
  await q(`UPDATE otp_codes SET expires = now() + interval '5 minutes', attempts = 5`);
  r = await call('/auth/otp/verify', { body: { email, phone, code: good } });
  check('Five wrong guesses burn the code, even for the right one', r.status === 401, r);
  await q(`UPDATE otp_codes SET attempts = 0`);
  r = await call('/auth/otp/verify', { body: { email, phone, code: good } });
  check('The right code signs in and saves the mobile', r.status === 200 && r.json.user.email === email && r.json.user.phone === phone && r.json.user.name === '', r);
  const cust = r.json.token as string;
  r = await call('/auth/otp/verify', { body: { email, phone, code: good } });
  check('A code works only once', r.status === 401, r);
  await clearOtp();
  await call('/auth/otp/request', { body: { email } });
  r = await call('/auth/otp/verify', { body: { email, phone, code: lastCode() } });
  check('Signing in again keeps the same customer', r.status === 200 && (await q('SELECT count(*)::int c FROM users WHERE email=$1', [email]))[0].c === 1, r);
  await clearOtp();
  mailDown = true;
  r = await call('/auth/otp/request', { body: { email } });
  check('A failed email leaves no live code behind', r.status === 502 && !(await q('SELECT 1 FROM otp_codes')).length, r);
  mailDown = false;
  await q(`INSERT INTO otp_codes(id,email,ip,code_hash,created,expires) SELECT 'p'||g,$1,'x','x',now() - interval '10 minutes',now() FROM generate_series(1,4) g`, [email]);
  r = await call('/auth/otp/request', { body: { email } });
  check('Four emails in an hour stops a fifth', r.status === 429 && /hour/.test(r.json.error), r);
  await clearOtp();
  await q(`INSERT INTO otp_codes(id,email,ip,code_hash,created,expires) SELECT 'd'||g,'d'||g,'x','x',now() - interval '2 hours',now() FROM generate_series(1,60) g`);
  r = await call('/auth/otp/request', { body: { email } });
  check('The daily cap protects the email allowance', r.status === 429, r);
  await clearOtp();
  r = await call('/auth/register', { body: { name: 'Plant', phone: '9000000001', password: 'longenough1' } });
  check('Password sign-up no longer exists', r.status === 404, r);

  r = await call('/me', { method: 'PUT', token: cust, body: { name: 'Plant', phone, gstin: 'bad', address: '' } });
  check('A bad GSTIN is refused', r.status === 400, r);
  r = await call('/me', { method: 'PUT', token: cust, body: { name: 'Test Plant', phone: '9000000001', gstin: '08abcde1234f1z5', address: 'Plot 1' } });
  check('Customer can save their details', r.status === 200 && r.json.gstin === '08ABCDE1234F1Z5', r);
  r = await call('/me', { token: cust });
  check('Details come back', r.status === 200 && r.json.name === 'Test Plant', r);
  r = await call('/me');
  check('Details need a token', r.status === 401, r);
  r = await call('/me/orders', { token: signToken('admin') });
  check('Order history is for customers only', r.status === 403, r);
  r = await call('/payments/create-order', { body: { ...buyer, email: ' PLANT@example.com'.trim(), items: [{ id: 'A', qty: 2 }] } });
  const own = r.json.orderId as string;
  await call('/payments/create-order', { body: { ...buyer, email: 'other@example.com', items: [{ id: 'A', qty: 1 }] } });
  r = await call('/me/orders', { token: cust });
  check('History shows only this account’s orders', r.status === 200 && r.json.items.length === 1 && r.json.items[0].id === own && r.json.items[0].total === 2360, r);
  r = await call('/payments/create-order', { body: { ...buyer, items: [{ id: 'A', qty: 1, slab: 'wholesale' }] } });
  check('Wholesale rate comes from the database', r.json.grand === 1062, r);

  r = await call('/invoices/mine', { token: cust });
  check('Customers still cannot read bills', r.status === 404 || r.status === 401, r);
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

  // Cashfree
  env.CASHFREE_APP_ID = 'app'; env.CASHFREE_SECRET_KEY = 'secret';
  texts.length = 0;
  r = await call('/payments/status');
  check('Page can see online payment is on', r.json.gateway === 'cashfree' && r.json.cashfreeMode === 'sandbox', r);
  r = await call('/payments/create-order', { body: { ...buyer, method: 'upi', items: [{ id: 'A', qty: 1 }] } });
  check('Direct UPI stays free of the gateway', r.json.mode === 'upi' && !texts.length, r);
  r = await call('/payments/create-order', { body: { ...buyer, method: 'card', items: [{ id: 'A', qty: 1 }] } });
  const cfId = r.json.orderId as string, sent = texts.at(-1)!;
  check('Online order uses the sandbox with test keys', r.status === 201 && r.json.mode === 'cashfree' && sent.url === 'https://sandbox.cashfree.com/pg/orders' && r.json.paymentSessionId === 'sess_1', r);
  check('Charge is the database price and return link is set', sent.body.order_amount === 1180 && /\/checkout\?order=\{order_id\}$/.test(sent.body.order_meta.return_url), sent.body);
  cf.order = { order_status: 'ACTIVE', order_amount: 1180 };
  r = await call('/payments/verify/' + cfId);
  check('Unpaid order stays pending', r.json.status === 'pending' && (await q('SELECT status FROM orders WHERE id=$1', [cfId]))[0].status === 'new', r);
  cf.order = { order_status: 'PAID', order_amount: 1 };
  r = await call('/payments/verify/' + cfId);
  check('Wrong amount from the gateway is not marked paid', r.json.status !== 'paid' && (await q('SELECT status FROM orders WHERE id=$1', [cfId]))[0].status === 'new', r);
  cf.order = { order_status: 'PAID', order_amount: 1180 };
  r = await call('/payments/verify/' + cfId);
  check('Gateway confirmation marks the order paid', r.json.status === 'paid' && (await q('SELECT status FROM orders WHERE id=$1', [cfId]))[0].status === 'paid', r);
  const invNo = r.json.invoiceNo as string, ownerTexts = () => mails().filter((t) => t.body.to[0] === 'owner@example.com');
  check('Payment raises a bill in the online series', /^WEB\/\d\d-\d\d\/0001$/.test(invNo), r);
  check('Owner gets one email with the bill and amount', ownerTexts().length === 1 && ownerTexts()[0].body.subject.includes(invNo) && ownerTexts()[0].body.subject.includes('1180') && ownerTexts()[0].body.html.includes('Test Plant'), ownerTexts());
  const stockAfter = (await q(`SELECT stock FROM products WHERE id='A'`))[0].stock;
  r = await call('/payments/verify/' + cfId);
  check('Checking again changes nothing', r.json.invoiceNo === invNo && (await q('SELECT count(*)::int c FROM invoices WHERE order_id=$1', [cfId]))[0].c === 1 && ownerTexts().length === 1 && (await q(`SELECT stock FROM products WHERE id='A'`))[0].stock === stockAfter, r);
  check('Payment cuts stock with a log entry', (await q('SELECT count(*)::int c FROM stock_log WHERE reason=$1', [invNo]))[0].c === 1);
  r = await call('/payments/invoice/' + cfId);
  check('Customer can open the paid bill', r.status === 200 && r.json.no === invNo && r.json.grand === 1180 && r.json.items[0].rate === 1000, r);
  r = await call('/payments/invoice/SSE000000');
  check('Unknown bill is not found', r.status === 404, r);
  r = await call('/invoices/online');
  check('Online bills need a staff token', r.status === 401, r);
  r = await call('/invoices/online', { token: cust });
  check('Customers cannot list online bills', r.status === 403, r);
  r = await call('/invoices/online', { token: admin });
  check('Admin receives the paid bill in full', r.status === 200 && r.json.items[0].no === invNo && r.json.items[0].items.length === 1, r);
  r = await call('/orders', { token: admin });
  check('Admin order list shows the bill number', r.json.items.find((o: any) => o.id === cfId)?.invoice_no === invNo, r);
  r = await call('/payments/verify/SSE000000');
  check('Unknown order is not found', r.status === 404, r);
  // Paid at the counter or on delivery
  const smsBefore = ownerTexts().length;
  r = await call(`/orders/${own}/mark-paid`, { body: { mode: 'Cash' } });
  check('Marking paid needs a staff token', r.status === 401, r);
  r = await call(`/orders/${own}/mark-paid`, { body: { mode: 'Cash' }, token: cust });
  check('A customer cannot mark an order paid', r.status === 403, r);
  r = await call(`/orders/${own}/mark-paid`, { body: { mode: 'Barter' }, token: admin });
  check('Only Cash, UPI or Transfer is accepted', r.status === 400, r);
  r = await call(`/orders/${own}/mark-paid`, { body: { mode: 'Cash' }, token: admin });
  const offNo = r.json.invoiceNo as string;
  check('Admin marks an offline order paid and it gets a bill', r.status === 200 && /^WEB\//.test(offNo) && offNo !== invNo, r);
  check('Offline payment sends no owner email', ownerTexts().length === smsBefore);
  const billMail = mails().filter((t) => t.body.to[0] === email).at(-1)!;
  check('Customer gets the bill link by email', billMail.body.subject.includes(offNo) && billMail.body.text.includes('/invoice?order=' + own), billMail.body);
  r = await call(`/orders/${own}/mark-paid`, { body: { mode: 'UPI' }, token: admin });
  check('Pressing paid twice makes no second bill', r.json.invoiceNo === offNo && (await q('SELECT count(*)::int c FROM invoices WHERE order_id=$1', [own]))[0].c === 1, r);
  r = await call('/payments/invoice/' + own);
  check('Bill records how it was paid', r.json.mode === 'Cash', r);
  r = await call('/me/orders', { token: cust });
  check('Customer sees it paid with the bill', r.json.items[0].status === 'paid' && r.json.items[0].invoice === offNo, r);
  const quoteId = (await call('/payments/create-order', { body: { ...buyer, items: [{ id: 'Q', qty: 1 }] } })).json.orderId;
  r = await call(`/orders/${quoteId}/mark-paid`, { body: { mode: 'Cash' }, token: admin });
  check('A quote without rates cannot be marked paid', r.status === 409, r);
  r = await call('/orders/NOPE/mark-paid', { body: { mode: 'Cash' }, token: admin });
  check('Unknown order is not found', r.status === 404, r);

  r = await call('/customers');
  check('Customer list needs a staff token', r.status === 401, r);
  r = await call('/customers', { token: cust });
  check('Customers cannot read the list', r.status === 403, r);
  r = await call('/customers', { token: admin });
  const row = r.json.items?.find((c: any) => c.email === email);
  check('Admin sees account holders with totals and join time', r.status === 200 && row?.name === 'Test Plant' && row.orders === 1 && row.paid === 2360 && row.created_at && row.last_login, r);
  r = await call(`/customers/${encodeURIComponent(email)}`, { token: admin });
  check('Customer history has sign-ins and paid times', r.status === 200 && r.json.logins.length === 2 && r.json.orders[0].paid_at && r.json.orders[0].mode === 'Cash' && r.json.orders[0].items.length === 1 && !('text' in r.json.orders[0]), r);
  r = await call('/customers/nobody%40example.com', { token: admin });
  check('Unknown customer is not found', r.status === 404, r);

  cf.create = { message: 'refused' };
  r = await call('/payments/create-order', { body: { ...buyer, method: 'card', items: [{ id: 'A', qty: 1 }] } });
  check('Gateway refusal gives a plain error', r.status === 502, r);
  env.CASHFREE_APP_ID = ''; env.CASHFREE_SECRET_KEY = ''; env.OWNER_EMAIL = '';
  globalThis.fetch = realFetch;

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
  for (let i = 0; i < 12; i++) last = (await call('/auth/login', { body: { password: 'wrong-wrong-1' } })).status;
  check('Password guessing is rate limited', last === 429, last);

  srv.close();
  await requireDb().end();
  await sock.stop();
  console.log(`\n${pass} of ${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
