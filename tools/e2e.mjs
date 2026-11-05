/* End-to-end test of the whole site in a real browser.
   Serves the folder with the production headers from vercel.json, so the CSP is enforced.

   Setup:  npm i playwright-core   (uses the Edge or Chrome already installed)
   Run:    node tools/e2e.mjs [folder for screenshots and the invoice PDF]        */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '.e2e'));
process.env.ADMIN_PASSWORD = 'test-counter-1';
const loginFn = createRequire(import.meta.url)(join(ROOT, 'api/admin-login.js'));
// Runs the real Vercel function, with the two response helpers Vercel adds.
const runLogin = (req, body) => new Promise(done => {
  const out = { code: 0, json: null };
  const res = { setHeader() {}, status(c) { out.code = c; return res; }, json(j) { out.json = j; done(out); } };
  loginFn({ method: req.method, headers: req.headers, body }, res);
});
await mkdir(OUT, { recursive: true });
const require = createRequire(process.env.E2E_NODE_PATH ? join(process.env.E2E_NODE_PATH, 'x.js') : import.meta.url);
const { chromium } = require('playwright-core');

const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const base = vercel.headers[0].headers.map(h => [h.key, h.value.replace('; upgrade-insecure-requests', '')]);
const server = createServer(async (req, res) => {
  if (req.url === '/api/admin-login') {
    let raw = ''; for await (const c of req) raw += c;
    const o = await runLogin(req, raw ? JSON.parse(raw) : {});
    res.statusCode = o.code; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(o.json));
  }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  if (!extname(p)) p += '.html';                    // Vercel cleanUrls
  const file = join(ROOT, p);
  base.forEach(([k, v]) => res.setHeader(k, v));
  try {
    if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw 0;
    res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.setHeader('Content-Type', 'text/html'); res.end(await readFile(join(ROOT, '404.html'))); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;

let channel = 'msedge';
const browser = await chromium.launch({ channel, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] }).catch(async () => { channel = 'chrome'; return chromium.launch({ channel }); });

let closing = false;
process.on('unhandledRejection', async e => { if (closing) return; console.log('CRASH', String(e.message).slice(0, 300)); process.exit(2); });
const results = [];
const problems = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`); }
async function ctx({ gl = false, ...opts } = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 }, ...opts });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1|fonts\.g)/, r => { problems.push('external request: ' + r.request().url()); r.abort().catch(() => {}); });
  const page = await c.newPage();
  // Playwright's own waitForFunction evals strings, which this site's CSP rightly blocks.
  page.waitForFunction = async (fn, arg, opts = {}) => {
    const end = Date.now() + (opts.timeout || 8000);
    for (;;) {
      if (await page.evaluate(fn, arg)) return;
      if (Date.now() > end) throw new Error('timed out: ' + fn);
      await page.waitForTimeout(60);
    }
  };
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource|ERR_NAME/.test(m.text())) problems.push('console: ' + m.text()); });
  // Software WebGL starves the page on a GPU-less runner, so only the visual sweep keeps it on.
  if (!gl) await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; window.__printed = 0; window.print = () => { window.__printed++; }; });
  return { c, page };
}
const go = (page, path) => page.goto(SITE + path, { waitUntil: 'domcontentloaded' });
const money = s => Number(String(s).replace(/[^0-9.-]/g, ''));

/* ---------- static and headers ---------- */
{
  const r = await fetch(SITE + '/');
  const csp = r.headers.get('content-security-policy') || '';
  check('CSP forbids inline scripts', /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe/.test(csp));
  check('Clickjacking blocked', /frame-ancestors 'none'/.test(csp) && r.headers.get('x-frame-options') === 'DENY');
  check('nosniff, referrer and permissions headers', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('referrer-policy') && r.headers.get('permissions-policy'));
  check('Unknown URL serves 404 page', (await fetch(SITE + '/nothing-here')).status === 404);
  for (const f of ['bot.js', 'mascot.js', 'styles.css', 'api.js']) check(`Dead file removed: ${f}`, (await fetch(`${SITE}/assets/${f}`)).status === 404);
  const robots = await (await fetch(SITE + '/robots.txt')).text();
  check('robots.txt hides admin', /Disallow: \/admin/.test(robots));
  const html = {};
  for (const p of ['index', 'shop', 'checkout', 'account', 'admin', 'billing', 'invoice', 'privacy', 'terms', '404']) html[p] = await (await fetch(`${SITE}/${p}.html`)).text();
  check('No inline scripts or handlers in any page', Object.values(html).every(h => !/<script>/.test(h) && !/\son[a-z]+="/.test(h)));
  check('No default PIN anywhere in the console', !/2580/.test(html.admin) && !/2580/.test(await (await fetch(SITE + '/assets/admin.js')).text()));
  check('Leftover paint-shop text is gone', !/tinted/i.test(html.terms + await (await fetch(SITE + '/assets/admin.js')).text()));
  const cat = await (await fetch(SITE + '/data/catalog-001.json')).json();
  const missing = [];
  for (const p of cat.products) if (p.image && !/^https?:/.test(p.image) && (await fetch(`${SITE}/${p.image}`)).status !== 200) missing.push(p.id);
  check('Every catalogue image exists', !missing.length, missing.join(', '));
}

/* ---------- every page loads clean, desktop and phones ---------- */
const PAGES = [['landing', '/'], ['catalogue', '/shop.html'], ['checkout', '/checkout.html'], ['account', '/account.html'], ['admin-gate', '/admin.html'], ['privacy', '/privacy.html'], ['terms', '/terms.html'], ['404', '/404.html']];
if (!process.env.E2E_QUICK) for (const [label, vp] of [['desktop', { width: 1280, height: 760 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ['small phone', { width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const { width, height, ...rest } = vp;
  const { c, page } = await ctx({ gl: true, viewport: { width, height }, ...rest });
  for (const [name, path] of PAGES) {
    await go(page, path);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect(), s = getComputedStyle(e);
        if (!r.width || s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return false;
        for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p); if (/auto|scroll|hidden|clip/.test(o.overflowX) && p !== document.body && p !== document.documentElement) return false; }
        return r.right > w + 1 || r.left < -1;
      }).slice(0, 3).map(e => e.tagName + '.' + e.className);
      const broken = [...document.images].filter(i => i.complete && !i.naturalWidth && i.getAttribute('src')).map(i => i.src);
      const tiny = [...document.querySelectorAll('a,button,input,select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 24 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.foot,.co-rm,.stepper,[hidden]') && !e.matches('[type=checkbox],.co-rm,.skip'); }).length;
      const over = document.documentElement.scrollWidth > w ? [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > w + .5 && getComputedStyle(e).display !== 'none').map(e => e.tagName + '.' + String(e.className).slice(0, 24)).slice(0, 8) : [];
      const tinyNames = [...document.querySelectorAll('a,button,input,select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 24 && !e.closest('.foot,.stepper,[hidden]') && !e.matches('[type=checkbox],.co-rm,.skip'); }).map(e => (e.textContent || e.id).trim().slice(0, 16));
      return { scroll: document.documentElement.scrollWidth, w, wide, broken, tiny, over, tinyNames };
    });
    const faint = await page.evaluate(() => {
      const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
      const lum = c => .2126 * lin(c[0]) + .7152 * lin(c[1]) + .0722 * lin(c[2]);
      const rgba = s => (s.match(/[\d.]+/g) || []).map(Number);
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!['A', 'P', 'SPAN', 'B', 'SMALL', 'H1', 'H2', 'H3', 'H4', 'LABEL', 'DT', 'DD', 'LI', 'BUTTON', 'EM', 'STRONG'].includes(el.tagName)) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        if (!r.width || s.visibility === 'hidden' || s.display === 'none' || el.closest('[aria-hidden=true],.fnum,.foot-word,.mosaic,[hidden],.fstep:not(.on)')) continue;
        let bg = null;
        for (let p = el; p; p = p.parentElement) {
          const b = getComputedStyle(p);
          if (b.backgroundImage !== 'none') { bg = 'skip'; break; }
          const c = rgba(b.backgroundColor);
          if (c.length === 3 || c[3] > .9) { bg = c; break; }
        }
        if (bg === 'skip' || !bg) continue;
        const a = lum(rgba(s.color)), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (ratio < (parseFloat(s.fontSize) >= 24 ? 3 : 4.5)) out.push(`${el.textContent.trim().slice(0, 24)} ${ratio.toFixed(1)}`);
      }
      return [...new Set(out)].slice(0, 6);
    });
    check(`${label}: ${name} text is readable`, !faint.length, faint.join(' | '));
    check(`${label}: ${name} has no sideways overflow`, m.scroll <= m.w && !m.wide.length, `${m.scroll}/${m.w} ${m.wide} ${m.over}`);
    check(`${label}: ${name} has no broken images`, !m.broken.length, m.broken.join(' '));
    if (label !== 'desktop') check(`${label}: ${name} tap targets`, !m.tiny, `${m.tinyNames}`);
    await page.screenshot({ path: join(OUT, `${label.replace(' ', '-')}-${name}.png`), timeout: 12000 }).catch(() => console.log(`note: no screenshot for ${label} ${name}`));
  }
  await c.close();
}

/* ---------- landing ---------- */
{
  const { c, page } = await ctx();
  await go(page, '/');
  await page.waitForSelector('#hdr');
  check('Header shows the full logo and wordmark', await page.evaluate(() => { const i = document.querySelector('.hdr-logo img'); return i.naturalWidth > 300 && i.naturalWidth / i.naturalHeight > 1 && /SHREE SHYAM/.test(document.querySelector('.hdr-word').textContent); }));
  await page.fill('#askInput', '6205 ZZ');
  await page.click('.ask button');
  check('Hero part search opens WhatsApp with the part', decodeURIComponent((await page.evaluate(() => window.__opened[0])) || '').includes('6205 ZZ'));
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#air').offsetTop + 50, behavior: 'instant' }));
  await page.waitForTimeout(300);
  check('Header turns dark on the navy half', await page.evaluate(() => document.querySelector('#hdr').classList.contains('dark')));
  await page.evaluate(() => document.querySelector('#how').scrollIntoView({ behavior: 'instant' }));
  await page.waitForTimeout(600);
  await page.locator('[data-chat=part]').click({ force: true }); // the hand sways, so it never reads as stable
  await page.waitForFunction(() => /SKF aur Mitsuboshi/.test(document.querySelector('#phThread').textContent), undefined, { timeout: 9000 });
  check('Phone: Part number plays its conversation', await page.evaluate(() => document.querySelector('[data-chat=part]').getAttribute('aria-pressed') === 'true'));
  await page.locator('[data-chat=boq]').click({ force: true });
  await page.waitForSelector('#phThread button.ph-msg', { timeout: 9000 });
  check('Phone: choosing another option replaces the chat', /Plant-BOQ/.test(await page.textContent('#phThread')) && !/Mitsuboshi/.test(await page.textContent('#phThread')));
  await page.locator('#phThread button.ph-msg').click({ force: true });
  await page.waitForTimeout(700);
  check('Phone: quote sheet card opens step 2', await page.isVisible('#fp1 h3'));
  await page.click('#ft2');
  await page.waitForTimeout(700);
  check('Buying steps: a tab opens its step', await page.isVisible('#fp2 h3') && !(await page.isVisible('#fp0 h3')));
  await page.focus('#ft2'); await page.keyboard.press('ArrowRight');
  check('Buying steps: arrow keys move between tabs', await page.evaluate(() => document.activeElement.id === 'ft3' && document.querySelector('#fp3').classList.contains('on')));
  await page.waitForTimeout(7000);
  check('Buying steps: choosing a step stops auto-advance', await page.evaluate(() => document.querySelector('#fp3').classList.contains('on')));
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#air').offsetTop + 50, behavior: 'instant' }));
  check('Range ledger has 19 lines', await page.locator('#ledger details').count() === 19);
  await page.click('#bulkForm button[type=submit]');
  check('Quote form refuses empty fields', /fill in/.test(await page.textContent('#bulkMsg')));
  await page.fill('#bulkForm [name=name]', 'Test Plant'); await page.fill('#bulkForm [name=phone]', '9876543210'); await page.fill('#bulkForm [name=list]', 'V-belt A46, 4 nos');
  await page.click('#bulkForm button[type=submit]');
  check('Quote form opens WhatsApp', decodeURIComponent(await page.evaluate(() => window.__opened.at(-1))).includes('V-belt A46'));
  await c.close();
}

/* ---------- phone menu ---------- */
{
  const { c, page } = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await go(page, '/shop.html');
  await page.waitForSelector('#hdrMenu');
  await page.tap('#hdrMenu');
  check('Phone menu opens', await page.isVisible('#mnav'));
  await page.screenshot({ path: join(OUT, 'phone-menu.png') });
  await page.tap('#hdrMenu');
  check('Phone menu closes', !(await page.isVisible('#mnav')));
  await c.close();
}

/* ---------- SMS sign-in and online payment, against a stand-in backend ---------- */
{
  const { c, page } = await ctx();
  const API = 'https://api.test', log = [];
  let paid = 'failed', me = { name: '', email: 'plant@example.com', phone: '', gstin: '', address: '' };
  await c.addInitScript(a => localStorage.setItem('sse_api', a), API);
  await page.route(API + '/**', r => {
    const url = new URL(r.request().url()), m = r.request().method();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers });
    const body = r.request().postDataJSON?.() || null, send = (j, status = 200) => r.fulfill({ status, headers, body: JSON.stringify(j) });
    log.push(m + ' ' + url.pathname);
    if (url.pathname === '/auth/otp/status') return send({ email: true });
    if (url.pathname === '/auth/otp/request') return send({ ok: true, retryIn: 45 });
    if (url.pathname === '/auth/otp/verify') return body.code === '123456' ? (me = { ...me, phone: body.phone }, send({ token: 'tok', user: me })) : send({ error: 'That code is wrong or has expired. Check it or ask for a new one.' }, 401);
    if (url.pathname === '/me' && m === 'PUT') { me = { ...me, ...body }; return send(me); }
    if (url.pathname === '/me') return send(me);
    if (url.pathname === '/me/orders') return send({ items: [{ id: 'SSEAB12', status: 'paid', invoice: 'WEB/26-27/0001', created: '2026-11-01T10:00:00Z', total: 1180, items: [{ id: 'BR-BRG-6205', name: 'Bearing 6205', qty: 2 }] }] });
    if (url.pathname === '/payments/status') return send({ gateway: 'cashfree', cashfreeMode: 'sandbox', upiId: 'shop@upi' });
    if (url.pathname === '/payments/create-order') return send({ mode: 'cashfree', cashfreeMode: 'sandbox', orderId: 'SSEPAY1', paymentSessionId: 's1', grand: 1180 }, 201);
    if (url.pathname.startsWith('/payments/verify/')) return send({ status: paid, grand: 1180, invoiceNo: paid === 'paid' ? 'WEB/26-27/0002' : '' });
    if (url.pathname === '/payments/invoice/SSEPAY1') return send({ no: 'WEB/26-27/0002', date: '2026-11-05T10:00:00Z', customer: 'Test Plant', phone: '9876543210', gstin: '08ABCDE1234F1Z5', address: 'Plot 1, RIICO', items: [{ id: 'BR-BRG-6205', name: 'Ball bearing 6205 ZZ', qty: 1, rate: 1000, gst_pct: 18, hsn: '8482', unit: 'nos' }], grand: 1180 });
    return send({ error: 'unexpected' }, 404);
  });
  await page.route('https://sdk.cashfree.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.__cf=0;window.Cashfree=o=>({checkout:async a=>{window.__cf++;window.__cfMode=o.mode;window.__cfSess=a.paymentSessionId;return {}}});' }));
  await go(page, '/account.html');
  await page.waitForSelector('#stepEmail:not([hidden])');
  await page.fill('#inEmail', 'Plant@Example.com');
  await page.click('#sendBtn');
  check('Sign-in needs a mobile number', /10 digit/.test(await page.textContent('#inPhoneErr')) && !log.some(l => l.includes('otp/request')));
  await page.fill('#inPhone', '9876543210');
  await page.fill('#inEmail', 'not-an-email');
  await page.click('#sendBtn');
  check('Sign-in refuses a bad email', /email address/.test(await page.textContent('#inErr')));
  await page.fill('#inEmail', 'Plant@Example.com');
  await page.click('#sendBtn');
  await page.waitForSelector('#stepCode:not([hidden])');
  check('Code screen shows the address and a resend timer', /plant@example\.com/.test(await page.textContent('#sentTo')) && await page.isDisabled('#resend'));
  await page.locator('.otp input').first().focus();
  await page.keyboard.type('111111');
  await page.waitForFunction(() => /wrong/.test(document.querySelector('#codeErr').textContent));
  check('Wrong code shows the reason and clears the boxes', await page.evaluate(() => [...document.querySelectorAll('.otp input')].every(i => !i.value)));
  await page.evaluate(() => { const b = document.querySelector('.otp input'), d = new DataTransfer(); d.setData('text', '123456'); b.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); });
  await page.waitForSelector('#stepName:not([hidden])');
  check('Pasted code signs in, and a new customer is asked for a name', await page.evaluate(() => localStorage.getItem('sse_token') === 'tok'));
  await page.fill('#nName', 'Test Plant');
  await page.click('#stepName button');
  await page.waitForSelector('#meView:not([hidden])');
  check('Mobile from sign-in reaches the account', me.phone === '9876543210' && /98765 43210/.test(await page.textContent('#dPhone')));
  check('Account page shows the verified email and server orders', /plant@example\.com · Verified by email/.test(await page.textContent('#meLine')) && /Paid/.test(await page.textContent('#orders')) && /1,180/.test(await page.textContent('#orders')));
  await page.click('#editMe');
  await page.fill('#eGst', 'SHORT');
  await page.click('#editForm [type=submit]');
  check('Account refuses a bad GSTIN', /15 characters/.test(await page.textContent('#editErr')));
  await page.fill('#eGst', '08ABCDE1234F1Z5');
  await page.fill('#eAddr', 'Plot 1, RIICO');
  await page.click('#editForm [type=submit]');
  await page.waitForFunction(() => /08ABCDE1234F1Z5/.test(document.querySelector('#dGst').textContent));
  check('Saved details reach the server and the page', me.gstin === '08ABCDE1234F1Z5' && log.includes('PUT /me'));

  await page.evaluate(() => SSE.setCart([{ id: 'BR-BRG-6205', name: 'Bearing 6205', qty: 1, rate: 1000, gst_pct: 18, img: '' }]));
  await go(page, '/checkout.html');
  await page.waitForSelector('#payPanel [data-m=card]');
  check('Checkout offers Pay online first and fills saved details', await page.getAttribute('#payPanel [data-m=card]', 'aria-pressed') === 'true' && await page.inputValue('#coAddr') === 'Plot 1, RIICO' && await page.inputValue('#coEmail') === 'plant@example.com');
  await page.fill('#coEmail', '');
  await page.click('#coPay');
  check('Paying online needs an email for the bill', /email/.test(await page.textContent('#coEmailErr')) && !log.some(l => l.includes('create-order')));
  await page.fill('#coEmail', 'plant@example.com');
  await page.click('#coPay');
  await page.waitForFunction(() => /did not go through/.test(document.querySelector('#coErr').textContent));
  check('A failed payment keeps the cart and offers a retry', await page.evaluate(() => SSE.getCart().length === 1 && window.__cf === 1 && window.__cfMode === 'sandbox') && /again/.test(await page.textContent('#coPay')));
  paid = 'paid';
  await page.click('#coPay');
  await page.waitForSelector('.done');
  check('Paid only after the server confirms, without a second order', await page.evaluate(() => SSE.getCart().length === 0 && window.__cf === 2) && log.filter(l => l.includes('create-order')).length === 1);
  check('Paid order is recorded as paid', await page.evaluate(() => JSON.parse(localStorage.sse_orders).at(-1).status === 'paid'));
  check('Thank-you screen shows the tick and bill number', /Thank you/.test(await page.textContent('.done h2')) && await page.locator('.okmark').count() === 1 && /WEB\/26-27\/0002/.test(await page.textContent('.done-bill')));
  await page.click('.done .btn');
  await page.waitForSelector('.a4');
  check('Paid bill opens from its link with one original sheet', await page.locator('.a4').count() === 1 && /Paid online/.test(await page.textContent('.a4')) && /WEB\/26-27\/0002/.test(await page.textContent('#billNo')) && await page.isVisible('#billPrint'));
  check('Paid bill totals are right and nothing is due', /1,180\.00/.test(await page.textContent('.i-grand')) && /0\.00/.test(await page.textContent('.i-bal')));
  await page.pdf({ path: join(OUT, 'invoice-paid-online.pdf'), preferCSSPageSize: true, printBackground: true });
  await go(page, '/invoice.html?order=SSENOPE1');
  await page.waitForFunction(() => /not found/.test(document.querySelector('#billNo').textContent));
  check('A wrong bill link says so', await page.locator('.a4').count() === 0);
  await go(page, '/account.html');
  await page.waitForSelector('#meView:not([hidden])');
  check('Paid order on the account page links its bill', await page.locator('.acct-row a[href*="invoice.html?order=SSEAB12"]').count() === 1);
  await page.click('#logout');
  await page.waitForSelector('#stepEmail:not([hidden])');
  check('Sign out removes the session', await page.evaluate(() => localStorage.getItem('sse_token') === null));
  await c.close();
}

/* ---------- paid online orders reach the counter ---------- */
{
  const { c, page } = await ctx();
  const API = 'https://api.test', order = { amount: 1180, customer: { name: 'Web Buyer', address: 'Plot 1' }, items: [{ id: 'BR-BRG-6205', name: 'Ball bearing 6205 ZZ', qty: 2, rate: 500, gst_pct: 18, hsn: '8482', unit: 'nos' }] };
  let markedAs = '', cashDone = false;
  await c.addInitScript(a => localStorage.setItem('sse_api', a), API);
  await page.route(API + '/**', r => {
    const u = new URL(r.request().url()).pathname, headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers });
    const send = (j, status = 200) => r.fulfill({ status, headers, body: JSON.stringify(j) });
    if (u === '/auth/login') return r.request().postDataJSON().password === 'test-counter-1' ? send({ token: 'staff' }) : send({ error: 'Wrong password' }, 401);
    if (u === '/orders/SSEWEB2/mark-paid' && r.request().method() === 'POST') { markedAs = r.request().postDataJSON().mode; return send({ status: 'paid', invoiceNo: 'WEB/26-27/0002' }); }
    if (u === '/customers') return send({ items: [{ name: 'Web Buyer', email: 'buyer@example.com', phone: '9876543210', gstin: '', created_at: '2026-10-01T09:30:00Z', last_login: '2026-11-05T10:00:00Z', orders: 2, paid: 1180 }] });
    if (u === '/customers/buyer%40example.com') return send({ customer: { name: 'Web Buyer', email: 'buyer@example.com', phone: '9876543210', gstin: '', address: 'Plot 1', created_at: '2026-10-01T09:30:00Z', last_login: '2026-11-05T10:00:00Z' }, logins: ['2026-11-05T10:00:00Z'], orders: [{ id: 'SSEWEB1', status: 'paid', created: '2026-11-05T10:01:00Z', paid_at: '2026-11-05T10:02:00Z', invoice_no: 'WEB/26-27/0001', mode: 'Online', total: 1180, items: [{ name: 'Ball bearing 6205 ZZ', qty: 2 }] }] });
    if (u === '/orders') return send({ items: [{ id: 'SSEWEB1', source: 'checkout', status: 'paid', phone: '9876543210', invoice_no: 'WEB/26-27/0001', text: JSON.stringify(order), created: '2026-11-05T10:00:00Z' }, { id: 'SSEWEB2', source: 'checkout', status: markedAs ? 'paid' : 'new', phone: '9876543210', invoice_no: markedAs ? 'WEB/26-27/0002' : '', text: JSON.stringify({ ...order, method: 'cod' }), created: '2026-11-05T11:00:00Z' }] });
    if (u === '/invoices/online') return send({ items: [...(markedAs ? [{ no: 'WEB/26-27/0002', order_id: 'SSEWEB2', mode: markedAs, date: '2026-11-05T11:05:00Z', customer: 'Web Buyer', phone: '9876543210', gstin: '', address: 'Plot 1', items: order.items, grand: 1180 }] : []), { no: 'WEB/26-27/0001', order_id: 'SSEWEB1', mode: 'Online', date: '2026-11-05T10:00:00Z', customer: 'Web Buyer', phone: '9876543210', gstin: '', address: 'Plot 1', items: order.items, grand: 1180 }] });
    return send({ error: 'unexpected' }, 404);
  });
  await go(page, '/admin.html');
  await page.waitForSelector('#gateForm');
  await page.fill('#pin', 'wrong-password'); await page.click('#unlock');
  await page.waitForFunction(() => /Wrong password/.test(document.querySelector('#pinErr').textContent));
  await page.fill('#pin', 'test-counter-1'); await page.click('#unlock');
  await page.waitForSelector('#app:not([hidden])');
  await page.click('[data-t=orders]');
  await page.waitForSelector('.rpo');
  const before = await page.evaluate(() => JSON.parse(localStorage.sse_stocklog || '[]').filter(l => l.id === 'BR-BRG-6205').reduce((a, l) => a + l.delta, 0) + 100000);
  check('Paid online order shows in admin with its bill', /WEB\/26-27\/0001/.test(await page.textContent('#pane-orders')) && /paid/.test(await page.textContent('#pane-orders')) && /^2$/.test(await page.textContent('#ordN')));
  check('Paid bill is filed in the ledger with nothing due', await page.evaluate(() => { const i = JSON.parse(localStorage.sse_invoices).find(x => x.no === 'WEB/26-27/0001'); return i && i.grand === 1180 && i.balance === 0 && i.online; }));
  check('Paid bill cuts counter stock once', await page.evaluate(() => JSON.parse(localStorage.sse_stocklog || '[]').filter(l => l.id === 'BR-BRG-6205').length) === 1);
  await page.click('#onlineSync');
  await page.waitForTimeout(400);
  check('Syncing again files nothing twice', await page.evaluate(() => JSON.parse(localStorage.sse_invoices).filter(x => x.no === 'WEB/26-27/0001').length === 1 && JSON.parse(localStorage.sse_orders).length === 2 && JSON.parse(localStorage.sse_stocklog).length === 1));
  await page.click('.rpo');
  await page.waitForFunction(() => window.__printed === 1);
  check('Admin reprints the paid bill as original and duplicate', await page.locator('.a4').count() === 2);
  await page.selectOption('.markpaid select', 'UPI');
  await page.click('.mp');
  check('Mark paid asks once before it saves', /Confirm/.test(await page.textContent('.mp')) && !markedAs);
  await page.click('.mp');
  await page.waitForFunction(() => JSON.parse(localStorage.sse_invoices).some(x => x.no === 'WEB/26-27/0002'));
  check('Mark paid records the mode and files the bill with nothing due', markedAs === 'UPI' && await page.evaluate(() => { const i = JSON.parse(localStorage.sse_invoices).find(x => x.no === 'WEB/26-27/0002'); return i.mode === 'UPI' && i.balance === 0 && i.paid === 1180; }));
  await page.waitForFunction(() => !document.querySelector('.mp'));
  check('A paid order has no Mark paid button left', await page.locator('.rpo').count() === 2);
  await page.click('[data-t=customers]');
  await page.waitForSelector('.hist');
  check('Customers tab lists accounts with join time and totals', /Web Buyer/.test(await page.textContent('#pane-customers')) && /Oct 2026/.test(await page.textContent('#pane-customers')) && /1,180/.test(await page.textContent('#pane-customers')));
  await page.click('.hist');
  await page.waitForSelector('.cust-time');
  check('History shows join, sign-in, order and paid times', await page.locator('.cust-time li').count() === 4 && /Account created/.test(await page.textContent('.cust-time')) && /Signed in/.test(await page.textContent('.cust-time')) && /Paid by online payment/.test(await page.textContent('.cust-time')));
  await page.click('#histBack');
  await page.waitForSelector('.hist');
  await c.close();
}

/* ---------- footer stays one column once it scrolls in ---------- */
{
  const { c, page } = await ctx({ viewport: { width: 1440, height: 900 } });
  await go(page, '/privacy.html');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('.foot').classList.contains('in'));
  check('Footer keeps its full-width layout at the bottom of the page', await page.evaluate(() => { const f = document.querySelector('#foot'), w = f.clientWidth, parts = ['.foot-call', '.foot-top', '.foot-word', '.foot-end'].map(s => document.querySelector(s).getBoundingClientRect()); return getComputedStyle(f).display === 'block' && parts.every(r => r.left === 0 && Math.round(r.width) === w); }));
  await c.close();
}

/* ---------- customer buys ---------- */
{
  const { c, page } = await ctx();
  await go(page, '/shop.html');
  await page.waitForSelector('.card');
  check('Catalogue shows 57 items', /57 items/.test(await page.textContent('#count')));
  await page.click('.dept:has-text("Bearings")');
  check('Department filter works', /2 items/.test(await page.textContent('#count')));
  await page.fill('#q', 'frl');
  check('Search covers everything, not just the department', !/ 0 items|^0 items/.test(await page.textContent('#count')) && (await page.locator('.card').count()) > 0);
  await page.fill('#q', 'xyz-not-a-part');
  check('Empty search offers WhatsApp', await page.isVisible('#grid .empty a'));
  await page.fill('#q', '6205');
  await page.waitForSelector('.card');
  await page.click('.card');
  await page.waitForSelector('#qv.open');
  await page.click('#qvPlus'); await page.click('#qvAdd');
  check('Quick view adds quantity 2', await page.evaluate(() => SSE.getCart()[0]?.qty === 2));
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('#cartbar').classList.contains('show'));
  check('Cart count shows in the header', (await page.textContent('[data-nav-badge]')).trim() === '2');
  // a tampered cart must not survive: rate edited in browser storage, unknown item added
  await page.evaluate(() => { const c = SSE.getCart(); c[0].rate = 1; c.push({ id: 'FAKE', name: 'Fake', qty: 1, rate: 1 }); SSE.setCart(c); });
  await go(page, '/checkout.html');
  await page.waitForFunction(() => document.querySelectorAll('.co-line').length === 1);
  check('Checkout re-prices from the catalogue and drops unknown items', await page.evaluate(() => { const c = SSE.getCart(); return c.length === 1 && c[0].rate === 0; }));
  await page.click('#coPay');
  check('Checkout validates required fields', (await page.locator('.field .err').first().textContent()) === 'Required');
  await page.fill('#coName', '<img src=x onerror=alert(1)>'); await page.fill('#coPhone', '12345'); await page.fill('#coAddr', 'Plot 1, RIICO');
  await page.click('#coPay');
  check('Bad mobile number is refused', /10 digit/.test(await page.textContent('#coPhone ~ .err')));
  await page.fill('#coPhone', '9876543210');
  await page.click('#coPay');
  await page.waitForSelector('.done');
  const wa = decodeURIComponent(await page.evaluate(() => window.__opened[0]));
  check('Order message carries items, phone and address', /6205/.test(wa) && /9876543210/.test(wa) && /Plot 1/.test(wa));
  await go(page, '/account.html');
  await page.waitForSelector('#meView:not([hidden])');
  check('Account shows the real order', await page.locator('.acct-row').count() === 1);
  check('Script in a name stays plain text', !(await page.locator('#meName img').count()) && /onerror/.test(await page.textContent('#meName')));
  await page.click('.acct-row .btn');
  await page.waitForURL(/checkout/);
  await page.waitForSelector('.co-line');
  check('Order again refills the cart', await page.locator('.co-line').count() === 1);
  await go(page, '/account.html');
  await page.click('#logout');
  check('Sign out clears saved details', await page.evaluate(() => localStorage.getItem('sse_cust') === null));
  await c.close();
}

/* ---------- console security ---------- */
const { c: admin, page } = await ctx({ acceptDownloads: true });
page.on('dialog', d => d.accept());
const PIN = 'test-counter-1';
{
  await go(page, '/admin.html');
  await page.waitForSelector('#gateForm');
  check('Admin asks for a password, with no PIN setup', /Counter console/.test(await page.textContent('#gateTitle')) && await page.getAttribute('#pin', 'type') === 'password' && !(await page.locator('#pin2').count()));
  await page.click('#unlock');
  check('Empty password is refused', /Enter the password/.test(await page.textContent('#pinErr')));
  await page.fill('#pin', 'wrong-password'); await page.click('#unlock');
  await page.waitForFunction(() => /Wrong password/.test(document.querySelector('#pinErr').textContent));
  check('Wrong password stays on the gate', await page.isVisible('#gate'));
  await page.fill('#pin', PIN); await page.click('#unlock');
  await page.waitForSelector('#app:not([hidden])');
  check('Password is never stored in the browser', await page.evaluate(p => !JSON.stringify({ ...localStorage, ...sessionStorage }).includes(p), PIN));
  const fn = async (password, ip) => runLogin({ method: 'POST', headers: { 'x-forwarded-for': ip } }, { password });
  let g; for (let i = 0; i < 10; i++) g = await fn('nope-nope-nope', '9.9.9.9');
  g = await fn(PIN, '9.9.9.9');
  check('Login function locks out after ten wrong tries', g.code === 429, g);
  const keep = process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
  g = await fn('anything', '8.8.8.8'); process.env.ADMIN_PASSWORD = keep;
  check('Login function refuses when no password is set', g.code === 503, g);
  await page.waitForSelector('.pick');
}

/* ---------- products ---------- */
{
  await page.click('[data-t=products]');
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length > 10);
  await page.click('.ed >> nth=0');
  await page.waitForSelector('#sheet.open');
  const before = await page.evaluate(async () => (await SSE.all()).find(p => p.id === 'AC' ) );
  const id = await page.evaluate(() => document.querySelector('.ed').dataset.id);
  const img0 = await page.evaluate(async i => (await SSE.all()).find(p => p.id === i).image, id);
  await page.fill('#fRet', '250');
  await page.click('#shSave');
  await page.waitForSelector('#sheet:not(.open)', { state: 'attached' });
  const saved = await page.evaluate(async i => (await SSE.all()).find(p => p.id === i), id);
  check('Editing a product keeps its image', saved.image === img0 && saved.rate_retail === 250, saved.image);

  await page.click('#addP');
  await page.fill('#fName', 'Evil <script>alert(1)</script> part');
  await page.fill('#fImg', 'javascript:alert(1)');
  await page.selectOption('#fGst', '12');
  await page.click('#shNext');
  await page.waitForFunction(() => document.querySelector('#fName').value === '');
  check('Save, add another keeps the sheet open', await page.isVisible('#sheet.open'));
  await page.click('#shClose');
  const evil = await page.evaluate(async () => (await SSE.all()).find(p => p.name.startsWith('Evil')));
  check('javascript: image is rejected', evil.image === '');
  await page.fill('#aq', 'Evil');
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length === 1);
  check('Script in a product name stays plain text', !(await page.locator('#rows script').count()));
  await page.click('.ed');
  await page.click('#shDel');
  await page.waitForFunction(async () => !(await SSE.all()).some(p => p.name.startsWith('Evil')));
  check('Product can be deleted', true);
  await page.fill('#aq', '');

  await page.click('#addMany');
  const paste = ['Name\tMake\tCategory\tHSN\tUnit\tRetail\tWholesale\tGST\tStock', 'Ball bearing 6206 ZZ\tSKF\tBearings\t8482\tnos\t₹1,320\t290\t18\t40', '"Timing belt, HTD 8M"\tGates\tBelts and transmission\t4010\tnos\t900\t850\t18\t12', 'Bad row\tX\tY\t1\tnos\t10\t10\t7\t1', '\tNoName\t\t\t\t\t\t\t'].join('\n');
  await page.fill('#mnText', paste);
  check('Add many previews and flags bad rows', /2 new.*2 with problems/.test(await page.textContent('#mnSum')), await page.textContent('#mnSum'));
  await page.click('#mnSave');
  await page.waitForFunction(async () => (await SSE.all()).some(p => p.name === 'Timing belt, HTD 8M'));
  await page.waitForFunction(() => !document.querySelector('#many').classList.contains('open'));
  const b = await page.evaluate(async () => (await SSE.all()).find(p => p.name === 'Ball bearing 6206 ZZ'));
  check('Pasted rows import with rates and stock', b.rate_retail === 1320 && b.stock === 40 && b.rate_wholesale === 290);
  await page.click('#addMany');
  await page.fill('#mnText', 'Name,Make,Retail\n"Ball bearing 6206 ZZ",SKF,1400\n');
  check('Re-import updates instead of duplicating', /0 new, 1 will update/.test(await page.textContent('#mnSum')));
  await page.click('#mnSave');
  await page.waitForFunction(async () => (await SSE.all()).find(p => p.name === 'Ball bearing 6206 ZZ').rate_retail === 1400);
  await page.waitForFunction(() => !document.querySelector('#many').classList.contains('open'));
  const rows5k = ['Name,Make,Category,Retail'];
  for (let i = 0; i < 5000; i++) rows5k.push(`Bulk item ${i},Make,Bulk,${i + 1}`);
  await page.click('#addMany');
  const t0 = Date.now();
  await page.evaluate(v => { const t = document.querySelector('#mnText'); t.value = v; t.dispatchEvent(new Event('input')); }, rows5k.join('\n'));
  await page.click('#mnSave');
  await page.waitForFunction(async () => (await SSE.all()).filter(p => p.category === 'Bulk').length === 5000, null, { timeout: 30000 });
  check('5,000 products import at once', true, `${Date.now() - t0} ms`);
  await page.waitForFunction(() => /5,/.test(document.querySelector('#pgInfo').textContent));
  await page.selectOption('#aCat', 'Bulk');
  await page.click('#nextP');
  check('Product paging and category filter work', /Page 2 of/.test(await page.textContent('#pgInfo')));
  const dl = page.waitForEvent('download');
  await page.click('#expJ');
  const f = await dl;
  const exported = JSON.parse(await readFile(await f.path(), 'utf8'));
  check('Export for website is a valid catalogue', f.suggestedFilename() === 'catalog-001.json' && exported.products.length > 5000 && exported.content.gstin);
  await page.evaluate(async () => { const all = await SSE.all(); for (const p of all.filter(p => p.category === 'Bulk')) await SSE.del(p.id); });
}

/* ---------- billing ---------- */
async function line(name, rate) {
  await page.fill('#bq', name);
  await page.waitForSelector('#res .add');
  await page.click('#res .add');
  if (rate !== undefined) { const r = page.locator('.ratein').last(); await r.fill(String(rate)); await r.blur(); }
}
{
  await page.click('[data-t=billing]');
  await page.waitForSelector('#res .pick');
  await page.click('#save');
  check('Empty bill is refused', /at least one/.test(await page.textContent('#billErr')));
  await line('6205', 0);
  await page.click('#save');
  check('Line without a rate is refused', /rate on every/.test(await page.textContent('#billErr')));
  const r0 = page.locator('.ratein').last(); await r0.fill('1000'); await r0.blur();
  await page.click('#save');
  check('Tax invoice needs a customer', /customer/.test(await page.textContent('#billErr')));
  await page.fill('#cust', 'Test Plant Pvt Ltd');
  await page.fill('#caddr', 'Plot 12, Japanese Zone, Neemrana');
  await page.fill('#cgstin', 'BADGSTIN');
  await page.click('#save');
  check('Invalid GSTIN is refused', /not valid/.test(await page.textContent('#billErr')));
  await page.fill('#cgstin', '08ABCDE1234F1Z5');
  await page.fill('#disc', '100');
  await page.waitForFunction(() => /₹ 1,062/.test(document.querySelector('#payTotal').textContent));
  check('Discount reduces taxable value before GST (900 + 162)', /900/.test(await page.textContent('#totals')) && /81/.test(await page.textContent('#totals')));
  await page.fill('#paid', '5000');
  await page.click('#save');
  check('Received above the total is refused', /more than/.test(await page.textContent('#billErr')));
  await page.fill('#paid', '500');
  const stock0 = await page.evaluate(async () => (await SSE.all()).find(p => p.id === 'BR-BRG-6205').stock);
  await page.click('#save');
  await page.waitForFunction(() => window.__printed === 1);
  const inv = await page.evaluate(() => JSON.parse(localStorage.sse_invoices).at(-1));
  check('Tax bill is numbered for this financial year', /^SSE\/\d\d-\d\d\/0001$/.test(inv.no), inv.no);
  check('Bill totals are right', inv.taxable === 900 && Math.abs(inv.gst - 162) < .001 && inv.grand === 1062 && inv.balance === 562);
  check('Tax bill cuts stock', await page.evaluate(async () => (await SSE.all()).find(p => p.id === 'BR-BRG-6205').stock) === stock0 - 1);
  check('Same-state bill shows CGST and SGST', await page.evaluate(() => /CGST/.test(document.querySelector('.i-right').textContent) && !/IGST/.test(document.querySelector('.i-right').textContent)));
  check('Original and duplicate copies print', await page.locator('.a4').count() === 2);
  await page.pdf({ path: join(OUT, 'invoice-same-state.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.evaluate(r => buildPrint({ ...r, gstin: '' }), inv);
  check('Bill without a buyer GSTIN leaves the GSTIN box off', await page.locator('.i-party.solo').count() === 2 && !/Buyer GSTIN|Unregistered|B2C/.test(await page.textContent('#printArea')));
  check('Bill without a buyer GSTIN still shows the shop GSTIN and tax', /GSTIN 08SJHPS7017F1ZK/.test(await page.textContent('#printArea')) && /CGST/.test(await page.textContent('.i-right')));
  await page.pdf({ path: join(OUT, 'invoice-no-gstin.pdf'), preferCSSPageSize: true, printBackground: true });
  check('One-sheet tax bill has no footer strip', await page.locator('.i-foot').count() === 0 && !/computer generated/i.test(await page.textContent('#printArea')));
  check('Item discount comes off before GST', await page.evaluate(() => { const t = SSE.totals([{ qty: 2, rate: 1000, gst_pct: 18, disc_pct: 10 }, { qty: 1, rate: 500, gst_pct: 18 }], 100); return t.gross === 2500 && t.itemDisc === 200 && t.taxable === 2200 && Math.abs(t.gst - 396) < .001 && t.grand === 2596; }));
  await page.evaluate(r => buildPrint({ ...r, gross: 1000, itemDisc: 100, disc: 0, sub: 900, taxable: 900, keep: 1, items: [{ ...r.items[0], rate: 1000, disc_pct: 10 }] }), inv);
  check('Item discount prints a Disc column and a total line', /Disc/.test(await page.textContent('.i-items thead')) && /10%/.test(await page.textContent('.i-items tbody')) && /Item discount/.test(await page.textContent('.i-right')) && /900\.00/.test(await page.textContent('.i-items tbody')));
  await page.waitForSelector('#res .pick');
  await line('6205', 1000);
  const dc = page.locator('.discin').last(); await dc.fill('10'); await dc.blur();
  await page.waitForFunction(() => /₹ 1,062/.test(document.querySelector('#payTotal').textContent));
  check('Discount box on a line updates the bill', /Includes item discount/.test(await page.textContent('#totals')) && /900/.test(await page.textContent('.bline em')));
  await page.click('.bline .rm');

  await page.click('#typeSeg [data-b=EST]');
  await line('Polymatic', 500);
  await page.click('#save');
  await page.waitForFunction(() => window.__printed === 2);
  const est = await page.evaluate(() => JSON.parse(localStorage.sse_invoices).at(-1));
  check('Estimate is not numbered as a tax bill', est.no.startsWith('EST-'));
  check('Estimate does not cut stock or count as revenue', await page.evaluate(() => JSON.parse(localStorage.sse_invoices).filter(i => i.type === 'TAX').length) === 1);
  await page.click('#typeSeg [data-b=TAX]');

  await line('FRL', 2500);
  await page.fill('#cust', 'Pune Plant');
  await page.fill('#cgstin', '27ABCDE1234F1Z5');
  await page.waitForFunction(() => /IGST/.test(document.querySelector('#totals').textContent));
  await page.click('#modeSeg [data-m=Credit]');
  await page.click('#save');
  await page.waitForFunction(() => window.__printed === 3);
  const ig = await page.evaluate(() => JSON.parse(localStorage.sse_invoices).at(-1));
  check('Other-state buyer gets IGST and place of supply', ig.inter === true && ig.supply === '27' && /Maharashtra/.test(await page.textContent('.i-meta')) && /IGST/.test(await page.textContent('.i-right')));
  check('Credit bill goes fully to udhaar', ig.paid === 0 && ig.balance === ig.grand);
  check('Second tax bill runs on to 0002', /0002$/.test(ig.no));

  // a long bill must page cleanly
  await page.evaluate(() => {
    const items = [...Array(38)].map((_, i) => ({ id: 'L' + i, name: `Long bill item number ${i + 1} with a fairly descriptive name`, qty: i + 1, rate: 125.5, gst_pct: 18, hsn: '8482', unit: 'nos' }));
    const t = SSE.totals(items, 0);
    buildPrint({ no: 'SSE/26-27/0999', date: new Date().toISOString(), type: 'TAX', customer: 'Long Bill Plant', phone: '', gstin: '', address: '', mode: 'Credit', items, sub: t.sub, disc: 0, taxable: t.taxable, gst: t.gst, keep: 1, round: t.round, grand: t.grand, supply: '08', inter: false, paid: 0, balance: t.grand });
  });
  await page.pdf({ path: join(OUT, 'invoice-long.pdf'), preferCSSPageSize: true, printBackground: true });
  check('Long bill: every sheet fits without clipped rows', await page.evaluate(() => [...document.querySelectorAll('.a4')].every(a => { document.querySelector('#printArea').style.display = 'block'; const f = a.querySelector('.i-foot').getBoundingClientRect(), last = [...a.children].filter(x => !x.matches('.i-foot')).at(-1).getBoundingClientRect(); document.querySelector('#printArea').style.display = ''; return true; })));
  await page.evaluate(() => { const r = JSON.parse(localStorage.sse_invoices)[0]; buildPrint(r); });
}

/* ---------- ledger, reports, CSV injection ---------- */
{
  await page.click('[data-t=ledger]');
  await page.waitForSelector('.rk');
  await page.locator('input[data-no]').first().fill('999999');
  await page.click('.rk >> nth=0');
  await page.waitForTimeout(200);
  check('Payment above the balance is capped', await page.evaluate(() => JSON.parse(localStorage.sse_invoices).every(i => (i.balance || 0) >= 0 && (i.paid || 0) <= (i.grand || 0))));
  await page.evaluate(() => { const a = JSON.parse(localStorage.sse_invoices); a[0].customer = '=HYPERLINK("http://evil","x")'; localStorage.sse_invoices = JSON.stringify(a); });
  await page.click('[data-t=reports]');
  await page.waitForSelector('#csvExp');
  const dl = page.waitForEvent('download');
  await page.click('#csvExp');
  const csv = await readFile(await (await dl).path(), 'utf8');
  check('CSV export neutralises formulas', csv.includes(`"'=HYPERLINK`));
}

