import { env } from './env.js';

// Sends one approved DLT template through MSG91. Values fill its ##variables##.
export async function sendTemplate(templateId: string, phone: string, values: Record<string, string>) {
  const r = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { authkey: env.MSG91_AUTH_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ template_id: templateId, short_url: '0', recipients: [{ mobiles: '91' + phone, ...values }] }),
  });
  const j = await r.json().catch(() => ({})) as { type?: string; message?: string };
  if (!r.ok || j.type === 'error') throw new Error(`MSG91 ${r.status} ${j.message || ''}`);
}

// The money is already safe, so a failed alert is logged and never breaks the payment.
export async function alertOwner(invoice: string, amount: number) {
  if (!env.MSG91_AUTH_KEY || !env.MSG91_OWNER_TEMPLATE_ID || !env.OWNER_PHONE) return;
  try {
    await sendTemplate(env.MSG91_OWNER_TEMPLATE_ID, env.OWNER_PHONE, { invoice, amount: String(amount) });
  } catch (e) {
    console.error('[sms] owner alert failed', (e as Error).message);
  }
}
