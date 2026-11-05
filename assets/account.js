/* Sign-in is by emailed code once the backend is connected, and the address in the
   session is then proven. Without a backend the details stay on this device and this
   page does not pretend to verify anyone. */
const $ = SSE.$;
const api = SSE.api();
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const cust = () => read('sse_cust', null);
const setCust = c => localStorage.setItem('sse_cust', JSON.stringify(c));
const token = () => localStorage.getItem('sse_token') || '';
const pretty = p => '+91 ' + p.slice(0, 5) + ' ' + p.slice(5);
const STEPS = ['stepEmail', 'stepCode', 'stepName', 'detailsForm'];
const validMobile = p => !p || /^[6-9]\d{9}$/.test(p);
let mailOn = false, email = '', timer = 0, serverOrders = [];

async function call(path, opts = {}) {
  const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: 'Bearer ' + token() } : {}) };
  const r = await fetch(api + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Could not reach the shop. Check your connection.'), { status: r.status });
  return j;
}
function step(id) {
  STEPS.forEach(s => { $('#' + s).hidden = s !== id; });
  const f = $('#' + id).querySelector('input');
  if (f && innerWidth > 820) f.focus();
}

/* The code boxes accept typing, paste and the browser's own one-time-code autofill. */
const boxes = () => [...document.querySelectorAll('.otp input')];
const codeNow = () => boxes().map(b => b.value).join('');
function fill(from, text) {
  const list = boxes(), digits = text.replace(/\D/g, '').slice(0, list.length - from).split('');
  digits.forEach((d, i) => { list[from + i].value = d; });
  list[Math.min(from + digits.length, list.length - 1)].focus();
  if (codeNow().length === list.length) $('#stepCode').requestSubmit();
}
boxes().forEach((b, i, all) => {
  b.addEventListener('input', () => { const v = b.value; b.value = ''; if (v) fill(i, v); });
  b.addEventListener('paste', e => { e.preventDefault(); fill(0, e.clipboardData.getData('text')); });
  b.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !b.value && i) { all[i - 1].value = ''; all[i - 1].focus(); e.preventDefault(); }
  });
});
function countdown(s) {
  clearInterval(timer);
  const btn = $('#resend');
  const tick = () => {
    btn.disabled = s > 0;
    btn.textContent = s > 0 ? `Send again in ${s}s` : 'Send the code again';
    if (s-- <= 0) clearInterval(timer);
  };
  tick();
  timer = setInterval(tick, 1000);
}
async function sendCode() {
  const j = await call('/auth/otp/request', { body: { email } });
  $('#sentTo').textContent = email;
  boxes().forEach(b => { b.value = ''; });
  $('#codeErr').textContent = '';
  step('stepCode');
  countdown(j.retryIn || 45);
}
$('#stepEmail').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#inEmail').value.trim().toLowerCase(), btn = $('#sendBtn');
  $('#inErr').textContent = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter your email address';
  if ($('#inErr').textContent) return;
  email = v;
  btn.disabled = true;
  try { await sendCode(); } catch (x) { $('#inErr').textContent = x.message; }
  btn.disabled = false;
});
$('#resend').onclick = async () => {
  try { await sendCode(); SSE.toast('A new code is on its way'); } catch (x) { $('#codeErr').textContent = x.message; }
};
$('#changeNo').onclick = () => { clearInterval(timer); step('stepEmail'); };
$('#stepCode').addEventListener('submit', async e => {
  e.preventDefault();
  const code = codeNow(), btn = $('#codeBtn');
  if (code.length < 6) { $('#codeErr').textContent = 'Enter all 6 digits'; return; }
  btn.disabled = true;
  try {
    const j = await call('/auth/otp/verify', { body: { email, code } });
    localStorage.setItem('sse_token', j.token);
    clearInterval(timer);
    const was = cust();
    setCust({ name: j.user.name || was?.name || '', email: j.user.email, phone: j.user.phone || was?.phone || '', gst: j.user.gstin || was?.gst || '', address: j.user.address || was?.address || '' });
    if (j.user.name) await show();
    else { $('#nName').value = cust().name; $('#nPhone').value = cust().phone; $('#nGst').value = cust().gst; step('stepName'); }
  } catch (x) {
    $('#codeErr').textContent = x.message;
    boxes().forEach(b => { b.value = ''; });
    boxes()[0].focus();
  }
  btn.disabled = false;
});
const validGst = g => !g || /^[0-9A-Z]{15}$/.test(g);
async function saveProfile(c) {
  if (token()) {
    const u = await call('/me', { method: 'PUT', body: { name: c.name, phone: c.phone, gstin: c.gst, address: c.address } });
    c = { name: u.name, email: u.email, phone: u.phone, gst: u.gstin, address: u.address };
  }
  setCust(c);
}
$('#stepName').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#nName').value.trim(), gst = $('#nGst').value.trim().toUpperCase(), phone = $('#nPhone').value.trim();
  $('#nErr').textContent = name.length < 2 ? 'Enter a name for your bills' : !validMobile(phone) ? 'Enter a 10 digit mobile number' : validGst(gst) ? '' : 'A GSTIN has 15 characters';
  if ($('#nErr').textContent) return;
  try { await saveProfile({ ...cust(), name, phone, gst }); await show(); } catch (x) { $('#nErr').textContent = x.message; }
});
$('#detailsForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#aname').value.trim(), ph = $('#aphone').value.trim(), good = /^[6-9]\d{9}$/.test(ph);
  $('#nameErr').textContent = name ? '' : 'Enter a name';
  $('#phoneErr').textContent = good ? '' : 'Enter a 10 digit mobile number';
  if (!name || !good) return;
  setCust({ name, phone: ph, gst: $('#agst').value.trim().toUpperCase(), address: $('#aaddr').value.trim() });
  SSE.toast('Details saved on this device');
  show();
});