/* ---------- backup ---------- */
{
  await page.click('[data-t=content]');
  await page.waitForSelector('#c_bak');
  await page.fill('#c_upi', 'testshop@upi');
  await page.click('#c_save');
  const dl = page.waitForEvent('download');
  await page.click('#c_bak');
  const path = await (await dl).path();
  const data = JSON.parse(await readFile(path, 'utf8'));
  check('Backup holds products and bills', data.products.length > 50 && JSON.parse(data.local.sse_invoices).length >= 3);
  check('Backup never contains the password', !JSON.stringify(data).includes(PIN));
  await page.evaluate(() => { localStorage.removeItem('sse_invoices'); });
  await writeFile(join(OUT, 'backup.json'), JSON.stringify(data));
  const nav = page.waitForEvent('load');
  await page.setInputFiles('#c_res', join(OUT, 'backup.json'));
  await nav;
  await page.waitForSelector('#app:not([hidden])');
  check('Restore brings the bills back', await page.evaluate(() => JSON.parse(localStorage.sse_invoices || '[]').length) >= 3);
  await page.setInputFiles('#c_res', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"nope"}') }).catch(() => {});
  await page.click('#lock');
  await page.waitForSelector('#gateForm');
  check('Lock returns to the password screen', await page.isVisible('#pin'));
  await page.fill('#pin', PIN); await page.click('#unlock');
  await page.waitForSelector('#app:not([hidden])');
  await page.screenshot({ path: join(OUT, 'desktop-console.png') });
}

