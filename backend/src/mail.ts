import { env } from './env.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const mailConfigured = () => Boolean(env.RESEND_API_KEY);
const site = () => env.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');

export async function sendMail(to: string, subject: string, text: string, body: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM, to: [to], subject, text,
      html: `<div style="max-width:480px;margin:0 auto;padding:24px;font:16px/1.5 Arial,sans-serif;color:#182430">${body}<p style="margin-top:28px;font-size:13px;color:#55606b">Shree Shyam Enterprises, RIICO Hanuman Market, Neemrana</p></div>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}

export const sendCode = (to: string, code: string) => sendMail(to, `${code} is your sign-in code`,
  `Your Shree Shyam Enterprises sign-in code is ${code}. It expires in 5 minutes.`,
  `<p>Your sign-in code is</p><p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:8px 0">${code}</p><p>It expires in 5 minutes. If you did not ask for it, ignore this email.</p>`);

// The money is already safe, so a failed email is logged and never breaks the payment.
async function quietly(what: string, send: () => Promise<void>) {
  if (!mailConfigured()) return;
  try { await send(); } catch (e) { console.error(`[mail] ${what} failed`, (e as Error).message); }
}

export const alertOwner = (invoice: string, amount: number, customer: string) => quietly('owner alert', async () => {
  if (env.OWNER_EMAIL) await sendMail(env.OWNER_EMAIL, `Payment received: Rs ${amount}, ${invoice}`,
    `${customer} paid Rs ${amount} online. Bill ${invoice}.`,
    `<p><b>Payment received</b></p><p>${esc(customer)} paid Rs ${amount} online.</p><p>Bill ${esc(invoice)}</p>`);
});

export const sendBill = (to: string, orderId: string, invoice: string, amount: number) => quietly('bill', async () => {
  const link = `${site()}/invoice?order=${encodeURIComponent(orderId)}`;
  await sendMail(to, `Your bill ${invoice}`,
    `Thank you. We have received Rs ${amount}. View and print your bill ${invoice}: ${link}`,
    `<p><b>Thank you</b></p><p>We have received Rs ${amount}.</p><p><a href="${esc(link)}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#c9420c;color:#fff;text-decoration:none">View and print bill ${esc(invoice)}</a></p>`);
});