/* Signed in */
const STATUS = { paid: ['Paid', 'ok'], packed: ['Packed', 'ok'], dispatched: ['Dispatched', 'ok'], done: ['Delivered', 'ok'] };
function orders(c) {
  const local = read('sse_orders', []).filter(o => !o.phone || o.phone === c.phone || (c.email && o.email === c.email)).reverse();
  const seen = new Set(serverOrders.map(o => o.id));
  return [...serverOrders, ...local.filter(o => !seen.has(o.id))]
    .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
}
function drawOrders(list) {
  const box = $('#orders'), when = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const open = list.filter(o => !o.total).length;
  $('#meStats').innerHTML = [['Orders', list.length], ['Waiting for rates', open], ['Last order', list[0]?.created ? when(list[0].created) : 'None yet']]
    .map(s => `<div><b>${SSE.esc(String(s[1]))}</b><span>${s[0]}</span></div>`).join('');
  if (!list.length) {
    box.innerHTML = '<div class="me-empty"><b>No orders yet</b><p>Add parts from the catalogue. Orders you place show up here, ready to repeat.</p><a class="btn" href="shop.html">Open the catalogue</a></div>';
    return;
  }
  box.innerHTML = list.map((o, i) => {
    const s = STATUS[o.status] || (o.total ? ['Received', ''] : ['Rates to confirm', 'wait']);
    const items = o.items || [], thumbs = items.filter(t => t.img).slice(0, 3);
    const text = items.length ? items.map(t => `${t.name} × ${t.qty}`).join(', ') : (o.text || '');
    return `<article class="acct-row">
      ${thumbs.length ? `<div class="me-thumbs">${thumbs.map(t => `<img src="${SSE.safeImg(t.img)}" alt="" loading="lazy">`).join('')}</div>` : ''}
      <div class="me-order"><div><b>${SSE.esc(o.id)}</b><span class="me-pill ${s[1]}">${s[0]}</span></div>
        <small>${o.created ? when(o.created) + ' · ' : ''}${SSE.esc(text.slice(0, 140))}</small></div>
      <div class="me-right"><b>${o.total ? SSE.fmt(o.total) : ''}</b>${o.invoice ? `<a class="btn sm" href="invoice.html?order=${encodeURIComponent(o.id)}">View bill</a>` : ''}${items.length ? `<button class="btn line sm" data-i="${i}">Order again</button>` : ''}</div>
    </article>`;
  }).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    const cart = SSE.getCart();
    list[+b.dataset.i].items.forEach(it => { const ex = cart.find(c => c.id === it.id); if (ex) ex.qty += it.qty; else cart.push({ ...it }); });
    SSE.setCart(cart);
    location.href = 'checkout.html';
  });
}
function drawMe(c) {
  $('#meName').textContent = c.name;
  $('#meLine').textContent = token() ? `${c.email} · Verified by email` : `${pretty(c.phone)} · Saved on this device`;
  $('#dName').textContent = c.name;
  $('#dPhone').textContent = c.phone ? pretty(c.phone) : 'Not added';
  $('#dGst').textContent = c.gst || 'Not added';
  $('#dAddr').textContent = c.address || 'Not added';
  $('#ledgerWa').href = SSE.wa('Namaste, mujhe account statement chahiye. ' + (c.phone ? 'Mobile: ' + c.phone : 'Email: ' + c.email));
}
async function show() {
  let c = cust();
  if (token()) {
    try {
      const [u, o] = await Promise.all([call('/me'), call('/me/orders')]);
      c = { name: u.name, email: u.email, phone: u.phone, gst: u.gstin, address: u.address };
      setCust(c);
      serverOrders = o.items;
    } catch (x) {
      if (x.status === 401) localStorage.removeItem('sse_token');
    }
  }
  const has = !!(c && c.name && (c.phone || c.email)) && (!mailOn || !!token());
  $('#authView').hidden = has;
  $('#meView').hidden = !has;
  if (!has) { step(mailOn ? 'stepEmail' : 'detailsForm'); art(); return; }
  drawMe(c);
  drawOrders(orders(c));
}
$('#editMe').onclick = () => {
  const c = cust();
  $('#eName').value = c.name; $('#ePhone').value = c.phone || ''; $('#eGst').value = c.gst || ''; $('#eAddr').value = c.address || '';
  $('#editErr').textContent = '';
  $('#meDetails').hidden = true; $('#editForm').hidden = false;
  $('#eName').focus();
};
$('#editCancel').onclick = () => { $('#meDetails').hidden = false; $('#editForm').hidden = true; };
$('#editForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#eName').value.trim(), gst = $('#eGst').value.trim().toUpperCase(), phone = $('#ePhone').value.trim();
  $('#editErr').textContent = name.length < 2 ? 'Enter a name' : !validMobile(phone) ? 'Enter a 10 digit mobile number' : validGst(gst) ? '' : 'A GSTIN has 15 characters';
  if ($('#editErr').textContent) return;
  try {
    await saveProfile({ ...cust(), name, phone, gst, address: $('#eAddr').value.trim() });
    $('#editCancel').click();
    drawMe(cust());
    SSE.toast('Details saved');
  } catch (x) { $('#editErr').textContent = x.message; }
});
$('#logout').onclick = () => {
  localStorage.removeItem('sse_cust'); localStorage.removeItem('sse_token');
  serverOrders = [];
  SSE.toast('Signed out');
  show();
};

/* The bearing on the sign-in panel. Desktop only, and the page is complete without it. */
function art() {
  const box = $('#inBearing');
  if (art.done || innerWidth < 900 || !document.createElement('canvas').getContext('webgl2')) return;
  art.done = true;
  import('./bearing.js').then(({ start }) => start({
    canvas: box.querySelector('canvas'), box,
    onStops: () => [{ at: 0, x: 0, y: .02, s: 1.08, rx: .14, ry: -.56, rz: 0, ex: .34, a: 1, fl: 1 }],
  })).catch(() => box.remove());
}
(async function init() {
  if (api) { try { mailOn = (await call('/auth/otp/status')).email; } catch {} }
  await show();
})();
