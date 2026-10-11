// Seeds products + content from data/catalog-001.json into Postgres.
// Run once after `npm run db:push`:  npm run seed
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing — set it in backend/.env or Vercel env first.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'catalog-001.json'), 'utf8'));

  let n = 0;
  for (const p of cat.products) {
    await pool.query(
      `INSERT INTO products(id,name,brand,category,unit,hsn,image,rate_retail,rate_wholesale,gst_pct,stock,min_stock)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, brand=EXCLUDED.brand, category=EXCLUDED.category,
       unit=EXCLUDED.unit, hsn=EXCLUDED.hsn, image=EXCLUDED.image, rate_retail=EXCLUDED.rate_retail,
       rate_wholesale=EXCLUDED.rate_wholesale, gst_pct=EXCLUDED.gst_pct, stock=EXCLUDED.stock,
       min_stock=EXCLUDED.min_stock, updated_at=NOW()`,
      [p.id, p.name, p.brand, p.category, p.unit, p.hsn || '', p.image || '',
       p.rate_retail || 0, p.rate_wholesale || 0, p.gst_pct || 18, p.stock || 0, p.min_stock || 5]);
    n++;
  }
  for (const [k, v] of Object.entries(cat.content || {})) {
    await pool.query('INSERT INTO content(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
      [k, JSON.stringify(v)]);
  }
  console.log('Seeded ' + n + ' products + ' + Object.keys(cat.content || {}).length + ' content keys.');
  await pool.end();
})().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
