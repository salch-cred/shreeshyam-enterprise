import { Router } from 'express';
import { auth } from '../auth.js';
import type { z } from 'zod';
import { requireDb, tx } from '../db.js';
import { ProductIn, ProductsIn, StockMove } from '../validate.js';

export const products = Router();

const SAVE = `INSERT INTO products(id,name,brand,category,unit,hsn,image,rate_retail,rate_wholesale,gst_pct,stock,min_stock,updated_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,brand=EXCLUDED.brand,category=EXCLUDED.category,
  unit=EXCLUDED.unit,hsn=EXCLUDED.hsn,image=EXCLUDED.image,rate_retail=EXCLUDED.rate_retail,
  rate_wholesale=EXCLUDED.rate_wholesale,gst_pct=EXCLUDED.gst_pct,stock=EXCLUDED.stock,min_stock=EXCLUDED.min_stock,
  updated_at=NOW()`;
const row = (id: string, b: z.infer<typeof ProductIn>) => [id, b.name, b.brand, b.category, b.unit, b.hsn, b.image, b.rate_retail, b.rate_wholesale, b.gst_pct, b.stock, b.min_stock];

// The whole catalogue for the website and the counter. Short cache, so a new rate shows
// within seconds and checkout always charges what the database holds.
products.get('/catalog', async (_req, res, next) => {
  try {
    const rows = (await requireDb().query(
      'SELECT id,name,brand,category,unit,hsn,image,rate_retail,rate_wholesale,gst_pct,stock,min_stock FROM products ORDER BY name')).rows;
    res.set('Cache-Control', 'public, max-age=20');
    res.json({ items: rows });
  } catch (e) { next(e); }
});

products.post('/bulk', auth(['admin']), async (req, res, next) => {
  try {
    const list = ProductsIn.parse(req.body).products;
    await tx(async (c) => { for (const b of list) await c.query(SAVE, row(b.id || `P-${Date.now().toString(36).toUpperCase()}`, b)); });
    res.status(201).json({ saved: list.length });
  } catch (e) { next(e); }
});

// Public catalogue — paginated, edge-cacheable. Unlimited SKUs via page/pageSize.
products.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '');
    const cat = String(req.query.category || '');
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize)) || 48));
    const p = requireDb();
    const where: string[] = [];
    const args: unknown[] = [];
    if (q) { args.push(`%${q}%`); where.push(`(name ILIKE $${args.length} OR brand ILIKE $${args.length})`); }
    if (cat) { args.push(cat); where.push(`category = $${args.length}`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await p.query(`SELECT COUNT(*)::int c FROM products ${w}`, args)).rows[0].c as number;
    args.push(pageSize, (page - 1) * pageSize);
    const rows = (await p.query(
      `SELECT id,name,brand,category,unit,hsn,image,rate_retail,rate_wholesale,gst_pct,stock,min_stock
       FROM products ${w} ORDER BY name LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.json({ page, pageSize, total, items: rows });
  } catch (e) { next(e); }
});

products.post('/', auth(['admin']), async (req, res, next) => {
  try {
    const b = ProductIn.parse(req.body);
    const p = requireDb();
    const id = b.id || `P-${Date.now().toString(36).toUpperCase()}`;
    await p.query(SAVE, row(id, b));
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

products.delete('/:id', auth(['admin']), async (req, res, next) => {
  try {
    const r = await requireDb().query('DELETE FROM products WHERE id=$1', [req.params.id]);
    if (!r.rowCount) return next(Object.assign(new Error('No such product'), { status: 404 }));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

products.post('/:id/stock', auth(['admin', 'billing']), async (req, res, next) => {
  try {
    const { delta, reason } = StockMove.parse(req.body);
    const changed = await tx(async (c) => {
      const r = await c.query('UPDATE products SET stock = stock + $2, updated_at=NOW() WHERE id=$1', [req.params.id, delta]);
      if (r.rowCount) await c.query('INSERT INTO stock_log(product_id,delta,reason) VALUES($1,$2,$3)', [req.params.id, delta, reason]);
      return r.rowCount;
    });
    if (!changed) return next(Object.assign(new Error('No such product'), { status: 404 }));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

products.get('/low', auth(['admin']), async (_req, res, next) => {
  try {
    const rows = (await requireDb().query(
      'SELECT id,name,stock,min_stock FROM products WHERE stock <= min_stock ORDER BY stock LIMIT 200')).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});