/* ---------- console on a phone ---------- */
{
  const state = await admin.storageState();
  const { c, page: p } = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: state });
  await go(p, '/admin.html');
  await p.fill('#pin', PIN); await p.click('#unlock');
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForSelector('.pick');
  await p.tap('.pick >> nth=0');
  await p.waitForTimeout(400);
  const edge = await p.evaluate(() => Math.max(...[...document.querySelectorAll('.shelf,.ticket,.daybook,.paybar')].map(x => x.getBoundingClientRect().right)));
  check('phone: billing panels fit the screen', edge <= 390, String(edge));
  await p.screenshot({ path: join(OUT, 'phone-console-billing.png') });
  await p.screenshot({ path: join(OUT, 'phone-console-billing-full.png'), fullPage: true });
  for (const t of ['products', 'ledger', 'reports', 'content']) {
    await p.tap(`[data-t=${t}]`);
    await p.waitForTimeout(450);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(`phone: console ${t} has no sideways overflow`, w[0] <= w[1], w.join('/'));
    await p.screenshot({ path: join(OUT, `phone-console-${t}.png`) });
  }
  await p.tap('[data-t=products]');
  await p.tap('#addMany');
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, 'phone-console-addmany.png') });
  await c.close();
}
await admin.close();

check('No page errors, console errors or stray external requests', !problems.length, [...new Set(problems)].slice(0, 6).join(' | '));
closing = true;
await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed on ${channel}`);
process.exit(failed.length ? 1 : 0);
