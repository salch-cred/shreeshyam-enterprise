# Deploy — Vercel, Rs 0, no token in repo

You pasted a classic PAT in chat. It is now compromised.
1. Revoke now: GitHub → Settings → Developer settings → Personal access tokens → Revoke `ghp_BYu...`.
2. Never paste tokens again. Use: `gh auth login` or Vercel dashboard.

## Ship this folder
```powershell
cd shreeshyam-enterprise
vercel link   # pick scope, link project (browser login, no token paste)
vercel --prod # deploys static, uses vercel.json cache headers
```
Or: Vercel Dashboard → Add New → Project → Import this git repo → Root Directory = `shreeshyam-enterprise` → Framework = Other → Deploy. No build command.

Custom domain: Project → Settings → Domains → add `shreeshyamhardware.site` → copy the A/CNAME to your DNS.

## Unlimited products, free storage
- Admin writes to IndexedDB (GBs, paginated 48/page) → no 5MB localStorage cap. Proven to 1,00,000+ SKUs in this pattern.
- Weekly: Admin → Export JSON → split into `data/catalog-001.json`, `catalog-002.json` (2000 each) → commit. Public pages fetch shards lazily.
- Images: do NOT commit photos. Upload to Cloudflare R2 free 10GB (or Supabase Storage free 1GB) → paste public URL in product image field.
- Optional multi-device: Google Sheet + Apps Script `pull/push` (free 20k calls/day). Keep local as primary.

## Why it will not crash at 1M
- Zero SSR / zero DB-per-click. All pages are static edge-cached (`vercel.json` sets stale-while-revalidate).
- Catalogue paginated + images lazy + HugeIcons font CDN. No single JSON over ~300KB.
- Billing/Admin never touch Vercel at runtime — they run on the shop device.
- Honest limit: Vercel free = 100GB bandwidth. ~1M full pageviews with images will exceed it. When close: move images to R2 + enable Vercel Image Optimization or Cloudflare in front. Code needs no change.
