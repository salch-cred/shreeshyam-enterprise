/* Counter console: one password, billing and admin on the same page.
   Everything here runs on the shop computer. The site is static, so products,
   bills and the ledger live in this browser. Settings has backup and restore. */
const $ = SSE.$, esc = SSE.esc, fmt = SSE.fmt, toast = m => SSE.toast(m);
const read = (k, d = []) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
// Writes throw when storage is full. Callers must see that, never swallow it.
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const invoices = () => read('sse_invoices');
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/* The admin password lives in Vercel and is checked on the server, never stored here.
   A connected backend checks it too and returns the token for online orders. */
try { localStorage.removeItem('sse_pin'); localStorage.removeItem('sse_pin_fail'); } catch {}
function refuse(msg) {
  $('#pinErr').textContent = msg;
  const g = $('#gateBox'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake');
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const password = $('#pin').value, url = SSE.api() ? SSE.api() + '/auth/login' : '/api/admin-login';
  if (!password) return refuse('Enter the password.');
  $('#unlock').disabled = true;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return refuse(j.error || 'Could not check the password. Try again.');
    if (j.token) sessionStorage.setItem('sse_staff', j.token);
    $('#pin').value = '';
    sessionStorage.setItem('sse_admin', '1');
    openConsole();
  } catch { refuse('Could not reach the server. Check your connection.'); } finally { $('#unlock').disabled = false; }
});
function lockConsole() { sessionStorage.removeItem('sse_admin'); sessionStorage.removeItem('sse_staff'); location.href = 'admin.html'; }
$('#lock').onclick = lockConsole;
let idle;
const bump = () => { clearTimeout(idle); idle = setTimeout(lockConsole, 15 * 60 * 1000); };

/* Tabs */
const TITLES = {
  billing: ['Billing', 'Every tax bill cuts stock and updates the day book.'],
  products: ['Products', ''], stock: ['Stock', 'Reorders and recent moves.'],
  orders: ['Orders', 'Website orders and orders saved on this computer.'], ledger: ['Ledger', 'Udhaar outstanding and money received.'],
  reports: ['Reports', 'Billing over the last two weeks.'], customers: ['Customers', 'Everyone with an account, with their history.'], content: ['Settings', 'Shop details and backups.'],
};
const tabs = [...document.querySelectorAll('#tabs button')];
function ink() {
  const a = document.querySelector('#tabs [aria-selected="true"]'), i = $('#ink');
  if (!a?.offsetWidth) return;
  i.style.width = a.offsetWidth + 'px'; i.style.transform = `translateX(${a.offsetLeft}px)`;
}
function show(t) {
  const k = t.dataset.t;
  tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
  Object.keys(TITLES).forEach(n => { $('#pane-' + n).hidden = n !== k; });
  $('#paneTitle').textContent = TITLES[k][0];
  $('#paneSub').textContent = TITLES[k][1];
  $('#prodTools').hidden = k !== 'products';
  $('#stats').hidden = k === 'billing' || k === 'content';
  $('#main').classList.toggle('flat', k === 'billing' || k === 'content');
  history.replaceState(null, '', '#' + k);
  ink();
  t.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  if (k === 'products') reload();
  if (k === 'stock') drawStock();
  if (k === 'orders') drawOrders();
  if (k === 'customers') drawCustomers();
  if (k === 'content') drawContent();
  if (k === 'ledger') drawLedger();
  if (k === 'reports') drawReports();
  if (k === 'billing') Billing.refresh();
}
tabs.forEach(b => { b.onclick = () => show(b); });
addEventListener('resize', () => requestAnimationFrame(ink));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheets();
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    const i = $('#pane-billing').hidden ? $('#aq') : $('#bq');
    if (!i.closest('[hidden]')) { e.preventDefault(); i.focus(); }
  }
});
function tick() { $('#clock').textContent = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · FY ' + SSE.fy(); }

async function openConsole() {
  localStorage.setItem('sse_counter', '1');
  $('#gate').hidden = true; $('#app').hidden = false; $('#stage')?.remove();
  document.body.dataset.stage = '';
  tick(); setInterval(tick, 30000);
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, bump, { passive: true }));
  bump();
  await init();
  await Billing.start();
  show(tabs.find(t => '#' + t.dataset.t === location.hash) || tabs[0]);
  (document.fonts?.ready || Promise.resolve()).then(ink);
}

