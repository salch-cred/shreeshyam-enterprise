import { Router } from 'express';
import type { Pool } from 'pg';
import { auth } from '../auth.js';
import { requireDb, tx } from '../db.js';
import { InvoiceIn } from '../validate.js';

// Indian financial year label: 1 April 2026 to 31 March 2027 is 26-27.
export function financialYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear() - (ist.getUTCMonth() < 3 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

// Race-safe numbering: Postgres sequence when the DBA ran sequence.sql,
// else legacy MAX()+1 (two simultaneous bills could collide there — the
// UNIQUE PK then rejects one with 500 instead of silently duplicating).
async function nextInvoiceNo(p: Pool): Promise<string> {
  const fy = financialYear();
  try {
    const r = await p.query(`SELECT $1 || LPAD(nextval('invoice_seq')::text,4,'0') n`, [`SSE/${fy}/`]);
    return r.rows[0].n as string;
  } catch {
    const r = await p.query(
      `SELECT $1 || LPAD((COALESCE(MAX((regexp_match(no,'([0-9]+)$'))[1])::int,0)+1)::text,4,'0') n FROM invoices WHERE type='TAX' AND no LIKE $2`,
      [`SSE/${fy}/`, `SSE/${fy}/%`]);
    return r.rows[0].n as string;
  }
}

// Discount comes off the taxable value before GST, shared across lines by value.
export function money(items: { qty: number; rate: number; gst_pct: number }[], discount: number) {
  const sub = items.reduce((a, it) => a + it.qty * it.rate, 0);
  const keep = sub > 0 ? Math.max(0, sub - discount) / sub : 1;
  const gst = items.reduce((a, it) => a + it.qty * it.rate * keep * (it.gst_pct / 100), 0);
  return { sub: Math.round(sub), gst: Math.round(gst), grand: Math.round(sub * keep + gst) };
}

export const billing = Router();

// Save invoice/estimate. TAX cuts stock in one transaction and books udhaar balance.
billing.post('/invoices', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const b = InvoiceIn.parse(req.body);
    const t = money(b.items, b.discount);
    if (b.discount > t.sub) return next(Object.assign(new Error('Discount is more than the bill value'), { status: 400 }));
    if (b.paid > t.grand) return next(Object.assign(new Error('Received amount is more than the bill total'), { status: 400 }));
    const balance = t.grand - b.paid;
    // Numbered before the transaction: taking a second pooled connection while
    // holding one can deadlock the pool under load, and a failed nextval would abort it.
    const n = b.type === 'TAX' ? await nextInvoiceNo(requireDb()) : `EST-${Date.now()}`;
    const no = await tx(async (c) => {
      await c.query(
        'INSERT INTO invoices(no,type,customer,phone,items,subtotal,discount,gst,grand,paid,balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [n, b.type, b.customer, b.phone, JSON.stringify(b.items), t.sub, b.discount, t.gst, t.grand, b.paid, balance]);
      if (b.type === 'TAX') {
        for (const it of b.items) {
          await c.query('UPDATE products SET stock = stock - $2, updated_at=NOW() WHERE id=$1', [it.id, it.qty]);
          await c.query('INSERT INTO stock_log(product_id,delta,reason) VALUES($1,$2,$3)', [it.id, -it.qty, n]);
        }
      }
      return n;
    });
    res.status(201).json({ no, ...t, balance });
  } catch (e) { next(e); }
});

// There is deliberately no customer "my invoices" route. Registration does not verify the
// phone number, so matching bills on phone would let anyone read another plant's invoices.
// Add it back only with OTP verification in place.

billing.get('/invoices', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const rows = (await requireDb().query(
      'SELECT no,type,customer,subtotal,discount,gst,grand,paid,balance,date FROM invoices ORDER BY date DESC LIMIT $1', [limit])).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

billing.get('/reports/summary', auth(['admin']), async (_req, res, next) => {
  try {
    const p = requireDb();
    const sales = (await p.query('SELECT COUNT(*)::int n, COALESCE(SUM(grand),0)::int total, COALESCE(SUM(balance),0)::int due FROM invoices WHERE type=$1', ['TAX'])).rows[0];
    const low = (await p.query('SELECT COUNT(*)::int n FROM products WHERE stock <= min_stock')).rows[0].n;
    res.json({ bills: sales.n, revenue: sales.total, outstanding: sales.due, lowStock: low });
  } catch (e) { next(e); }
});
