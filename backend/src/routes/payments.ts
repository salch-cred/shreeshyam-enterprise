import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Router, raw } from 'express';
import { z } from 'zod';
import { auth } from '../auth.js';
import { env } from '../env.js';
import { requireDb, tx } from '../db.js';
import { rateLimit } from '../ratelimit.js';
import { financialYear } from './billing.js';
import { alertOwner } from '../sms.js';

export const payments = Router();

// The browser may name items and quantities. It never sets a price: rates and
// GST are read from the products table below, so a tampered cart changes nothing.
const CheckoutItem = z.object({
  id: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(10000),
  slab: z.enum(['retail', 'wholesale']).optional().default('retail'),
});

const CheckoutIn = z.object({
  items: z.array(CheckoutItem).min(1).max(100),
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  gstin: z.string().max(15).optional().default(''),
  email: z.email().max(120).optional().or(z.literal('')).default(''),
  address: z.string().min(4).max(400),
  method: z.enum(['upi', 'cod', 'card']).default('upi'),
});

function gatewayConfigured(): boolean {
  return Boolean(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
}

const cashfreeUrl = () => `https://${env.CASHFREE_ENV === 'production' ? 'api' : 'sandbox'}.cashfree.com/pg/orders`;
const cashfreeHeaders = () => ({
  'x-client-id': env.CASHFREE_APP_ID,
  'x-client-secret': env.CASHFREE_SECRET_KEY,
  'x-api-version': '2025-01-01',
  'Content-Type': 'application/json',
});

// Public probe so checkout knows which rails to show.
payments.get('/payments/status', (_req, res) => {
  res.json({ gateway: gatewayConfigured() ? 'cashfree' : 'none', cashfreeMode: env.CASHFREE_ENV, upiId: env.UPI_ID });
});

type Row = { id: string; name: string; rate_retail: number; rate_wholesale: number; gst_pct: number; hsn: string; unit: string };

// Create an order. Direct UPI goes to the shop's own ID with no gateway fee, and the
// counter confirms it by hand. Paying online runs through Cashfree when keys exist.
payments.post('/payments/create-order', rateLimit(60 * 60 * 1000, 30), async (req, res, next) => {
  try {
    const b = CheckoutIn.parse(req.body);
    const p = requireDb();
    const ids = [...new Set(b.items.map((i) => i.id))];
    const found = (await p.query('SELECT id,name,rate_retail,rate_wholesale,gst_pct,hsn,unit FROM products WHERE id = ANY($1)', [ids])).rows as Row[];
    const byId = new Map(found.map((r) => [r.id, r]));
    if (ids.some((id) => !byId.has(id))) return next(Object.assign(new Error('An item in your cart is no longer available. Refresh and try again.'), { status: 409 }));

    let sub = 0, gst = 0, toQuote = 0;
    const items = b.items.map((it) => {
      const row = byId.get(it.id) as Row;
      const rate = it.slab === 'wholesale' ? row.rate_wholesale : row.rate_retail;
      const t = it.qty * rate;
      if (!rate) toQuote++;
      sub += t; gst += t * (row.gst_pct / 100);
      return { id: row.id, name: row.name, qty: it.qty, rate, gst_pct: row.gst_pct, hsn: row.hsn, unit: row.unit };
    });
    const grand = Math.round(sub + gst);
    const orderId = 'SSE' + Date.now().toString(36).toUpperCase() + randomBytes(8).toString('hex').toUpperCase();
    const record = JSON.stringify({ orderId, method: b.method, amount: grand, customer: { name: b.name, phone: b.phone, gstin: b.gstin, address: b.address }, items });

    // Rates on request: the order is saved for the counter and nothing is charged.
    if (toQuote || grand < 1) {
      await p.query('INSERT INTO orders(id,source,text,phone) VALUES($1,$2,$3,$4)', [orderId, 'quote', record, b.phone]);
      return res.status(201).json({ mode: 'quote', orderId, sub, gst, grand, toQuote });
    }
    await p.query('INSERT INTO orders(id,source,text,phone) VALUES($1,$2,$3,$4)', [orderId, 'checkout', record, b.phone]);

    // Cash on delivery — no gateway, collect on dispatch. Belt area only note on UI.
    if (b.method === 'cod') return res.status(201).json({ mode: 'cod', orderId, sub, gst, grand });
    if (b.method === 'card' && !gatewayConfigured()) {
      return next(Object.assign(new Error('Card payments are not active yet — choose UPI or Cash on delivery.'), { status: 400 }));
    }

    if (b.method === 'card') {
      const site = env.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
      const email = b.email || `orders+${b.phone}@shreeshyamhardware.site`;
      const r = await fetch(cashfreeUrl(), {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: cashfreeHeaders(),
        body: JSON.stringify({
          order_amount: grand,
          order_currency: 'INR',
          order_id: orderId,
          customer_details: { customer_id: 'cust-' + b.phone, customer_name: b.name, customer_email: email, customer_phone: b.phone },
          order_meta: {
            return_url: `${site}/checkout?order={order_id}`,
            ...(env.PUBLIC_API_URL ? { notify_url: env.PUBLIC_API_URL.replace(/\/$/, '') + '/payments/webhook' } : {}),
          },
          order_note: 'Shree Shyam Enterprises order ' + orderId,
        }),
      });
      const j = await r.json() as { payment_session_id?: string; message?: string };
      if (!r.ok || !j.payment_session_id) {
        console.error('[cashfree] order rejected', r.status, j.message);
        return next(Object.assign(new Error('Could not start the payment. Try UPI or Cash on delivery.'), { status: 502 }));
      }
      return res.status(201).json({ mode: 'cashfree', cashfreeMode: env.CASHFREE_ENV, orderId, paymentSessionId: j.payment_session_id, sub, gst, grand });
    }

    if (!env.UPI_ID) return next(Object.assign(new Error('UPI is not set up yet — choose Cash on delivery.'), { status: 400 }));
    const intent = `upi://pay?pa=${encodeURIComponent(env.UPI_ID)}&am=${grand}&tn=${encodeURIComponent(orderId)}`;
    res.status(201).json({ mode: 'upi', orderId, upiId: env.UPI_ID, intent, sub, gst, grand });
  } catch (e) { next(e); }
});

const orderAmount = async (id: string) => {
  const row = (await requireDb().query('SELECT text FROM orders WHERE id=$1', [id])).rows[0] as { text: string } | undefined;
  return row ? (JSON.parse(row.text) as { amount?: number }).amount : undefined;
};

type Item = { id: string; name: string; qty: number; rate: number; gst_pct: number; hsn?: string; unit?: string };

// The one place an order becomes paid. In a single transaction it marks the order, raises
// the bill and cuts stock, so the webhook and the page's check can both arrive and only one
// bill exists. Online bills have their own WEB series, which the counter's numbers cannot reach.
async function settlePaid(id: string, mode = 'Online') {
  const out = await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(7540)');
    const row = (await c.query('SELECT text,phone,invoice_no FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0] as { text: string; phone: string; invoice_no: string } | undefined;
    if (!row) return null;
    if (row.invoice_no) return { no: row.invoice_no, fresh: false, grand: 0 };
    const d = JSON.parse(row.text) as { amount: number; items: Item[]; customer: { name: string; gstin?: string; address?: string } };
    const prefix = `WEB/${financialYear()}/`;
    const last = (await c.query(`SELECT COALESCE(MAX((regexp_match(no,'([0-9]+)$'))[1]::int),0) n FROM invoices WHERE no LIKE $1`, [prefix + '%'])).rows[0].n as number;
    const no = prefix + String(last + 1).padStart(4, '0');
    const sub = d.items.reduce((a, it) => a + it.qty * it.rate, 0);
    await c.query(
      `INSERT INTO invoices(no,type,customer,phone,gstin,address,order_id,mode,items,subtotal,discount,gst,grand,paid,balance) VALUES($1,'TAX',$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$11,0)`,
      [no, d.customer.name, row.phone, d.customer.gstin || '', d.customer.address || '', id, mode, JSON.stringify(d.items), sub, d.amount - sub, d.amount]);
    for (const it of d.items) {
      await c.query('UPDATE products SET stock = stock - $2, updated_at=NOW() WHERE id=$1', [it.id, it.qty]);
      await c.query('INSERT INTO stock_log(product_id,delta,reason) VALUES($1,$2,$3)', [it.id, -it.qty, no]);
    }
    await c.query(`UPDATE orders SET status='paid',invoice_no=$2,paid_at=now() WHERE id=$1`, [id, no]);
    return { no, fresh: true, grand: d.amount };
  });
  // The counter marked it paid by hand, so the owner already knows.
  if (out?.fresh && mode === 'Online') await alertOwner(out.no, out.grand);
  return out?.no || '';
}

// The page asks here after the Cashfree window closes. The answer comes from Cashfree
// itself, so it also settles an order whose webhook was delayed or lost.
payments.get('/payments/verify/:id', rateLimit(15 * 60 * 1000, 60), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    if (!/^SSE[0-9A-Z]{6,30}$/.test(id) || !gatewayConfigured()) return next(Object.assign(new Error('Order not found'), { status: 404 }));
    const expected = await orderAmount(id);
    if (expected === undefined) return next(Object.assign(new Error('Order not found'), { status: 404 }));
    const r = await fetch(`${cashfreeUrl()}/${id}`, { signal: AbortSignal.timeout(10_000), headers: cashfreeHeaders() });
    const j = await r.json() as { order_status?: string; order_amount?: number };
    if (!r.ok) {
      console.error('[cashfree] status check failed', r.status);
      return next(Object.assign(new Error('Could not check the payment yet.'), { status: 502 }));
    }
    if (j.order_status === 'PAID' && Number(j.order_amount) === expected) {
      return res.json({ status: 'paid', grand: expected, invoiceNo: await settlePaid(id) });
    }
    if (j.order_status === 'PAID') console.error('[cashfree] amount mismatch', id);
    res.json({ status: j.order_status === 'ACTIVE' ? 'pending' : 'failed', grand: expected });
  } catch (e) { next(e); }
});