/* Products */
let ALL = [], pg = 1, editing = null, photo = '';
async function reload() {
  ALL = await SSE.all();
  const cats = [...new Set(ALL.map(p => p.category))].sort();
  $('#catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  const sel = $('#aCat'), keep = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  sel.value = keep;
  TITLES.products[1] = `${ALL.length.toLocaleString('en-IN')} products on this computer.`;
  if (!$('#pane-products').hidden) $('#paneSub').textContent = TITLES.products[1];
  draw(); stats();
  syncOnline().catch(() => {});
  setInterval(() => syncOnline().catch(() => {}), 60000);
}
async function init() {
  ALL = await SSE.seed();
  await reload();
  $('#ordN').textContent = waiting();
  $('#aq').oninput = () => { pg = 1; draw(); };
  $('#aCat').onchange = () => { pg = 1; draw(); };
  $('#prevP').onclick = () => { pg = Math.max(1, pg - 1); draw(); };
  $('#nextP').onclick = () => { pg++; draw(); };
  $('#addP').onclick = () => sheet();
  $('#addMany').onclick = openMany;
  $('#expJ').onclick = async () => {
    download('catalog-001.json', JSON.stringify({ content: SSE.content(), products: await SSE.all() }, null, 1), 'application/json');
    toast('Saved. Replace data/catalog-001.json with it and redeploy');
  };
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const pill = (stock, min) => stock <= (min || 5) ? '<span class="pill bad">Low</span>' : stock <= (min || 5) * 3 ? '<span class="pill warn">Watch</span>' : '<span class="pill ok">Fine</span>';
function filteredProducts() {
  const q = $('#aq').value.trim().toLowerCase(), cat = $('#aCat').value;
  return ALL.filter(p => (!cat || p.category === cat) && (!q || `${p.name} ${p.brand} ${p.id}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function draw() {
  const f = filteredProducts(), last = Math.max(1, Math.ceil(f.length / SSE.PAGE));
  pg = Math.min(pg, last);
  const items = SSE.page(f, pg), tb = $('#rows');
  $('#pgInfo').textContent = `Page ${pg} of ${last} · ${f.length.toLocaleString('en-IN')} products`;
  $('#prevP').disabled = pg <= 1; $('#nextP').disabled = pg >= last;
  if (!items.length) { tb.innerHTML = '<tr><td colspan="6"><div class="empty"><b>Nothing matches</b><p>Try another word, or add it as a new product.</p></div></td></tr>'; return; }
  tb.innerHTML = items.map(p => `<tr>
    <td><b>${esc(p.name)}</b><small>${esc(p.id)} · ${esc(p.brand)} · GST ${Number(p.gst_pct) || 0}%</small></td>
    <td class="hide-sm">${esc(p.category)}</td><td>${p.rate_retail ? fmt(p.rate_retail) : '<span class="pill">Quote</span>'}</td><td class="hide-sm">${p.rate_wholesale ? fmt(p.rate_wholesale) : '—'}</td>
    <td style="white-space:nowrap">${Number(p.stock) || 0} ${pill(p.stock, p.min_stock)}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn line sm ed" data-id="${esc(p.id)}">Edit</button>
    <button class="btn line sm st" data-id="${esc(p.id)}">+ Stock</button></td></tr>`).join('');
  tb.querySelectorAll('.ed').forEach(b => { b.onclick = () => sheet(ALL.find(x => x.id === b.dataset.id)); });
  tb.querySelectorAll('.st').forEach(b => {
    b.onclick = () => {
      const cell = b.parentElement;
      cell.innerHTML = `<span class="paybox"><input type="number" value="10" aria-label="Quantity to add"><button class="btn sm ok">Apply</button></span>`;
      const inp = cell.querySelector('input');
      inp.focus(); inp.select();
      cell.querySelector('.ok').onclick = async () => {
        const q = Math.trunc(Number(inp.value));
        if (!q) { draw(); return; }
        const p = ALL.find(x => x.id === b.dataset.id);
        p.stock = (Number(p.stock) || 0) + q;
        await SSE.put(p);
        SSE.logStock(p.id, q, 'admin');
        draw(); stats();
        toast(`${q > 0 ? '+' : ''}${q} · ${p.name}`);
      };
    };
  });
}
function stats() {
  const fy = SSE.fy(), inv = invoices().filter(i => i.type === 'TAX');
  const yr = inv.filter(i => (i.no || '').includes(`/${fy}/`));
  count($('#stRev'), yr.reduce((a, i) => a + (i.grand || 0), 0), true);
  count($('#stBills'), yr.length);
  count($('#stDue'), inv.reduce((a, i) => a + (i.balance || 0), 0), true);
  count($('#stLow'), ALL.filter(p => (Number(p.stock) || 0) <= (p.min_stock ?? 5)).length);
}
function count(el, to, money) {
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 700), v = Math.round(to * (1 - (1 - k) ** 3));
    el.textContent = (money ? '₹ ' : '') + v.toLocaleString('en-IN');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Product sheet */
function closeSheets() { ['#scrim', '#sheet', '#many'].forEach(s => $(s).classList.remove('open')); }
function sheet(p) {
  editing = p || null; photo = p?.image || '';
  $('#shTitle').textContent = p ? 'Edit product' : 'New product';
  $('#shDel').hidden = !p; $('#shNext').hidden = !!p;
  const g = id => $('#' + id);
  g('fName').value = p?.name || ''; g('fBrand').value = p?.brand || ''; g('fCat').value = p?.category || '';
  g('fUnit').value = p?.unit || 'nos'; g('fHsn').value = p?.hsn || ''; g('fRet').value = p?.rate_retail ?? 0;
  g('fWho').value = p?.rate_wholesale ?? 0; g('fGst').value = String(p?.gst_pct ?? 18);
  g('fStock').value = p?.stock ?? 0; g('fMin').value = p?.min_stock ?? 5;
  g('fImg').value = /^data:/.test(photo) ? '' : photo;
  updPrev();
  $('#scrim').classList.add('open'); $('#sheet').classList.add('open');
  g('fName').focus();
}
function updPrev() { $('#fPrev').src = SSE.safeImg($('#fImg').value.trim() || photo); }
$('#fImg').addEventListener('input', () => { photo = ''; updPrev(); });
// Photos are scaled down in the browser so a phone picture does not bloat the catalogue file.
$('#fFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Use a PNG, JPG or WebP photo'); return; }
  try {
    const bmp = await createImageBitmap(f), k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    photo = c.toDataURL('image/webp', .82);
    $('#fImg').value = ''; updPrev();
  } catch { toast('Could not read that photo'); }
};
$('#shClose').onclick = closeSheets;
$('#scrim').onclick = closeSheets;
function cleanImage(u) {
  u = (u || '').trim();
  if (!u) return '';
  return SSE.safeImg(u) === 'assets/img/plc-tools.svg' ? '' : u;
}
function formProduct() {
  const g = id => $('#' + id).value.trim();
  return {
    ...(editing || {}),
    id: editing?.id || 'P-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
    name: g('fName'), brand: g('fBrand') || '-', category: g('fCat') || 'General', unit: $('#fUnit').value, hsn: g('fHsn'),
    image: cleanImage(g('fImg') || photo),
    rate_retail: Math.max(0, Number(g('fRet')) || 0), rate_wholesale: Math.max(0, Number(g('fWho')) || 0),
    gst_pct: Number($('#fGst').value), stock: Math.trunc(Number(g('fStock'))) || 0, min_stock: Math.max(0, Math.trunc(Number(g('fMin'))) || 0),
  };
}
async function saveSheet(next) {
  const p = formProduct();
  if (p.name.length < 2) { toast('Enter the product name'); $('#fName').focus(); return; }
  await SSE.put(p);
  await reload();
  toast('Saved ' + p.name);
  if (next) { const { category, brand, unit, hsn, gst_pct } = p; sheet(); Object.assign($('#fCat'), { value: category }); $('#fBrand').value = brand === '-' ? '' : brand; $('#fUnit').value = unit; $('#fHsn').value = hsn; $('#fGst').value = String(gst_pct); }
  else closeSheets();
}
$('#shSave').onclick = () => saveSheet(false);
$('#shNext').onclick = () => saveSheet(true);
$('#shDel').onclick = async () => {
  if (!editing || !confirm(`Delete ${editing.name}? Bills already saved are not changed.`)) return;
  await SSE.del(editing.id);
  closeSheets(); await reload();
  toast('Product deleted');
};

/* Add many */
const COLS = { id: /^(id|part ?id|sku|code)$/, name: /^(name|product|item|description)/, brand: /^(make|brand)/, category: /^(category|type|group)/, hsn: /^hsn/, unit: /^(unit|uom)/, rate_retail: /^(retail|rate|price|mrp)/, rate_wholesale: /^(wholesale|project|dealer)/, gst_pct: /^(gst|tax)/, stock: /^(stock|qty|quantity)/, min_stock: /^(min|reorder)/, image: /^(image|photo)/ };
function parseRows(text) {
  const delim = text.split('\n')[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && !cell) q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const GST_OK = [0, 5, 12, 18, 28];
function readMany() {
  const rows = parseRows($('#mnText').value);
  if (rows.length < 2) return { map: {}, good: [], bad: [], rows };
  const map = {};
  rows[0].forEach((h, i) => { const k = Object.keys(COLS).find(c => COLS[c].test(h.trim().toLowerCase())); if (k && map[k] === undefined) map[k] = i; });
  const num = v => Number(String(v ?? '').replace(/[₹,\s%]/g, ''));
  const good = [], bad = [];
  if (map.name === undefined) return { map, good, bad, rows };
  rows.slice(1, 20001).forEach((r, n) => {
    const v = k => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
    const gst = v('gst_pct') === '' ? 18 : num(v('gst_pct'));
    const p = {
      id: v('id').slice(0, 64), name: v('name').slice(0, 200), brand: v('brand').slice(0, 80) || '-', category: v('category').slice(0, 80) || 'General',
      hsn: v('hsn').slice(0, 10), unit: v('unit').slice(0, 16) || 'nos', image: cleanImage(v('image')),
      rate_retail: Math.max(0, num(v('rate_retail')) || 0), rate_wholesale: Math.max(0, num(v('rate_wholesale')) || 0),
      gst_pct: gst, stock: Math.trunc(num(v('stock'))) || 0, min_stock: v('min_stock') === '' ? 5 : Math.max(0, Math.trunc(num(v('min_stock'))) || 0),
    };
    if (!p.rate_wholesale) p.rate_wholesale = p.rate_retail;
    const why = p.name.length < 2 ? 'name missing' : !GST_OK.includes(gst) ? 'GST must be 0, 5, 12, 18 or 28' : Number.isNaN(num(v('rate_retail'))) ? 'retail rate is not a number' : '';
    if (why) bad.push({ row: n + 2, name: p.name, why }); else good.push(p);
  });
  return { map, good, bad, rows };
}
const keyOf = p => `${p.name}|${p.brand}`.toLowerCase();
function drawMany() {
  const { map, good, bad, rows } = readMany();
  const known = new Map(ALL.map(p => [keyOf(p), p])), ids = new Set(ALL.map(p => p.id));
  const update = good.filter(p => (p.id && ids.has(p.id)) || known.has(keyOf(p))).length;
  $('#mnSave').disabled = !good.length;
  $('#mnSave').textContent = good.length ? `Add ${good.length.toLocaleString('en-IN')} product${good.length === 1 ? '' : 's'}` : 'Add products';
  $('#mnSum').textContent = !rows.length ? '' : rows.length < 2 ? 'Paste the column names and at least one row.'
    : map.name === undefined ? 'No Name column found in the first row.'
      : `${good.length - update} new, ${update} will update existing${bad.length ? `, ${bad.length} with problems` : ''}`;
  const cell = v => `<td>${esc(v)}</td>`;
  $('#mnPrev').innerHTML = (bad.length ? `<table class="tbl mn-bad"><tbody>${bad.slice(0, 20).map(b => `<tr><td>Row ${b.row}</td><td>${esc(b.name)}</td><td>${esc(b.why)}</td></tr>`).join('')}</tbody></table>` : '')
    + (good.length ? `<table class="tbl"><thead><tr><th>Name</th><th>Make</th><th>Category</th><th>HSN</th><th>Retail</th><th>GST</th><th>Stock</th></tr></thead><tbody>
      ${good.slice(0, 30).map(p => `<tr>${cell(p.name)}${cell(p.brand)}${cell(p.category)}${cell(p.hsn)}${cell(p.rate_retail ? fmt(p.rate_retail) : 'Quote')}${cell(p.gst_pct + '%')}${cell(p.stock)}</tr>`).join('')}</tbody></table>
      ${good.length > 30 ? `<p class="hint">Showing 30 of ${good.length.toLocaleString('en-IN')}.</p>` : ''}` : '');
}
function openMany() { $('#mnText').value = ''; drawMany(); $('#scrim').classList.add('open'); $('#many').classList.add('open'); $('#mnText').focus(); }
$('#mnText').oninput = drawMany;
$('#mnClose').onclick = closeSheets;
$('#mnCancel').onclick = closeSheets;
$('#mnTpl').onclick = () => download('products-template.csv', 'Name,Make,Category,HSN,Unit,Retail,Wholesale,GST,Stock,Min\n"Ball bearing 6206 ZZ",SKF,Bearings,8482,nos,320,290,18,40,5\n', 'text/csv');
$('#csv').onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 8e6) { toast('That file is over 8 MB'); return; }
  const r = new FileReader();
  r.onload = () => { $('#mnText').value = String(r.result).replace(/^﻿/, ''); drawMany(); };
  r.readAsText(f);
};
$('#mnSave').onclick = async () => {
  const { good } = readMany();
  if (!good.length) return;
  const known = new Map(ALL.map(p => [keyOf(p), p])), ids = new Map(ALL.map(p => [p.id, p]));
  const stamp = Date.now().toString(36).toUpperCase();
  const list = good.map((p, i) => {
    const was = ids.get(p.id) || known.get(keyOf(p));
    return was ? { ...was, ...p, id: was.id, image: p.image || was.image } : { ...p, id: p.id || `P-${stamp}-${i}` };
  });
  try { await SSE.putMany(list); } catch { toast('Could not save. Storage may be full.'); return; }
  closeSheets(); await reload();
  toast(`${list.length.toLocaleString('en-IN')} products saved. Export for website to publish them.`);
};

/* Stock, orders, ledger */
async function drawStock() {
  const el = $('#pane-stock'), log = read('sse_stocklog').slice(-40).reverse();
  const low = (await SSE.all()).filter(p => (Number(p.stock) || 0) <= (p.min_stock ?? 5)).slice(0, 80);
  el.innerHTML = (low.length ? `<h3>Needs reorder (${low.length})</h3><div class="tblwrap"><table class="tbl"><tbody>` +
    low.map(p => `<tr><td><b>${esc(p.name)}</b><small>${esc(p.category)}</small></td><td style="text-align:right"><span class="pill bad">${Number(p.stock) || 0} left</span></td></tr>`).join('') + '</tbody></table></div>'
    : '<div class="empty"><b>Shelf is healthy</b><p>No item is below its minimum.</p></div>')
    + `<h3 style="margin-top:22px">Recent moves</h3><div class="tblwrap"><table class="tbl"><tbody>` +
    (log.map(l => `<tr><td>${esc(l.id)}</td><td class="mono">${Number(l.delta) > 0 ? '+' : ''}${Number(l.delta) || 0}</td><td>${esc(l.reason)}</td></tr>`).join('') || '<tr><td>No moves logged yet.</td></tr>') + '</tbody></table></div>';
}
/* Paid website orders land here from the backend, and each bill is filed once in this
   browser's ledger with its stock cut, so reports and the day book include it. The staff
   token lasts for this tab only. */
const staffToken = () => sessionStorage.getItem('sse_staff') || '';
const waiting = () => read('sse_orders').filter(o => o.status === 'new' || o.status === 'paid').length;
async function staffGet(path) {
  const r = await fetch(SSE.api() + path, { headers: { Authorization: 'Bearer ' + staffToken() } });
  if (r.status === 401) sessionStorage.removeItem('sse_staff');
  if (!r.ok) throw new Error('Could not load online orders');
  return r.json();
}
async function staffPost(path, body) {
  const r = await fetch(SSE.api() + path, { method: 'POST', headers: { Authorization: 'Bearer ' + staffToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not save that');
  return j;
}
async function syncOnline() {
  if (!SSE.api() || !staffToken()) return 0;
  const [orders, bills] = await Promise.all([staffGet('/orders?limit=200'), staffGet('/invoices/online')]);
  const list = read('sse_orders'), filed = invoices(), moved = [];
  for (const s of orders.items) {
    let d = {};
    try { d = JSON.parse(s.text); } catch { /* a plain text order */ }
    const it = list.find(x => x.id === s.id), rows = d.items || [];
    if (it) { if (it.status === 'new' && s.status === 'paid') it.status = 'paid'; it.invoice = s.invoice_no; it.quote = s.source === 'quote'; continue; }
    list.push({ id: s.id, source: 'online', quote: s.source === 'quote', status: s.status, invoice: s.invoice_no, phone: s.phone, name: d.customer?.name || '', total: d.amount || 0, items: rows, created: s.created,
      text: rows.length ? rows.map(c => `${c.name} x ${c.qty}`).join(', ') : s.text });
  }
  let fresh = 0;
  for (const x of bills.items.slice().reverse()) {
    if (filed.some(i => i.no === x.no)) continue;
    filed.push(onlineBill(x)); fresh++;
    for (const c of x.items) {
      const p = ALL.find(q => q.id === c.id);
      if (p) { p.stock = (Number(p.stock) || 0) - c.qty; moved.push(p); SSE.logStock(p.id, -c.qty, x.no); }
    }
  }
  write('sse_orders', list);
  write('sse_invoices', filed);
  if (moved.length) await SSE.putMany(moved);
  $('#ordN').textContent = waiting();
  if (fresh) { toast(`${fresh} new paid order${fresh === 1 ? '' : 's'}`); stats(); }
  if (!$('#pane-orders').hidden) drawOrders();
  return fresh;
}
function onlineBar() {
  if (!SSE.api()) return '';
  return staffToken()
    ? '<div class="panel-tools online-bar"><span>Online orders connected</span><button class="btn line sm" id="onlineSync">Refresh</button></div>'
    : '<div class="panel-tools online-bar"><span>Session ended. Lock and sign in again to load online orders.</span></div>';
}
function bindOnline(el) {
  const sync = el.querySelector('#onlineSync');
  if (sync) sync.onclick = () => syncOnline().catch(x => toast(x.message));
}
/* Customers: everyone who signed in by email, read live from the backend. */
const when = d => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');
async function drawCustomers() {
  const el = $('#pane-customers');
  if (!SSE.api() || !staffToken()) {
    el.innerHTML = `<div class="empty"><b>${SSE.api() ? 'Sign in again' : 'No customer accounts yet'}</b><p>${SSE.api() ? 'Lock the console and sign in again to load customers.' : 'Accounts are created by email sign-in, which starts once the backend is live.'}</p></div>`;
    return;
  }
  el.innerHTML = '<div class="empty slim">Loading customers</div>';
  try {
    const { items } = await staffGet('/customers');
    if (!items.length) { el.innerHTML = '<div class="empty"><b>No accounts yet</b><p>Customers appear here the first time they sign in with their email.</p></div>'; return; }
    el.innerHTML = `<p class="hint">${items.length} account${items.length === 1 ? '' : 's'}</p><div class="tblwrap"><table class="tbl"><thead><tr><th>Customer</th><th>Joined</th><th>Last sign-in</th><th>Orders</th><th>Paid</th><th></th></tr></thead><tbody>` +
      items.map(c => `<tr><td><b>${esc(c.name || 'Name not added')}</b><small>${esc(c.email)}${c.phone ? ' · +91 ' + esc(c.phone) : ''}${c.gstin ? ' · ' + esc(c.gstin) : ''}</small></td><td>${when(c.created_at)}</td><td>${when(c.last_login)}</td><td>${Number(c.orders)}</td><td>${fmt(c.paid)}</td>
        <td style="text-align:right"><button class="btn line sm hist" data-p="${esc(c.email)}">History</button></td></tr>`).join('') + '</tbody></table></div>';
    el.querySelectorAll('.hist').forEach(b => { b.onclick = () => drawHistory(b.dataset.p); });
  } catch (x) { el.innerHTML = `<div class="empty"><b>Could not load customers</b><p>${esc(x.message)}</p></div>`; }
}
async function drawHistory(email) {
  const el = $('#pane-customers');
  try {
    const { customer: c, logins, orders } = await staffGet('/customers/' + encodeURIComponent(email));
    const ev = [{ at: c.created_at, t: 'Account created', d: '' }, ...logins.map(at => ({ at, t: 'Signed in', d: '' }))];
    for (const o of orders) {
      const list = o.items.map(i => `${i.name} x ${i.qty}`).join(', ');
      ev.push({ at: o.created, t: `Order ${o.id}`, d: `${o.total ? fmt(o.total) + ' · ' : 'Rates to confirm · '}${list}` });
      if (o.paid_at) ev.push({ at: o.paid_at, t: `Paid by ${o.mode === 'Online' ? 'online payment' : o.mode}`, d: `Bill ${o.invoice_no}`, ok: true });
    }
    ev.sort((a, b) => new Date(b.at) - new Date(a.at));
    el.innerHTML = `<div class="panel-tools"><button class="btn line sm" id="histBack">All customers</button></div>
      <div class="cust-card"><div><h3>${esc(c.name || 'Name not added')}</h3><p>${esc(c.email)}${c.phone ? ' · +91 ' + esc(c.phone) : ''}${c.gstin ? ' · GSTIN ' + esc(c.gstin) : ''}</p>${c.address ? `<p>${esc(c.address)}</p>` : ''}</div>
        <dl><div><dt>Joined</dt><dd>${when(c.created_at)}</dd></div><div><dt>Last sign-in</dt><dd>${when(c.last_login)}</dd></div><div><dt>Orders</dt><dd>${orders.length}</dd></div></dl></div>
      <ol class="cust-time">${ev.map(e => `<li class="${e.ok ? 'ok' : ''}"><time>${when(e.at)}</time><b>${esc(e.t)}</b>${e.d ? `<span>${esc(e.d)}</span>` : ''}</li>`).join('')}</ol>`;
    $('#histBack').onclick = drawCustomers;
  } catch (x) { toast(x.message); }
}
function drawOrders() {
  const el = $('#pane-orders'), o = read('sse_orders').slice().reverse().sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
  if (!o.length) { el.innerHTML = onlineBar() + '<div class="empty"><b>No orders here yet</b><p>Website orders reach you on WhatsApp. They appear here only if placed from this computer, or once online orders are connected.</p></div>'; bindOnline(el); return; }
  el.innerHTML = onlineBar() + '<div class="tblwrap"><table class="tbl"><thead><tr><th>Order</th><th>Items</th><th>Status</th><th></th></tr></thead><tbody>' +
    o.slice(0, 100).map(x => `<tr><td><b>${esc(x.id)}</b><small>${esc(x.name || '')} ${esc(x.phone || '')}</small></td><td>${esc((x.text || '').slice(0, 140))}</td>
    <td><span class="pill ${x.status === 'new' ? 'warn' : x.status === 'delivered' || x.status === 'paid' ? 'ok' : 'info'}">${esc(x.status)}</span>${x.invoice ? `<small>${esc(x.invoice)}</small>` : ''}</td>
    <td style="text-align:right">${x.source === 'online' && x.total && !x.invoice && !x.quote && staffToken() ? `<span class="markpaid"><select aria-label="Paid by" data-id="${esc(x.id)}"><option>Cash</option><option>UPI</option><option>Transfer</option></select><button class="btn sm mp" data-id="${esc(x.id)}" data-total="${Number(x.total)}">Mark paid</button></span> ` : ''}${x.invoice ? `<button class="btn line sm rpo" data-no="${esc(x.invoice)}">Print bill</button> ` : ''}${x.status !== 'delivered' ? `<button class="btn line sm adv" data-id="${esc(x.id)}">Advance</button>` : ''}</td></tr>`).join('') + '</tbody></table></div>';
  bindOnline(el);
  // A bill is permanent, so the first press only asks.
  el.querySelectorAll('.mp').forEach(b => {
    b.onclick = async () => {
      const mode = b.previousElementSibling.value;
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = `Confirm ${fmt(b.dataset.total)} by ${mode}`; return; }
      b.disabled = true;
      try {
        const j = await staffPost(`/orders/${encodeURIComponent(b.dataset.id)}/mark-paid`, { mode });
        await syncOnline();
        drawOrders();
        toast(`Paid. Bill ${j.invoiceNo}`);
      } catch (x) { toast(x.message); b.disabled = false; }
    };
  });
  el.querySelectorAll('.rpo').forEach(b => { b.onclick = () => { const r = invoices().find(i => i.no === b.dataset.no); if (r) { buildPrint(r); setTimeout(() => window.print(), 250); } }; });
  el.querySelectorAll('.adv').forEach(b => {
    b.onclick = () => {
      const all = read('sse_orders'), it = all.find(x => x.id === b.dataset.id);
      it.status = it.status === 'new' || it.status === 'paid' ? 'confirmed' : 'delivered';
      write('sse_orders', all);
      $('#ordN').textContent = waiting();
      drawOrders(); toast('Order ' + it.status);
    };
  });
}
function drawLedger() {
  const el = $('#pane-ledger'), inv = invoices();
  const open = inv.filter(i => i.type === 'TAX' && (i.balance || 0) > 0).reverse();
  const shut = inv.filter(i => i.type === 'TAX' && (i.balance || 0) <= 0 && (i.paid || 0) > 0).slice(-20).reverse();
  const due = open.reduce((a, i) => a + (i.balance || 0), 0);
  el.innerHTML = `<h3>Outstanding ${fmt(due)} across ${open.length} bill${open.length === 1 ? '' : 's'}</h3>` + (open.length ? '<div class="tblwrap"><table class="tbl"><tbody>' +
    open.map(i => `<tr><td><b>${esc(i.no)}</b><small>${esc(i.customer || i.phone || 'Walk-in')}</small></td>
    <td style="text-align:right">${fmt(i.grand)}<br><span class="pill warn">Due ${fmt(i.balance)}</span></td>
    <td style="text-align:right"><span class="paybox"><input type="number" min="1" step="any" max="${Number(i.balance) || 0}" value="${Number(i.balance) || 0}" data-no="${esc(i.no)}" aria-label="Amount received"><button class="btn sm rk" data-no="${esc(i.no)}">Receive</button></span></td></tr>`).join('') + '</tbody></table></div>'
    : '<div class="empty"><b>Nothing outstanding</b><p>Every bill is settled.</p></div>')
    + (shut.length ? '<h3 style="margin-top:20px">Recently settled</h3><div class="tblwrap"><table class="tbl"><tbody>' + shut.map(i => `<tr><td>${esc(i.no)}<small>${esc(i.customer || 'Walk-in')}</small></td><td style="text-align:right"><span class="pill ok">${fmt(i.grand)}</span></td></tr>`).join('') + '</tbody></table></div>' : '');
  el.querySelectorAll('.rk').forEach(b => {
    b.onclick = () => {
      const inp = [...el.querySelectorAll('input[data-no]')].find(x => x.dataset.no === b.dataset.no);
      const all = invoices(), r = all.find(x => x.no === b.dataset.no);
      const amt = Math.min(Math.max(0, Number(inp.value) || 0), r.balance || 0);
      if (!amt) return;
      r.paid = (r.paid || 0) + amt;
      r.balance = Math.max(0, (r.grand || 0) - r.paid);
      write('sse_invoices', all);
      drawLedger(); stats(); toast('Received ' + fmt(amt));
    };
  });
}
// A cell starting with = + - @ runs as a formula in Excel, and customer names come from outside.
const csvCell = s => { let v = String(s ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
function exportCSV() {
  const rows = invoices().map(i => [i.no, (i.date || '').slice(0, 10), i.type, i.customer, i.phone, i.gstin, i.taxable ?? i.sub, i.gst, i.grand, i.paid, i.balance, i.mode].map(csvCell).join(','));
  download(`daybook-${SSE.localDate()}.csv`, ['Bill,Date,Type,Customer,Phone,GSTIN,Taxable,GST,Total,Paid,Balance,Mode', ...rows].join('\n'), 'text/csv');
  toast('Bills CSV downloaded');
}
function drawReports() {
  const el = $('#pane-reports'), inv = invoices();
  const dayOf = x => SSE.localDate(new Date(x.date));
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return SSE.localDate(d); });
  const per = days.map(d => inv.filter(x => x.type === 'TAX' && dayOf(x) === d).reduce((a, x) => a + (x.grand || 0), 0)), mx = Math.max(1, ...per);
  const tax = inv.filter(i => i.type === 'TAX');
  el.innerHTML = `<div class="dbhead"><h3 style="margin:0">Last 14 days</h3><button class="btn line sm" id="csvExp">Bills CSV</button></div>
  <div class="bars">${per.map((v, i) => `<span style="height:${Math.max(2, Math.round(v / mx * 100))}%" title="${days[i]} · ${fmt(v)}"></span>`).join('')}</div>
  <p class="hint">${tax.length} tax bill${tax.length === 1 ? '' : 's'} · ${fmt(tax.reduce((a, i) => a + (i.grand || 0), 0))} billed · ${fmt(tax.reduce((a, i) => a + (i.gst || 0), 0))} GST</p>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>Bill</th><th>Total</th><th>GST</th><th>Paid</th><th>Due</th></tr></thead><tbody>` +
    (inv.slice(-50).reverse().map(i => `<tr><td>${esc(i.no)}</td><td>${fmt(i.grand)}</td><td>${fmt(i.gst)}</td><td>${fmt(i.paid)}</td><td>${fmt(i.balance)}</td></tr>`).join('') || '<tr><td>No bills yet.</td></tr>') + '</tbody></table></div>';
  $('#csvExp').onclick = exportCSV;
}

/* Settings */
const BACKUP_KEYS = ['sse_invoices', 'sse_orders', 'sse_held', 'sse_stocklog', 'sse_content', 'sse_seq', 'sse_seq_fy'];
async function backup() {
  const data = { app: 'shree-shyam', version: 1, saved: new Date().toISOString(), products: await SSE.all(), local: {} };
  BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data.local[k] = v; });
  download(`shree-shyam-backup-${SSE.localDate()}.json`, JSON.stringify(data), 'application/json');
  localStorage.setItem('sse_backup_at', data.saved);
  drawContent();
  toast('Backup downloaded. Keep it somewhere safe.');
}
async function restore(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch { toast('That is not a backup file'); return; }
  if (d?.app !== 'shree-shyam' || !Array.isArray(d.products) || typeof d.local !== 'object') { toast('That is not a backup file'); return; }
  if (!confirm(`Replace everything on this computer with the backup from ${String(d.saved).slice(0, 10)}?`)) return;
  await SSE.clearProducts();
  await SSE.putMany(d.products.filter(p => p && typeof p.id === 'string'));
  BACKUP_KEYS.forEach(k => { if (typeof d.local[k] === 'string') localStorage.setItem(k, d.local[k]); else localStorage.removeItem(k); });
  location.reload();
}
function drawContent() {
  const el = $('#pane-content'), c = SSE.content(), at = localStorage.getItem('sse_backup_at');
  const age = at ? Math.floor((Date.now() - new Date(at)) / 864e5) : null;
  el.innerHTML = `<div class="settings">
  <section class="panel"><h3>Payments</h3>
    <div class="field"><label for="c_upi">UPI ID for bills and checkout</label><input id="c_upi" value="${esc(c.upi_id || '')}" maxlength="80"></div>
    <div class="field"><label for="c_api">Backend address (optional)</label><input id="c_api" value="${esc(localStorage.getItem('sse_api') || '')}" placeholder="https://"></div>
    <button class="btn" id="c_save">Save</button></section>
  <section class="panel"><h3>Backup</h3>
    <p class="hint" style="margin:0 0 12px">Bills, the ledger and products live only in this browser. Clearing browser data erases them. ${age === null ? 'No backup taken yet.' : age === 0 ? 'Last backup today.' : `Last backup ${age} day${age === 1 ? '' : 's'} ago.`}</p>
    <div class="panel-tools"><button class="btn" id="c_bak">Download backup</button>
    <label class="btn line" style="cursor:pointer">Restore<input type="file" id="c_res" accept=".json,application/json" hidden></label></div></section>
  </div>`;
  $('#c_save').onclick = () => {
    SSE.saveContent({ ...SSE.content(), upi_id: $('#c_upi').value.trim() });
    const u = $('#c_api').value.trim();
    if (u && !/^https:\/\//.test(u)) { toast('The backend address must start with https://'); return; }
    if (u) localStorage.setItem('sse_api', u); else localStorage.removeItem('sse_api');
    toast('Saved');
  };
  $('#c_bak').onclick = backup;
  $('#c_res').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
}

/* Billing counter */
const Billing = (() => {
  let shelf = [], cart = [], mode = 'UPI', type = 'TAX', bound = false;
  const today = () => SSE.localDate();
  const money = () => SSE.totals(cart, $('#disc').value);
  const nextNo = () => `SSE/${SSE.fy()}/${String(Number(localStorage.getItem('sse_seq_fy') === SSE.fy() || !localStorage.getItem('sse_seq_fy') ? localStorage.getItem('sse_seq') || 1 : 1)).padStart(4, '0')}`;
  // Place of supply follows the buyer's GSTIN. Same state is CGST + SGST, otherwise IGST.
  const supplyCode = g => (STATES[(g || '').slice(0, 2)] ? g.slice(0, 2) : SHOP.state);
  const paidNow = t => {
    const v = $('#paid').value.trim();
    if (v !== '') return Math.max(0, Number(v) || 0);
    return mode === 'Credit' ? 0 : t.grand;
  };

  async function start() {
    shelf = await SSE.all();
    if (!bound) {
      bound = true;
      $('#bq').oninput = drawShelf; $('#slab').onchange = drawShelf;
      $('#bq').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#res .add')?.click(); } });
      $('#disc').oninput = drawLines; $('#paid').oninput = drawLines;
      $('#save').onclick = save; $('#hold').onclick = hold;
      $('#dbq').oninput = daybook;
      $('#cgstin').oninput = gstinNote;
      $('#modeSeg').querySelectorAll('button').forEach(b => { b.onclick = () => { $('#modeSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); mode = b.dataset.m; drawLines(); }; });
      $('#typeSeg').querySelectorAll('button').forEach(b => { b.onclick = () => { $('#typeSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); type = b.dataset.b; drawHead(); }; });
    }
    const seen = new Set();
    $('#custList').innerHTML = invoices().map(r => r.customer).filter(c => c && !seen.has(c) && seen.add(c)).slice(-30).map(c => `<option value="${esc(c)}">`).join('');
    drawHead(); drawShelf(); drawLines(); drawHeld(); daybook();
  }
  async function refresh() { shelf = await SSE.all(); drawHead(); drawShelf(); daybook(); }
  function drawHead() {
    $('#invNo').textContent = type === 'TAX' ? nextNo() : 'Estimate';
    $('#invDate').textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    $('#save').textContent = type === 'TAX' ? 'Save and print' : 'Save estimate';
  }
  function gstinNote() {
    const g = $('#cgstin').value.trim().toUpperCase(), el = $('#gstinNote');
    el.textContent = !g ? '' : !GSTIN_RE.test(g) ? 'Check this GSTIN' : supplyCode(g) === SHOP.state ? '' : `IGST applies, ${STATES[g.slice(0, 2)]}`;
    drawLines();
  }
  function drawShelf() {
    const q = $('#bq').value.trim().toLowerCase(), slab = $('#slab').value, box = $('#res');
    const f = shelf.filter(p => !q || `${p.name} ${p.brand} ${p.id}`.toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = '';
    if (!f.length) {
      box.innerHTML = `<div class="empty"><b>Not on the shelf</b><p>Bill it as a one-off line. Stock is not affected.</p><button class="btn sm add">Add “${esc($('#bq').value.trim())}”</button></div>`;
      box.querySelector('.add').onclick = () => { addItem({ id: 'X-' + Date.now().toString(36), name: $('#bq').value.trim().slice(0, 200), gst_pct: 18, hsn: '', unit: 'nos', stock: Infinity }, 0); $('#bq').value = ''; drawShelf(); };
      return;
    }
    f.forEach(p => {
      const rate = (slab === 'wholesale' ? p.rate_wholesale : p.rate_retail) || 0, low = (Number(p.stock) || 0) <= (p.min_stock ?? 5);
      const d = document.createElement('button');
      d.className = 'pick add'; d.type = 'button';
      d.innerHTML = `<img loading="lazy" src="${SSE.safeImg(p.image)}" alt="">
        <span class="pick-t"><b>${esc(p.name)}</b><small>${esc(p.brand)} · ${low ? '<em>Low</em> ' : ''}${Number(p.stock) || 0} in stock</small></span>
        <span class="pick-r">${rate ? fmt(rate) : 'Set rate'}</span>`;
      d.onclick = () => { addItem(p, rate); $('#bq').focus(); };
      box.appendChild(d);
    });
  }
  function addItem(p, rate) {
    const ex = cart.find(c => c.id === p.id), nxt = (ex ? ex.qty : 0) + 1;
    if (nxt > (Number(p.stock) || 0)) toast(`Only ${Number(p.stock) || 0} in stock`);
    if (ex) ex.qty++;
    else cart.push({ id: p.id, name: p.name, qty: 1, rate, gst_pct: Number(p.gst_pct) || 0, hsn: p.hsn || '', unit: p.unit || 'nos', oneoff: String(p.id).startsWith('X-') });
    $('#billErr').textContent = '';
    drawLines();
  }
  function drawLines() {
    const t = money(), paid = paidNow(t), box = $('#lines');
    if (!cart.length) box.innerHTML = '<div class="empty slim">Add items from the shelf.</div>';
    else {
      box.innerHTML = cart.map((c, i) => `<div class="bline"><div><b>${esc(c.name)}</b><span>${c.hsn ? 'HSN ' + esc(c.hsn) + ' · ' : ''}GST <select class="gstin" data-i="${i}" aria-label="GST rate">${GST_OK.map(g => `<option ${g === c.gst_pct ? 'selected' : ''}>${g}</option>`).join('')}</select>%</span></div>
        <div class="stepper"><button data-i="${i}" data-d="-1" aria-label="Decrease">−</button><b>${Number(c.qty)}</b><button data-i="${i}" data-d="1" aria-label="Increase">+</button></div>
        <input class="ratein" type="number" min="0" step="any" value="${Number(c.rate) || ''}" placeholder="Rate" data-i="${i}" aria-label="Rate for ${esc(c.name)}">
        <input class="discin" type="number" min="0" max="100" step="any" value="${Number(c.disc_pct) || ''}" placeholder="0" data-i="${i}" aria-label="Discount percent for ${esc(c.name)}">
        <em>${fmt(SSE.lineValue(c))}</em><button class="rm" data-i="${i}" aria-label="Remove ${esc(c.name)}">×</button></div>`).join('');
      box.querySelectorAll('.stepper button').forEach(b => { b.onclick = () => { const c = cart[+b.dataset.i]; c.qty = Math.max(1, c.qty + +b.dataset.d); drawLines(); }; });
      box.querySelectorAll('.ratein').forEach(r => { r.onchange = () => { cart[+r.dataset.i].rate = Math.max(0, Number(r.value) || 0); drawLines(); }; });
      box.querySelectorAll('.discin').forEach(r => { r.onchange = () => { cart[+r.dataset.i].disc_pct = Math.min(100, Math.max(0, Number(r.value) || 0)); drawLines(); }; });
      box.querySelectorAll('.gstin').forEach(r => { r.onchange = () => { cart[+r.dataset.i].gst_pct = Number(r.value); drawLines(); }; });
      box.querySelectorAll('.rm').forEach(b => { b.onclick = () => { cart.splice(+b.dataset.i, 1); drawLines(); }; });
    }
    const code = supplyCode($('#cgstin').value.trim().toUpperCase()), inter = code !== SHOP.state, due = Math.max(0, t.grand - paid);
    $('#totals').innerHTML = `<div><span>Taxable value</span><b>${fmt(t.taxable)}</b></div>
      ${t.itemDisc ? `<div><span>Includes item discount</span><b>− ${fmt(t.itemDisc)}</b></div>` : ''}
      ${t.disc ? `<div><span>Includes bill discount</span><b>− ${fmt(t.disc)}</b></div>` : ''}
      ${inter ? `<div><span>IGST</span><b>${fmt(t.gst)}</b></div>` : `<div><span>CGST</span><b>${fmt(t.gst / 2)}</b></div><div><span>SGST</span><b>${fmt(t.gst / 2)}</b></div>`}
      ${due > 0 && cart.length ? `<div class="due"><span>Balance to udhaar</span><b>${fmt(due)}</b></div>` : ''}`;
    $('#payTotal').textContent = fmt(t.grand);
    $('#payLabel').textContent = cart.length ? `${cart.reduce((a, c) => a + c.qty, 0)} item${cart.reduce((a, c) => a + c.qty, 0) === 1 ? '' : 's'} · ${mode}` : 'Total';
  }
  function resetBill() {
    cart = [];
    ['#cust', '#cphone', '#cgstin', '#caddr', '#paid'].forEach(s => { $(s).value = ''; });
    $('#disc').value = 0;
    $('#gstinNote').textContent = '';
    drawLines();
  }
  function hold() {
    if (!cart.length) { $('#billErr').textContent = 'Nothing to hold, the bill is empty.'; return; }
    try {
      const h = read('sse_held');
      h.push({ id: 'H' + Date.now(), customer: $('#cust').value.trim() || 'Walk-in', phone: $('#cphone').value.trim(), gstin: $('#cgstin').value.trim(), address: $('#caddr').value.trim(), items: cart, created: new Date().toISOString() });
      write('sse_held', h);
    } catch { $('#billErr').textContent = 'Storage is full. Download a backup from Settings.'; return; }
    resetBill(); drawHeld(); toast('Bill held');
  }
  function drawHeld() {
    const h = read('sse_held');
    $('#held').innerHTML = h.map(x => `<span class="heldchip">${esc(x.customer)} · ${x.items.reduce((a, c) => a + c.qty, 0)} items
      <button class="go" data-id="${esc(x.id)}">Resume</button><button data-x="${esc(x.id)}" aria-label="Discard held bill">×</button></span>`).join('');
    $('#held').querySelectorAll('.go').forEach(b => {
      b.onclick = () => {
        const all = read('sse_held'), it = all.find(x => x.id === b.dataset.id);
        cart = it.items;
        $('#cust').value = it.customer === 'Walk-in' ? '' : it.customer; $('#cphone').value = it.phone || ''; $('#cgstin').value = it.gstin || ''; $('#caddr').value = it.address || '';
        write('sse_held', all.filter(x => x.id !== b.dataset.id));
        drawLines(); drawHeld();
      };
    });
    $('#held').querySelectorAll('[data-x]').forEach(b => { b.onclick = () => { write('sse_held', read('sse_held').filter(x => x.id !== b.dataset.x)); drawHeld(); }; });
  }
  function daybook() {
    const q = ($('#dbq').value || '').toLowerCase();
    const list = invoices().filter(r => SSE.localDate(new Date(r.date)) === today() && (!q || `${r.no} ${r.customer || ''}`.toLowerCase().includes(q))).reverse();
    const tax = list.filter(r => r.type === 'TAX');
    $('#dbSum').textContent = `${tax.length} bill${tax.length === 1 ? '' : 's'} · ${fmt(tax.reduce((a, r) => a + (r.grand || 0), 0))} billed · ${fmt(tax.reduce((a, r) => a + (r.paid || 0), 0))} received · ${fmt(tax.reduce((a, r) => a + (r.balance || 0), 0))} udhaar`;
    $('#dblist').innerHTML = list.length ? list.map(r => `<div class="dbrow"><div><b>${esc(r.no)}</b> <span class="pill ${r.type === 'TAX' ? 'info' : 'warn'}">${r.type === 'TAX' ? 'Tax' : 'Estimate'}</span><small>${esc(r.customer || 'Walk-in')}${r.balance ? ' · due ' + fmt(r.balance) : ''}</small></div>
      <div class="dbrow-r"><b>${fmt(r.grand)}</b><button class="btn line sm rp" data-no="${esc(r.no)}">Print</button></div></div>`).join('')
      : '<div class="empty slim">Saved bills land here with one tap reprint.</div>';
    $('#dblist').querySelectorAll('.rp').forEach(b => { b.onclick = () => { const r = invoices().find(x => x.no === b.dataset.no); if (r) { buildPrint(r); printNow(r); } }; });
  }
  async function save() {
    const err = $('#billErr'), t = money(), paid = paidNow(t);
    err.textContent = '';
    if (!cart.length) { err.textContent = 'Add at least one item.'; return; }
    if (cart.some(c => !c.rate)) { err.textContent = 'Enter a rate on every line.'; return; }
    const customer = $('#cust').value.trim(), phone = $('#cphone').value.trim(), gstin = $('#cgstin').value.trim().toUpperCase();
    if (type === 'TAX' && !customer && !phone) { err.textContent = 'Add a customer name or phone for a tax invoice.'; return; }
    if (gstin && !GSTIN_RE.test(gstin)) { err.textContent = 'That GSTIN is not valid.'; return; }
    if (paid > t.grand) { err.textContent = 'Received is more than the bill total.'; return; }
    const code = supplyCode(gstin);
    const rec = {
      no: type === 'TAX' ? nextNo() : 'EST-' + Date.now(), date: new Date().toISOString(), type, customer, phone, gstin, address: $('#caddr').value.trim(), mode,
      items: cart.map(c => ({ ...c })), gross: t.gross, itemDisc: t.itemDisc, sub: t.sub, disc: t.disc, taxable: t.taxable, gst: t.gst, keep: t.keep, round: t.round, grand: t.grand,
      supply: code, inter: code !== SHOP.state, paid, balance: Math.max(0, t.grand - paid),
    };
    // The bill must be safely stored before anything is printed or stock moves.
    try { const a = invoices(); a.push(rec); write('sse_invoices', a); }
    catch { err.textContent = 'Storage is full, this bill was not saved. Download a backup from Settings.'; return; }
    if (type === 'TAX') {
      SSE.seq();
      const all = await SSE.all(), moved = [];
      for (const c of cart) { const p = all.find(x => x.id === c.id); if (p) { p.stock = (Number(p.stock) || 0) - c.qty; moved.push(p); SSE.logStock(p.id, -c.qty, rec.no); } }
      if (moved.length) await SSE.putMany(moved);
      shelf = all; ALL = all;
    }
    buildPrint(rec);
    printNow(rec);
    resetBill(); drawHead(); drawShelf(); daybook(); stats();
    toast(`${type === 'TAX' ? 'Invoice' : 'Estimate'} ${rec.no} saved`);
  }
  function printNow(r) {
    // The browser uses the page title as the PDF file name.
    const was = document.title;
    document.title = String(r.no).replace(/\//g, '-');
    addEventListener('afterprint', () => { document.title = was; }, { once: true });
    setTimeout(() => window.print(), 250);
  }
  return { start, refresh };
})();

if (sessionStorage.getItem('sse_admin') === '1') openConsole();
