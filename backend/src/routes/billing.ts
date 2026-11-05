import { Router } from 'express';
import type { PoolClient } from 'pg';
import { auth } from '../auth.js';
import { requireDb, tx } from '../db.js';
import { BillsIn, InvoiceIn, PaymentIn } from '../validate.js';

// Indian financial year label: 1 April 2026 to 31 March 2027 is 26-27.
export function financialYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear() - (ist.getUTCMonth() < 3 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}

// Numbers run on from the last bill, under a lock, so two counters never share one.
async function nextInvoiceNo(c: PoolClient): Promise<string> {
  await c.query('SELECT pg_advisory_xact_lock(7541)');
  const prefix = `SSE/${financialYear()}/`;
  const last = (await c.query(`SELECT COALESCE(MAX((regexp_match(no,'([0-9]+)$'))[1]::int),0) n FROM invoices WHERE no LIKE $1`, [prefix + '%'])).rows[0].n as number;
  return prefix + String(last + 1).padStart(4, '0');
}

// A line can carry its own % off. A bill discount then comes off the taxable value
// before GST, shared across lines by value. The counter's screen uses the same sums.
export function money(items: { qty: number; rate: number; gst_pct: number; disc_pct?: number }[], discount: number) {
  const net = (it: { qty: number; rate: number; disc_pct?: number }) => it.qty * it.rate * (1 - (it.disc_pct || 0) / 100);
  const sub = items.reduce((a, it) => a + net(it), 0);
  const keep = sub > 0 ? Math.max(0, sub - discount) / sub : 1;
  const gst = items.reduce((a, it) => a + net(it) * keep * (it.gst_pct / 100), 0);
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
    const no = await tx(async (c) => {
      const n = b.type === 'TAX' ? await nextInvoiceNo(c) : `EST-${Date.now()}`;
      await c.query(
        'INSERT INTO invoices(no,type,customer,phone,gstin,address,mode,items,subtotal,discount,gst,grand,paid,balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [n, b.type, b.customer, b.phone, b.gstin, b.address, b.mode, JSON.stringify(b.items), t.sub, b.discount, t.gst, t.grand, b.paid, balance]);
      if (b.type === 'TAX') {
        for (const it of b.items) {
          const r = await c.query('UPDATE products SET stock = stock - $2, updated_at=NOW() WHERE id=$1', [it.id, it.qty]);
          if (r.rowCount) await c.query('INSERT INTO stock_log(product_id,delta,reason) VALUES($1,$2,$3)', [it.id, -it.qty, n]);
        }
      }
      return n;
    });
    res.status(201).json({ no, ...t, balance });
  } catch (e) { next(e); }
});

// Every recent bill in full, so the counter's ledger, reports and reprints match the database.
billing.get('/invoices/all', auth(['admin', 'billing']), async (_req, res, next) => {
  try {
    const rows = (await requireDb().query(
      `SELECT no,order_id,type,date,customer,phone,gstin,address,mode,items,subtotal,discount,gst,grand,paid,balance FROM invoices ORDER BY date DESC LIMIT 1500`)).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// Money received later against udhaar. The row is locked so two counters cannot both apply it.
billing.post('/invoices/payment', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const { no, amount } = PaymentIn.parse(req.body);
    const out = await tx(async (c) => {
      const r = (await c.query('SELECT grand,paid,balance FROM invoices WHERE no=$1 FOR UPDATE', [no])).rows[0] as { grand: number; paid: number; balance: number } | undefined;
      if (!r) return null;
      const paid = r.paid + Math.min(amount, r.balance), balance = Math.max(0, r.grand - paid);
      await c.query('UPDATE invoices SET paid=$2,balance=$3 WHERE no=$1', [no, paid, balance]);
      return { paid, balance };
    });
    if (!out) return next(Object.assign(new Error('Bill not found'), { status: 404 }));
    res.json(out);
  } catch (e) { next(e); }
});

// One-time move of bills from a browser. Bills already here are left alone, and stock is
// not touched because those sales are already counted in the products sent with them.
billing.post('/invoices/import', auth(['admin']), async (req, res, next) => {
  try {
    const { bills } = BillsIn.parse(req.body);
    let added = 0;
    await tx(async (c) => {
      for (const b of bills) {
        const t = money(b.items, b.discount);
        const r = await c.query(
          `INSERT INTO invoices(no,type,date,customer,phone,gstin,address,mode,items,subtotal,discount,gst,grand,paid,balance)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(no) DO NOTHING`,
          [b.no, b.type, b.date, b.customer, b.phone, b.gstin, b.address, b.mode, JSON.stringify(b.items), t.sub, b.discount, t.gst, b.grand, b.paid, b.balance]);
        added += r.rowCount || 0;
      }
    });
    res.status(201).json({ added });
  } catch (e) { next(e); }
});

billing.get('/stock-log', auth(['admin', 'billing']), async (_req, res, next) => {
  try {
    const rows = (await requireDb().query('SELECT product_id,delta,reason,date FROM stock_log ORDER BY id DESC LIMIT 40')).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

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
