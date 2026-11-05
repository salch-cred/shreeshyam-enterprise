import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { auth, signToken, type Authed } from '../auth.js';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { Email, OtpRequestIn, OtpVerifyIn, ProfileIn } from '../validate.js';
import { rateLimit } from '../ratelimit.js';
import { mailConfigured, sendCode } from '../mail.js';

export const customer = Router();

const COOLDOWN_S = 45, LIFE_MIN = 5, MAX_TRIES = 5, PER_EMAIL_HOUR = 4, PER_IP_HOUR = 10;
const fail = (message: string, status: number) => Object.assign(new Error(message), { status });
const seal = (text: string) => createHmac('sha256', env.JWT_SECRET).update(text).digest('hex');

// Public probe so the account page knows whether to offer email sign-in.
customer.get('/auth/otp/status', (_req, res) => res.json({ email: mailConfigured() }));

// The free email plan has a daily limit, so sends are capped per address, per visitor and
// per day. The counts live in Postgres because serverless instances do not share memory.
customer.post('/auth/otp/request', rateLimit(15 * 60 * 1000, 8), async (req, res, next) => {
  try {
    const { email } = OtpRequestIn.parse(req.body);
    if (!mailConfigured()) return next(fail('Email sign-in is not switched on yet.', 503));
    const p = requireDb();
    const ip = seal('ip:' + (req.ip || 'unknown'));
    await p.query(`DELETE FROM otp_codes WHERE created < now() - interval '2 days'`);
    const u = (await p.query(`SELECT
        count(*) FILTER (WHERE email=$1 AND created > now() - interval '1 hour')::int AS email_hour,
        count(*) FILTER (WHERE ip=$2 AND created > now() - interval '1 hour')::int AS ip_hour,
        count(*) FILTER (WHERE created > now() - interval '1 day')::int AS day,
        extract(epoch FROM now() - max(created) FILTER (WHERE email=$1))::float AS since
      FROM otp_codes`, [email, ip])).rows[0] as { email_hour: number; ip_hour: number; day: number; since: number | null };
    if (u.since !== null && u.since < COOLDOWN_S) return next(fail(`Wait ${Math.ceil(COOLDOWN_S - u.since)} seconds before asking again.`, 429));
    if (u.email_hour >= PER_EMAIL_HOUR || u.ip_hour >= PER_IP_HOUR) return next(fail('Too many codes requested. Try again in an hour.', 429));
    if (u.day >= env.OTP_DAILY_CAP) {
      console.error('[otp] daily cap reached');
      return next(fail('Sign-in is busy right now. Call the counter or try again later.', 429));
    }

    const code = String(randomInt(100000, 1000000)), id = randomUUID();
    await p.query('UPDATE otp_codes SET used=true WHERE email=$1 AND NOT used', [email]);
    await p.query(
      `INSERT INTO otp_codes(id,email,ip,code_hash,attempts,used,created,expires) VALUES($1,$2,$3,$4,0,false,now(),now() + interval '${LIFE_MIN} minutes')`,
      [id, email, ip, seal(`${email}:${code}`)]);
    try {
      await sendCode(email, code);
    } catch (e) {
      console.error('[otp] send failed', (e as Error).message);
      await p.query('DELETE FROM otp_codes WHERE id=$1', [id]);
      return next(fail('Could not send the email. Try again in a minute.', 502));
    }
    res.json({ ok: true, retryIn: COOLDOWN_S });
  } catch (e) { next(e); }
});