// Money taken at the counter or on delivery. Quote orders have no agreed rates, so their
// bill is made in Billing instead.
payments.post('/orders/:id/mark-paid', auth(['admin']), async (req, res, next) => {
  try {
    const { mode } = z.object({ mode: z.enum(['Cash', 'UPI', 'Transfer']) }).parse(req.body);
    const id = String(req.params.id);
    const row = (await requireDb().query('SELECT source,text FROM orders WHERE id=$1', [id])).rows[0] as { source: string; text: string } | undefined;
    if (!row) return next(Object.assign(new Error('Order not found'), { status: 404 }));
    let items: Item[] = [];
    try { items = (JSON.parse(row.text) as { items?: Item[] }).items || []; } catch { /* a plain text order */ }
    if (row.source === 'quote' || !items.length || items.some((i) => !i.rate)) {
      return next(Object.assign(new Error('This order has no agreed rates yet. Make its bill in Billing.'), { status: 409 }));
    }
    res.json({ status: 'paid', invoiceNo: await settlePaid(id, mode) });
  } catch (e) { next(e); }
});

// The paid bill, for the thank-you page and reprints. The order ID carries 64 random bits,
// so it works as a private link, and only paid orders answer.
payments.get('/payments/invoice/:id', rateLimit(15 * 60 * 1000, 60), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const r = /^SSE[0-9A-Z]{6,30}$/.test(id)
      ? (await requireDb().query('SELECT no,date,customer,phone,gstin,address,mode,items,subtotal,gst,grand FROM invoices WHERE order_id=$1', [id])).rows[0]
      : undefined;
    if (!r) return next(Object.assign(new Error('Bill not found'), { status: 404 }));
    res.json(r);
  } catch (e) { next(e); }
});

