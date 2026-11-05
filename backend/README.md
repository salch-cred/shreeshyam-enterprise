# SSE TypeScript backend — Express + pg + Zod, Vercel serverless, free Postgres

## What it is
`src/` is strict TypeScript. No ORM at runtime (cold start stays small).
`prisma/schema.prisma` is the schema source of truth; runtime uses `pg` Pool directly.

Routes:
- `GET /health` — `{ok, db}` tells you if Postgres is wired
- `POST /auth/login {password}` → `{token, role}` (admin JWT, 12h)
- `GET /products?q&category&page&pageSize` — public, paginated to 100/page, edge cached
- `POST /products` (admin) — upsert unlimited SKUs, Zod validated
- `POST /products/:id/stock` (admin+billing) — stock move in a transaction + log
- `GET /products/low` (admin)
- `POST /invoices` (admin+billing) — totals server side, TAX cuts stock transactionally
- `GET /invoices?limit`, `GET /reports/summary` (admin)
- `POST /orders` (public), `GET /orders` (admin), `GET/PUT /content`

## Run locally
```powershell
cd backend
npm install
Copy-Item .env.example .env   # fill DATABASE_URL from Supabase/Neon free tier
npm run db:push               # creates tables
npm run dev                   # :4000
```

## Deploy (Rs 0, two free projects)
1. Create free Postgres: Supabase (500MB) or Neon (3GB) → copy pooled connection string (port 6543).
2. Site project: Vercel → import repo → Root Directory = `shreeshyam-enterprise` → Framework Other → Deploy.
3. API project: Vercel → import SAME repo → Root Directory = `shreeshyam-enterprise/backend` → env `DATABASE_URL`, `JWT_SECRET` (32 random chars), `ADMIN_PIN`, `BILLING_PIN`, `CORS_ORIGIN=https://shreeshyamhardware.site` → Deploy. Entry is `api/index.ts`.
4. From your machine once: `npm run db:push`, then run `prisma/sequence.sql` in the Supabase SQL editor.
5. Frontend: `localStorage.setItem('sse_api','https://<api-project>.vercel.app')`. `assets/api.js` uses it; unset = pages keep working offline on IndexedDB.

## Scale notes
- Reads are paginated + `Cache-Control: stale-while-revalidate`; 1M catalogue views hit edge cache, not Postgres.
- Writes are tiny (billing/stock) — pooled `max:5` fits free Postgres connection limits.
- Images stay on R2/Supabase Storage URLs, never in the DB.
