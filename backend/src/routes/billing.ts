import { Router, type Request } from 'express';
import type { Pool } from 'pg';
import { auth } from '../auth.js';
import { requireDb } from '../db.js';
import { InvoiceIn } from '../validate.js';

// Race-safe numbering: Postgres sequence when the DBA ran sequence.sql,
// else legacy MAX()+1 (two simultaneous bills could collide there — the
// UNIQUE PK then rejects one with 500 instead of silently duplicating).
async function nextInvoiceNo(p: Pool): Promise<string> {
  try {
    const r = await p.query(`SELECT 'SSE/25-26/' || LPAD(nextval('invoice_seq')::text,4,'0') n`);
    return r.rows[0].n as string;
  } catch {
    const r = await p.query(`SELECT 'SSE/25-26/' || LPAD((COALESCE(MAX((regexp_match(no,'([0-9]+)$'))[1])::int,0)+1)::text,4,'0') n FROM invoices WHERE type='TAX'`);
    return r.rows[0].n as string;
  }
}

function money(items: { qty: number; rate: number; gst_pct: number }[], discount: number) {
  let sub = 0, gst = 0;
  for (const it of items) { const t = it.qty * it.rate; sub += t; gst += t * (it.gst_pct / 100); }
  return { sub: Math.round(sub), gst: Math.round(gst), grand: Math.round(sub + gst - discount) };
}

export const billing = Router();

// Save invoice/estimate. TAX cuts stock in one transaction and books udhaar balance.
billing.post('/invoices', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const b = InvoiceIn.parse(req.body);
    const t = money(b.items, b.discount);
    const balance = t.grand - b.paid;
    const p = requireDb();
    const no = b.type === 'TAX'
      ? await nextInvoiceNo(p)
      : `EST-${Date.now()}`;
    await p.query('BEGIN');
    await p.query(
      'INSERT INTO invoices(no,type,customer,phone,items,subtotal,discount,gst,grand,paid,balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [no, b.type, b.customer, b.phone, JSON.stringify(b.items), t.sub, b.discount, t.gst, t.grand, b.paid, balance]);
    if (b.type === 'TAX') {
      for (const it of b.items) {
        await p.query('UPDATE products SET stock = stock - $2, updated_at=NOW() WHERE id=$1', [it.id, it.qty]);
        await p.query('INSERT INTO stock_log(product_id,delta,reason) VALUES($1,$2,$3)', [it.id, -it.qty, no]);
      }
    }
    await p.query('COMMIT');
    res.status(201).json({ no, ...t, balance });
  } catch (e) { try { await requireDb().query('ROLLBACK'); } catch {} next(e); }
});

billing.get('/invoices/mine', auth(['customer']), async (req, res, next) => {
  try {
    const phone = (req as unknown as { phone?: string }).phone || '';
    const rows = (await requireDb().query(
      'SELECT no,type,customer,grand,gst,paid,balance,date FROM invoices WHERE phone=$1 ORDER BY date DESC LIMIT 100', [phone])).rows;
    const due = rows.reduce((a, r) => a + (r.balance || 0), 0);
    res.json({ items: rows, outstanding: due });
  } catch (e) { next(e); }
});

billing.get('/invoices', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
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
