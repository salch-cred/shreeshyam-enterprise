import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { auth, signToken, type Authed } from '../auth.js';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { OtpRequestIn, OtpVerifyIn, ProfileIn } from '../validate.js';
import { rateLimit } from '../ratelimit.js';
import { sendTemplate } from '../sms.js';

export const customer = Router();

const COOLDOWN_S = 45, LIFE_MIN = 5, MAX_TRIES = 5, PER_PHONE_HOUR = 4, PER_IP_HOUR = 10;
const fail = (message: string, status: number) => Object.assign(new Error(message), { status });
const seal = (text: string) => createHmac('sha256', env.JWT_SECRET).update(text).digest('hex');
const smsConfigured = () => Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);

const sendSms = (phone: string, otp: string) => sendTemplate(env.MSG91_TEMPLATE_ID, phone, { otp });

// Public probe so the account page knows whether to offer SMS sign-in.
customer.get('/auth/otp/status', (_req, res) => res.json({ sms: smsConfigured() }));

// Every text costs money, so sends are capped per number, per address and per day. The
// counts live in Postgres because serverless instances do not share memory.
customer.post('/auth/otp/request', rateLimit(15 * 60 * 1000, 8), async (req, res, next) => {
  try {
    const { phone } = OtpRequestIn.parse(req.body);
    if (!smsConfigured()) return next(fail('SMS sign-in is not switched on yet.', 503));
    const p = requireDb();
    const ip = seal('ip:' + (req.ip || 'unknown'));
    await p.query(`DELETE FROM otp_codes WHERE created < now() - interval '2 days'`);
    const u = (await p.query(`SELECT
        count(*) FILTER (WHERE phone=$1 AND created > now() - interval '1 hour')::int AS phone_hour,
        count(*) FILTER (WHERE ip=$2 AND created > now() - interval '1 hour')::int AS ip_hour,
        count(*) FILTER (WHERE created > now() - interval '1 day')::int AS day,
        extract(epoch FROM now() - max(created) FILTER (WHERE phone=$1))::float AS since
      FROM otp_codes`, [phone, ip])).rows[0] as { phone_hour: number; ip_hour: number; day: number; since: number | null };
    if (u.since !== null && u.since < COOLDOWN_S) return next(fail(`Wait ${Math.ceil(COOLDOWN_S - u.since)} seconds before asking again.`, 429));
    if (u.phone_hour >= PER_PHONE_HOUR || u.ip_hour >= PER_IP_HOUR) return next(fail('Too many codes requested. Try again in an hour.', 429));
    if (u.day >= env.OTP_DAILY_CAP) {
      console.error('[otp] daily cap reached');
      return next(fail('Sign-in is busy right now. Call the counter or try again later.', 429));
    }

    const code = String(randomInt(100000, 1000000)), id = randomUUID();
    await p.query('UPDATE otp_codes SET used=true WHERE phone=$1 AND NOT used', [phone]);
    await p.query(
      `INSERT INTO otp_codes(id,phone,ip,code_hash,attempts,used,created,expires) VALUES($1,$2,$3,$4,0,false,now(),now() + interval '${LIFE_MIN} minutes')`,
      [id, phone, ip, seal(`${phone}:${code}`)]);
    try {
      await sendSms(phone, code);
    } catch (e) {
      console.error('[otp] send failed', (e as Error).message);
      await p.query('DELETE FROM otp_codes WHERE id=$1', [id]);
      return next(fail('Could not send the text. Try again in a minute.', 502));
    }
    res.json({ ok: true, retryIn: COOLDOWN_S });
  } catch (e) { next(e); }
});

