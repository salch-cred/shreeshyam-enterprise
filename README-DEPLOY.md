# Going live

Two Vercel projects come from this one repo:

| Project | Root Directory | What it runs |
|---|---|---|
| Website | repo root | Pages, plus the admin password check in `api/admin-login.js` |
| Backend | `backend` | Email sign-in, Cashfree, paid bills, customers |

The website works alone. Until the backend is connected, account details stay on the device and orders go by WhatsApp.

## 1. Website

1. Vercel, Add New, Project, import the repo. Framework: Other. No build command.
2. Settings, Environment Variables, add `ADMIN_PASSWORD`, at least 10 characters.
3. Deploy, then add `shreeshyamhardware.site` under Settings, Domains.

Add the password before this version goes live. Without it nobody can open admin.
To change the password, change it in Vercel and redeploy.

Until the backend is connected, bills and products stay in that browser, so take Settings, Backup often.

## 2. Database: products go in here

1. Create a free project at neon.com, region Singapore, and copy the connection string.
2. On your computer, from the `backend` folder, create `.env` with `DATABASE_URL=` and that string.
3. Run these once:

```bash
npm install
npm run db:push
npm run seed
```

`db:push` creates the tables. `seed` loads `data/catalog-001.json` once and only fills gaps, so it never overwrites rates or stock changed in admin.

After the backend is connected, the database is the record: admin saves products, rates, stock, bills, udhaar payments and order status there first, and the website reads products from it. A change shows on the website within about 20 seconds. If the database cannot be reached, admin refuses the save and says so.

The first time you sign in to admin after connecting, a banner offers **Upload now**. Press it on the computer that holds your bills. On any other computer, choose **Use the database only**.

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
| `RESEND_API_KEY` | From Resend |
| `OWNER_EMAIL` | Gets an email on every online payment |

3. Put the backend address in `API_URL` at the top of `assets/app.js`, push, and redeploy the website.

After later updates that change the tables, run `npm run db:push` again.

## 4. Cashfree

1. Sign up at cashfree.com and finish KYC. Sign-ups from 21 July 2026 can qualify for the 0% offer.
2. Developers, API Keys: copy the test keys. Keep `CASHFREE_ENV=sandbox`.
3. Test a payment end to end with Cashfree's test details.
4. Whitelist `shreeshyamhardware.site` in the dashboard.
5. Swap in the live keys, set `CASHFREE_ENV=production`, and redeploy.

The webhook address is sent with each order from `PUBLIC_API_URL`.

## 5. Email

Sign-in codes, paid bills and owner alerts go through Resend.

1. Sign up at resend.com and add `shreeshyamhardware.site` as a domain.
2. Add the DNS records Resend shows at your domain provider, and wait for it to say Verified.
3. Create an API key and put it in `RESEND_API_KEY`.
4. Set `OWNER_EMAIL` to the inbox that should get payment alerts, and turn on notifications for it on your phone.

Sign-in codes are capped at 4 an hour per address and 60 a day in total, which leaves room for bills and alerts in the free plan's 100 emails a day. Change the cap with `OTP_DAILY_CAP`.

## Costs

Check each provider's page before paying, since prices change.

| Item | Cost |
|---|---|
| Neon database | Free plan |
| Cashfree | No setup fee. 0% offer up to Rs 20 lakh for eligible new merchants, then 1.95% plus GST |
| Direct UPI to your own ID | No gateway fee, confirmed by hand with Mark paid |
| Resend email | Free plan: 3,000 emails a month, 100 a day |
| Vercel | Hobby is non-commercial only, so this shop needs a paid plan |

## Unlimited products

- Admin keeps products in IndexedDB, not `localStorage`.
- Do not commit large photos. Host them on Cloudflare R2 or similar and paste the public URL in the product's image field.