customer.post('/auth/otp/verify', rateLimit(15 * 60 * 1000, 20), async (req, res, next) => {
  try {
    const { email, phone, code } = OtpVerifyIn.parse(req.body);
    const p = requireDb();
    const wrong = () => next(fail('That code is wrong or has expired. Check it or ask for a new one.', 401));
    // The attempt is counted atomically before the compare, so parallel guesses cannot beat the limit.
    const row = (await p.query(
      `UPDATE otp_codes SET attempts=attempts+1
       WHERE id=(SELECT id FROM otp_codes WHERE email=$1 AND NOT used AND expires > now() ORDER BY created DESC LIMIT 1) AND attempts < ${MAX_TRIES}
       RETURNING id,code_hash`, [email])).rows[0] as { id: string; code_hash: string } | undefined;
    if (!row) return wrong();
    const want = Buffer.from(row.code_hash), got = Buffer.from(seal(`${email}:${code}`));
    if (want.length !== got.length || !timingSafeEqual(want, got)) return wrong();
    const claimed = await p.query('UPDATE otp_codes SET used=true WHERE id=$1 AND NOT used RETURNING id', [row.id]);
    if (!claimed.rowCount) return wrong();

    const u = (await p.query(
      `INSERT INTO users(id,name,email,phone,password_hash,gstin,address,role) VALUES($1,'',$2,$3,'','','','customer')
       ON CONFLICT(email) DO UPDATE SET phone=EXCLUDED.phone RETURNING id,name,email,phone,gstin,address`, [randomUUID(), email, phone])).rows[0];
    await p.query('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    await p.query('INSERT INTO login_log(email,at) VALUES($1,now())', [u.email]);
    res.json({ token: signToken('customer', { email: u.email, sub: u.id }, '30d'), user: { name: u.name, email: u.email, phone: u.phone, gstin: u.gstin, address: u.address } });
  } catch (e) { next(e); }
});

customer.get('/me', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const u = (await requireDb().query('SELECT name,email,phone,gstin,address FROM users WHERE email=$1', [req.email])).rows[0];
    if (!u) return next(fail('Sign in again', 401));
    res.json(u);
  } catch (e) { next(e); }
});

customer.put('/me', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const b = ProfileIn.parse(req.body);
    const u = (await requireDb().query(
      'UPDATE users SET name=$1,phone=$2,gstin=$3,address=$4 WHERE email=$5 RETURNING name,email,phone,gstin,address',
      [b.name, b.phone, b.gstin, b.address, req.email])).rows[0];
    if (!u) return next(fail('Sign in again', 401));
    res.json(u);
  } catch (e) { next(e); }
});

// The email comes from the signed token, which only a code sent to that inbox issues.
customer.get('/me/orders', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const rows = (await requireDb().query(
      'SELECT id,source,text,status,invoice_no,created FROM orders WHERE email=$1 ORDER BY created DESC LIMIT 100', [req.email])).rows as { id: string; source: string; text: string; status: string; invoice_no: string; created: Date }[];
    res.json({ items: rows.map((o) => {
      let d: { amount?: number; method?: string; items?: unknown[] } = {};
      try { d = JSON.parse(o.text); } catch { /* older plain-text order */ }
      return { id: o.id, status: o.status, invoice: o.invoice_no, created: o.created, quote: o.source === 'quote', total: d.amount || 0, method: d.method || '', items: d.items || [] };
    }) });
  } catch (e) { next(e); }
});

// Everyone who has an account, for the shop's own Customers list.
customer.get('/customers', auth(['admin']), async (_req, res, next) => {
  try {
    const rows = (await requireDb().query(
      `SELECT u.name,u.email,u.phone,u.gstin,u.address,u.created_at,u.last_login,
         count(o.id)::int AS orders, COALESCE(sum(i.grand),0)::int AS paid, max(o.created) AS last_order
       FROM users u LEFT JOIN orders o ON o.email=u.email LEFT JOIN invoices i ON i.order_id=o.id
       WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`)).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

customer.get('/customers/:email', auth(['admin']), async (req, res, next) => {
  try {
    const email = z.object({ email: Email }).parse(req.params).email, p = requireDb();
    const u = (await p.query('SELECT name,email,phone,gstin,address,created_at,last_login FROM users WHERE email=$1', [email])).rows[0];
    if (!u) return next(fail('Customer not found', 404));
    const logins = (await p.query('SELECT at FROM login_log WHERE email=$1 ORDER BY at DESC LIMIT 100', [email])).rows.map((r: { at: Date }) => r.at);
    const orders = (await p.query(
      `SELECT o.id,o.source,o.status,o.text,o.created,o.paid_at,o.invoice_no,i.mode FROM orders o LEFT JOIN invoices i ON i.order_id=o.id WHERE o.email=$1 ORDER BY o.created DESC LIMIT 200`, [email])).rows as
      { id: string; source: string; status: string; text: string; created: Date; paid_at: Date | null; invoice_no: string; mode: string | null }[];
    res.json({ customer: u, logins, orders: orders.map(({ text, ...o }) => {
      let d: { amount?: number; method?: string; items?: { name: string; qty: number }[] } = {};
      try { d = JSON.parse(text); } catch { /* older plain-text order */ }
      return { ...o, total: d.amount || 0, method: d.method || '', items: d.items || [] };
    }) });
  } catch (e) { next(e); }
});
