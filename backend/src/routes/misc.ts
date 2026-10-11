import { Router } from 'express';
import { auth } from '../auth.js';
import { requireDb } from '../db.js';
import { ContentIn, OrderIn } from '../validate.js';

export const misc = Router();

misc.post('/orders', async (req, res, next) => {
  try {
    const b = OrderIn.parse(req.body);
    const id = `W${Date.now()}`;
    await requireDb().query('INSERT INTO orders(id,source,text) VALUES($1,$2,$3)', [id, b.source, b.text.slice(0, 1000)]);
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

misc.get('/orders', auth(['admin']), async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const rows = (await requireDb().query('SELECT id,source,text,status,created FROM orders ORDER BY created DESC LIMIT $1', [limit])).rows;
    res.json({ items: rows });
  } catch (e) { next(e); }
});

misc.get('/content', async (_req, res, next) => {
  try {
    const rows = (await requireDb().query('SELECT key,value FROM content')).rows as { key: string; value: unknown }[];
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (e) { next(e); }
});

misc.put('/content', auth(['admin']), async (req, res, next) => {
  try {
    const b = ContentIn.parse(req.body);
    const p = requireDb();
    for (const [k, v] of Object.entries(b)) {
      await p.query(`INSERT INTO content(key,value) VALUES($1,$2)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`, [k, JSON.stringify(v)]);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