// Cashfree signs timestamp + raw body with the secret key.
export function validCashfreeSignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  if (!timestamp || !signature || !secret) return false;
  const want = createHmac('sha256', secret).update(timestamp + rawBody).digest();
  const got = Buffer.from(signature, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

// The only thing that marks an order paid. The browser's onSuccess callback is not proof.
payments.post('/payments/webhook', raw({ type: '*/*', limit: '64kb' }), async (req, res, next) => {
  try {
    const body = (req.body as Buffer).toString('utf8');
    if (!validCashfreeSignature(body, String(req.headers['x-webhook-timestamp'] || ''), String(req.headers['x-webhook-signature'] || ''), env.CASHFREE_SECRET_KEY)) {
      return next(Object.assign(new Error('Invalid signature'), { status: 401 }));
    }
    const ev = JSON.parse(body) as { type?: string; data?: { order?: { order_id?: string; order_amount?: number }; payment?: { payment_status?: string; payment_amount?: number } } };
    const id = ev.data?.order?.order_id;
    if (ev.type === 'PAYMENT_SUCCESS_WEBHOOK' && ev.data?.payment?.payment_status === 'SUCCESS' && id) {
      const expected = await orderAmount(id);
      if (expected !== undefined && Number(ev.data.payment.payment_amount) === expected) {
        await settlePaid(id);
      } else {
        console.error('[cashfree] amount mismatch', id);
      }
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
