-- Run once on your Postgres (Supabase SQL editor or psql) AFTER `npm run db:push`.
-- Gives gap-free-ish, race-safe TAX invoice numbers. The API uses it when present
-- and falls back to MAX()+1 when it is missing, so old DBs keep working.
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- If you already have bills, fast-forward past them:
-- SELECT setval('invoice_seq', COALESCE(MAX((regexp_match(no,'([0-9]+)$'))[1])::int, 0) FROM invoices WHERE type='TAX');
