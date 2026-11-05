import { createHmac, timingSafeEqual } from 'crypto';
import { Router, raw } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { rateLimit } from '../ratelimit.js';

export const payments = Router();

// The browser may name items and quantities. It never sets a price: rates and
// GST are read from the products table below, so a tampered cart changes nothing.
const CheckoutItem = z.object({
  id: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(10000),
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

// Public probe so checkout knows which rails to show.
payments.get('/payments/status', (_req, res) => {
  res.json({ gateway: gatewayConfigured() ? 'cashfree' : 'none', upiId: env.UPI_ID });
});

type Row = { id: string; name: string; rate_retail: number; gst_pct: number };

// Create an order. UPI is always available (zero MDR). Card/netbanking runs
// through Cashfree when merchant keys exist in env; otherwise checkout stays UPI.
payments.post('/payments/create-order', rateLimit(60 * 60 * 1000, 30), async (req, res, next) => {
  try {
    const b = CheckoutIn.parse(req.body);
    const p = requireDb();
    const ids = [...new Set(b.items.map((i) => i.id))];
    const found = (await p.query('SELECT id,name,rate_retail,gst_pct FROM products WHERE id = ANY($1)', [ids])).rows as Row[];
    const byId = new Map(found.map((r) => [r.id, r]));
    if (ids.some((id) => !byId.has(id))) return next(Object.assign(new Error('An item in your cart is no longer available. Refresh and try again.'), { status: 409 }));

    let sub = 0, gst = 0, toQuote = 0;
    const items = b.items.map((it) => {
      const row = byId.get(it.id) as Row;
      const t = it.qty * row.rate_retail;
      if (!row.rate_retail) toQuote++;
      sub += t; gst += t * (row.gst_pct / 100);
      return { id: row.id, name: row.name, qty: it.qty, rate: row.rate_retail, gst_pct: row.gst_pct };
    });
    const grand = Math.round(sub + gst);
    const orderId = 'SSE' + Date.now().toString(36).toUpperCase();
    const record = JSON.stringify({ orderId, method: b.method, amount: grand, customer: { name: b.name, phone: b.phone, gstin: b.gstin, address: b.address }, items });

    // Rates on request: the order is saved for the counter and nothing is charged.
    if (toQuote || grand < 1) {
      await p.query('INSERT INTO orders(id,source,text) VALUES($1,$2,$3)', [orderId, 'quote', record]);
      return res.status(201).json({ mode: 'quote', orderId, sub, gst, grand, toQuote });
    }
    await p.query('INSERT INTO orders(id,source,text) VALUES($1,$2,$3)', [orderId, 'checkout', record]);

    // Cash on delivery — no gateway, collect on dispatch. Belt area only note on UI.
    if (b.method === 'cod') return res.status(201).json({ mode: 'cod', orderId, sub, gst, grand });
    if (b.method === 'card' && !gatewayConfigured()) {
      return next(Object.assign(new Error('Card payments are not active yet — choose UPI or Cash on delivery.'), { status: 400 }));
    }

    if (gatewayConfigured()) {
      const email = b.email || `orders+${b.phone}@shreeshyamhardware.site`;
      const r = await fetch('https://api.cashfree.com/pg/orders', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'x-client-id': env.CASHFREE_APP_ID,
          'x-client-secret': env.CASHFREE_SECRET_KEY,
          'x-api-version': '2023-08-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_amount: grand,
          order_currency: 'INR',
          order_id: orderId,
          customer_details: { customer_id: 'cust-' + b.phone, customer_email: email, customer_phone: b.phone },
          order_note: 'Shree Shyam Enterprises order ' + orderId,
        }),
      });
      const j = await r.json() as { payment_session_id?: string; message?: string };
      if (!r.ok || !j.payment_session_id) {
        console.error('[cashfree] order rejected', r.status, j.message);
        return next(Object.assign(new Error('Could not start the payment. Try UPI or Cash on delivery.'), { status: 502 }));
      }
      return res.status(201).json({ mode: 'cashfree', orderId, paymentSessionId: j.payment_session_id, sub, gst, grand });
    }

    if (!env.UPI_ID) return next(Object.assign(new Error('UPI is not set up yet — choose Cash on delivery.'), { status: 400 }));
    const intent = `upi://pay?pa=${encodeURIComponent(env.UPI_ID)}&am=${grand}&tn=${encodeURIComponent(orderId)}`;
    res.status(201).json({ mode: 'upi', orderId, upiId: env.UPI_ID, intent, sub, gst, grand });
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
      const p = requireDb();
      const row = (await p.query('SELECT text FROM orders WHERE id=$1', [id])).rows[0] as { text: string } | undefined;
      const expected = row ? (JSON.parse(row.text) as { amount?: number }).amount : undefined;
      if (expected !== undefined && Number(ev.data.payment.payment_amount) === expected) {
        await p.query(`UPDATE orders SET status='paid' WHERE id=$1 AND status<>'paid'`, [id]);
      } else {
        console.error('[cashfree] amount mismatch', id);
      }
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