customer.post('/auth/otp/verify', rateLimit(15 * 60 * 1000, 20), async (req, res, next) => {
  try {
    const { phone, code } = OtpVerifyIn.parse(req.body);
    const p = requireDb();
    const wrong = () => next(fail('That code is wrong or has expired. Check it or ask for a new one.', 401));
    // The attempt is counted atomically before the compare, so parallel guesses cannot beat the limit.
    const row = (await p.query(
      `UPDATE otp_codes SET attempts=attempts+1
       WHERE id=(SELECT id FROM otp_codes WHERE phone=$1 AND NOT used AND expires > now() ORDER BY created DESC LIMIT 1) AND attempts < ${MAX_TRIES}
       RETURNING id,code_hash`, [phone])).rows[0] as { id: string; code_hash: string } | undefined;
    if (!row) return wrong();
    const want = Buffer.from(row.code_hash), got = Buffer.from(seal(`${phone}:${code}`));
    if (want.length !== got.length || !timingSafeEqual(want, got)) return wrong();
    const claimed = await p.query('UPDATE otp_codes SET used=true WHERE id=$1 AND NOT used RETURNING id', [row.id]);
    if (!claimed.rowCount) return wrong();

    const u = (await p.query(
      `INSERT INTO users(id,name,phone,password_hash,gstin,address,role) VALUES($1,'',$2,'','','','customer')
       ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id,name,phone,gstin,address`, [randomUUID(), phone])).rows[0];
    await p.query('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
    await p.query('INSERT INTO login_log(phone,at) VALUES($1,now())', [u.phone]);
    res.json({ token: signToken('customer', { phone: u.phone, sub: u.id }, '30d'), user: { name: u.name, phone: u.phone, gstin: u.gstin, address: u.address } });
  } catch (e) { next(e); }
});

customer.get('/me', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const u = (await requireDb().query('SELECT name,phone,gstin,address FROM users WHERE phone=$1', [req.phone])).rows[0];
    if (!u) return next(fail('Sign in again', 401));
    res.json(u);
  } catch (e) { next(e); }
});

customer.put('/me', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const b = ProfileIn.parse(req.body);
    const u = (await requireDb().query(
      'UPDATE users SET name=$1,gstin=$2,address=$3 WHERE phone=$4 RETURNING name,phone,gstin,address',
      [b.name, b.gstin, b.address, req.phone])).rows[0];
    if (!u) return next(fail('Sign in again', 401));
    res.json(u);
  } catch (e) { next(e); }
});

// The phone comes from the signed token, which only OTP verification issues.
customer.get('/me/orders', auth(['customer']), async (req: Authed, res, next) => {
  try {
    const rows = (await requireDb().query(
      'SELECT id,source,text,status,invoice_no,created FROM orders WHERE phone=$1 ORDER BY created DESC LIMIT 100', [req.phone])).rows as { id: string; source: string; text: string; status: string; invoice_no: string; created: Date }[];
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
      `SELECT u.name,u.phone,u.gstin,u.address,u.created_at,u.last_login,
         count(o.id)::int AS orders, COALESCE(sum(i.grand),0)::int AS paid, max(o.created) AS last_order
       FROM users u LEFT JOIN orders o ON o.phone=u.phone LEFT JOIN invoices i ON i.order_id=o.id
       WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`)).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

customer.get('/customers/:phone', auth(['admin']), async (req, res, next) => {
  try {
    const phone = String(req.params.phone), p = requireDb();
    const u = /^[6-9][0-9]{9}$/.test(phone) ? (await p.query('SELECT name,phone,gstin,address,created_at,last_login FROM users WHERE phone=$1', [phone])).rows[0] : undefined;
    if (!u) return next(fail('Customer not found', 404));
    const logins = (await p.query('SELECT at FROM login_log WHERE phone=$1 ORDER BY at DESC LIMIT 100', [phone])).rows.map((r: { at: Date }) => r.at);
    const orders = (await p.query(
      `SELECT o.id,o.source,o.status,o.text,o.created,o.paid_at,o.invoice_no,i.mode FROM orders o LEFT JOIN invoices i ON i.order_id=o.id WHERE o.phone=$1 ORDER BY o.created DESC LIMIT 200`, [phone])).rows as
      { id: string; source: string; status: string; text: string; created: Date; paid_at: Date | null; invoice_no: string; mode: string | null }[];
    res.json({ customer: u, logins, orders: orders.map(({ text, ...o }) => {
      let d: { amount?: number; method?: string; items?: { name: string; qty: number }[] } = {};
      try { d = JSON.parse(text); } catch { /* older plain-text order */ }
      return { ...o, total: d.amount || 0, method: d.method || '', items: d.items || [] };
    }) });
  } catch (e) { next(e); }
});
