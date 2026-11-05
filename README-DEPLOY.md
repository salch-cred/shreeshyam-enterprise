# Going live

Two Vercel projects come from this one repo:

| Project | Root Directory | What it runs |
|---|---|---|
| Website | repo root | Pages, plus the admin password check in `api/admin-login.js` |
| Backend | `backend` | SMS sign-in, Cashfree, paid bills, customers |

The website works alone. Until the backend is connected, account details stay on the device and orders go by WhatsApp.

## 1. Website

1. Vercel, Add New, Project, import the repo. Framework: Other. No build command.
2. Settings, Environment Variables, add `ADMIN_PASSWORD`, at least 10 characters.
3. Deploy, then add `shreeshyamhardware.site` under Settings, Domains.

Add the password before this version goes live. Without it nobody can open admin.
To change the password, change it in Vercel and redeploy.

Bills and products in admin stay in that browser. Take Settings, Backup often.

## 2. Database: products go in here

1. Create a free project at neon.com, region Singapore, and copy the connection string.
2. On your computer, from the `backend` folder, create `.env` with `DATABASE_URL=` and that string.
3. Run these once:

```bash
npm install
npm run db:push
npm run seed
```

`db:push` creates the tables. `seed` loads every product in `data/catalog-001.json`.
Run `seed` again whenever the catalogue changes. It updates products and adds no duplicates.

Online checkout reads rates from this database. A product at rate 0 goes out as a quote and cannot be paid online, so add rates in admin, export the catalogue, replace `data/catalog-001.json`, and seed again.

## 3. Backend

1. Vercel, Add New, Project, import the same repo, Root Directory `backend`.
2. Add these environment variables, then deploy.

| Name | Value |
|---|---|
| `DATABASE_URL` | From Neon |
| `JWT_SECRET` | 64 random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD` | Same as the website |
| `CORS_ORIGIN` | `https://shreeshyamhardware.site` |
| `PUBLIC_API_URL` | This backend's https address |
| `UPI_ID` | Your real UPI ID |
| `CASHFREE_APP_ID` | From Cashfree |
| `CASHFREE_SECRET_KEY` | From Cashfree |
| `CASHFREE_ENV` | `sandbox`, later `production` |
| `MSG91_AUTH_KEY` | From MSG91 |
| `MSG91_TEMPLATE_ID` | Approved OTP template |
| `MSG91_OWNER_TEMPLATE_ID` | Approved owner alert template |
| `OWNER_PHONE` | 10 digit mobile for payment alerts |

3. Put the backend address in `API_URL` at the top of `assets/app.js`, push, and redeploy the website.

After later updates that change the tables, run `npm run db:push` again.

## 4. Cashfree

1. Sign up at cashfree.com and finish KYC. Sign-ups from 21 July 2026 can qualify for the 0% offer.
2. Developers, API Keys: copy the test keys. Keep `CASHFREE_ENV=sandbox`.
3. Test a payment end to end with Cashfree's test details.
4. Whitelist `shreeshyamhardware.site` in the dashboard.
5. Swap in the live keys, set `CASHFREE_ENV=production`, and redeploy.

The webhook address is sent with each order from `PUBLIC_API_URL`.

## 5. SMS

Every business SMS in India needs DLT registration.

1. Register as a Principal Entity on a DLT portal such as Jio or Airtel, using your GST papers.
2. Get a sender ID approved.
3. Get two templates approved. In MSG91 they carry `##otp##`, and `##invoice##` with `##amount##`:
   - `{#var#} is your Shree Shyam Enterprises login code. It expires in 5 minutes.`
   - `Payment received. Bill {#var#}, amount Rs {#var#}. Shree Shyam Enterprises`
4. In MSG91, add the DLT details and create both templates. Copy the auth key and template IDs into Vercel.
5. Recharge MSG91, then test with your own number.

Sign-in codes are capped at 4 an hour per number and 300 a day in total, so a bot cannot empty the balance. Change the daily cap with `OTP_DAILY_CAP`.

## Costs

Check each provider's page before paying, since prices change.

| Item | Cost |
|---|---|
| Neon database | Free plan |
| Cashfree | No setup fee. 0% offer up to Rs 20 lakh for eligible new merchants, then 1.95% plus GST |
| Direct UPI to your own ID | No gateway fee, confirmed by hand with Mark paid |
| DLT | About Rs 5,900 |
| MSG91 | About Rs 0.25 per SMS on the smallest listed pack, plus GST |
| Vercel | Hobby is non-commercial only, so this shop needs a paid plan |

## Unlimited products

- Admin keeps products in IndexedDB, not `localStorage`.
- Do not commit large photos. Host them on Cloudflare R2 or similar and paste the public URL in the product's image field.
