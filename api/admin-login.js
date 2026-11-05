/* Checks the admin password set in Vercel: Project, Settings, Environment Variables,
   ADMIN_PASSWORD. The password never reaches the browser or the code. */
const { createHash, timingSafeEqual } = require('crypto');

const WINDOW = 15 * 60 * 1000, MAX_WRONG = 10;
const wrong = new Map();
const digest = s => createHash('sha256').update(String(s)).digest();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const want = process.env.ADMIN_PASSWORD || '';
  if (want.length < 10) return res.status(503).json({ error: 'Set ADMIN_PASSWORD in Vercel, at least 10 characters, then redeploy.' });

  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim(), now = Date.now();
  const tries = (wrong.get(ip) || []).filter(t => now - t < WINDOW);
  if (tries.length >= MAX_WRONG) return res.status(429).json({ error: 'Too many wrong tries. Wait 15 minutes.' });

  await new Promise(r => setTimeout(r, 300));
  if (timingSafeEqual(digest(req.body?.password ?? ''), digest(want))) {
    wrong.delete(ip);
    return res.status(200).json({ ok: true });
  }
  tries.push(now);
  wrong.set(ip, tries);
  res.status(401).json({ error: 'Wrong password' });
};
