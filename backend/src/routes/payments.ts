import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { requireDb } from '../db.js';
import { rateLimit } from '../ratelimit.js';

export const payments = Router();

const CheckoutItem = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  qty: z.number().int().min(1).max(10000),
  rate: z.number().min(0).max(10_000_000),
  gst_pct: z.number().min(0).max(28).default(18),
});

const CheckoutIn = z.object({
  items: z.array(CheckoutItem).min(1).max(100),
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^[0-9]{10}$/),
  email: z.string().max(120).optional().default(''),
  address: z.string().min(4).max(400),
  method: z.enum(['upi', 'cod', 'card']).default('upi'),
});

function gatewayConfigured(): boolean {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

// Public probe so checkout knows which rails to show.
payments.get('/payments/status', (_req, res) => {
  res.json({ gateway: gatewayConfigured() ? 'cashfree' : 'none', upiId: env.UPI_ID });
});

// Create an order. UPI is always available (zero MDR). Card/netbanking runs
// through Cashfree when merchant keys exist in env; otherwise checkout stays UPI.
payments.post('/payments/create-order', rateLimit(60 * 60 * 1000, 30), async (req, res, next) => {
  try {
    const b = CheckoutIn.parse(req.body);
    let sub = 0, gst = 0;
    for (const it of b.items) { const t = it.qty * it.rate; sub += t; gst += t * (it.gst_pct / 100); }
    const grand = Math.round(sub + gst);
    if (grand < 1) return next(Object.assign(new Error('Amount must be at least Rs 1'), { status: 400 }));

    const orderId = 'SSE' + Date.now().toString(36).toUpperCase();
    const record = JSON.stringify({ orderId, method: b.method, customer: { name: b.name, phone: b.phone, address: b.address }, items: b.items, sub, gst, grand });

    // Best-effort persistence; checkout still works before the DB is wired.
    try { await requireDb().query('INSERT INTO orders(id,source,text) VALUES($1,$2,$3)', [orderId, 'checkout', record.slice(0, 1000)]); } catch { /* offline */ }

    // Cash on delivery — no gateway, collect on dispatch. Belt area only note on UI.
    if (b.method === 'cod') {
      return res.status(201).json({ mode: 'cod', orderId, sub, gst, grand });
    }
    if (b.method === 'card' && !gatewayConfigured()) {
      return next(Object.assign(new Error('Card payments are not active yet — choose UPI or Cash on delivery.'), { status: 400 }));
    }

    if (gatewayConfigured()) {
      const email = b.email || `orders+${b.phone}@shreeshyamhardware.site`;
      const r = await fetch('https://api.cashfree.com/pg/orders', {
        method: 'POST',
        headers: {
          'x-client-id': String(process.env.CASHFREE_APP_ID),
          'x-client-secret': String(process.env.CASHFREE_SECRET_KEY),
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
        return next(Object.assign(new Error(j.message || 'Gateway rejected the order'), { status: 502 }));
      }
      return res.status(201).json({ mode: 'cashfree', orderId, paymentSessionId: j.payment_session_id, sub, gst, grand });
    }

    const intent = `upi://pay?pa=${encodeURIComponent(env.UPI_ID)}&am=${grand}&tn=${encodeURIComponent(orderId)}`;
    res.status(201).json({ mode: 'upi', orderId, upiId: env.UPI_ID, intent, sub, gst, grand });
  } catch (e) { next(e); }
});
