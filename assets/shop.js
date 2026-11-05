/* Catalogue: browse, filter, add to cart. A rate of 0 means "rate on request". */
const $ = SSE.$;
const DEPTS = [
  { n: 'Pneumatics', img: 'assets/land/p/p13.webp', t: /cylinder|valve|frl|gripper|booster|fitting|silencer|qrc|tubing|switches/i },
  { n: 'Bearings', img: 'assets/land/pdf/bearings.webp', t: /^bearings/i },
  { n: 'Belts and chains', img: 'assets/land/pdf/belts.webp', t: /belts|chains/i },
  { n: 'Fasteners and seals', img: 'assets/land/pdf/bolts.webp', t: /fasteners/i },
  { n: 'Tools', img: 'assets/land/pdf/tools.webp', t: /^tools/i },
  { n: 'Electrical', img: 'assets/land/p/p25.webp', t: /^electrical/i },
  { n: 'Gauges', img: 'assets/land/pdf/gauges.webp', t: /gauges/i },
  { n: 'Adhesives', img: 'assets/land/pdf/adhesives.webp', t: /adhesives/i },
  { n: 'Wheels', img: 'assets/land/pdf/wheels.webp', t: /wheels/i },
  { n: 'Welding and packing', img: 'assets/land/pdf/welding.webp', t: /welding|packing/i },
];
let ALL = [], pg = 1, dept = '', cat = '', slab = 'retail', stockOnly = false, qvP = null, qvQty = 1;
const brands = new Set();
const grid = $('#grid');
const rateOf = p => (slab === 'wholesale' ? p.rate_wholesale : p.rate_retail) || 0;
const unitOf = p => p.unit || 'nos';
const count = (a, f) => a.filter(f).length;
const inDept = (p, d) => !d || DEPTS.find(x => x.n === d).t.test(p.category);

function drawCartbar() {
  const n = SSE.cartCount();
  // Clear of the hero: the header already shows the count there.
  const foot = $('#foot')?.getBoundingClientRect().top ?? 1e9;
  $('#cartbar').classList.toggle('show', n > 0 && scrollY > innerHeight * .5 && foot > innerHeight - 40);
  $('#cartbarText').textContent = `${n} item${n === 1 ? '' : 's'} in cart`;
}
function addToCart(p, qty) {
  const cart = SSE.getCart(), ex = cart.find(c => c.id === p.id);
  if (ex) ex.qty += qty;
  else cart.push({ id: p.id, name: p.name, qty, rate: rateOf(p), gst_pct: p.gst_pct, hsn: p.hsn || '', img: p.image, brand: p.brand, unit: unitOf(p), slab });
  SSE.setCart(cart);
  SSE.toast(`${qty} × ${p.name} added`);
}
function buildDepts() {
  const box = $('#depts');
  box.innerHTML = '';
  [{ n: 'Everything', img: 'assets/land/p/p21.webp' }, ...DEPTS].forEach(d => {
    const key = d.n === 'Everything' ? '' : d.n, b = document.createElement('button');
    b.className = 'dept';
    b.setAttribute('aria-pressed', String(dept === key));
    b.innerHTML = `<img src="${d.img}" alt="" loading="lazy"><b>${d.n}</b><small>${count(ALL, p => inDept(p, key))}</small>`;
    b.onclick = () => { dept = dept === key ? '' : key; cat = ''; pg = 1; buildDepts(); buildFilters(); render(); };
    box.appendChild(b);
  });
}
function buildFilters() {
  $('#fStock').innerHTML = `<label class="fopt"><span><input type="checkbox" id="stBtn" ${stockOnly ? 'checked' : ''}>In stock only</span></label>`;
  $('#stBtn').onchange = e => { stockOnly = e.target.checked; pg = 1; render(); };
  const pool = ALL.filter(p => inDept(p, dept));
  const cats = [...new Set(pool.map(p => p.category))].sort();
  $('#fCats').innerHTML = cats.map(c => `<button class="fopt ${cat === c ? 'on' : ''}" data-c="${SSE.esc(c)}"><span>${SSE.esc(c)}</span><small>${count(pool, p => p.category === c)}</small></button>`).join('');
  $('#fCats').querySelectorAll('button').forEach(b => b.onclick = () => { cat = cat === b.dataset.c ? '' : b.dataset.c; pg = 1; buildFilters(); render(); });
  const bm = {};
  pool.forEach(p => { bm[p.brand] = (bm[p.brand] || 0) + 1; });
  $('#fBrands').innerHTML = Object.keys(bm).sort().map(br => `<label class="fopt"><span><input type="checkbox" data-b="${SSE.esc(br)}" ${brands.has(br) ? 'checked' : ''}>${SSE.esc(br)}</span><small>${bm[br]}</small></label>`).join('');
  $('#fBrands').querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? brands.add(i.dataset.b) : brands.delete(i.dataset.b); pg = 1; render(); });
}
function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const f = ALL.filter(p => inDept(p, dept) && (!cat || p.category === cat) && (!brands.size || brands.has(p.brand)) && (!stockOnly || (p.stock || 0) > 0)
    && (!q || `${p.name} ${p.brand || ''} ${p.category} ${p.id}`.toLowerCase().includes(q)));
  const s = $('#sort').value;
  if (s === 'az') f.sort((a, b) => a.name.localeCompare(b.name));
  if (s === 'za') f.sort((a, b) => b.name.localeCompare(a.name));
  if (s === 'stock') f.sort((a, b) => (b.stock || 0) - (a.stock || 0));
  return f;
}
function card(p, i) {
  const d = document.createElement('article'), rate = rateOf(p), ok = (p.stock || 0) > 0, src = SSE.safeImg(p.image);
  d.className = 'card';
  d.style.animationDelay = Math.min(i * 28, 280) + 'ms';
  d.innerHTML = `<div class="card-media">
      <span class="card-make">${SSE.esc(p.brand || '')}</span>
      <img src="${src}" alt="${SSE.esc(p.name)}" loading="lazy">
      <img class="mir" src="${src}" alt="" loading="lazy">
      <button class="card-add" aria-label="Add ${SSE.esc(p.name)} to cart">Add</button>
    </div>
    <h3>${SSE.esc(p.name)}</h3>
    <div class="card-row"><b>${rate ? SSE.fmt(rate) : 'Rate on request'}</b><span><i class="dot ${ok ? '' : 'off'}"></i>${ok ? 'In stock' : 'To order'}</span></div>`;
  d.querySelector('.card-add').onclick = e => {
    e.stopPropagation();
    addToCart(p, 1);
    e.currentTarget.classList.add('in');
    e.currentTarget.textContent = 'Added';
  };
  d.onclick = () => openQv(p);
  return d;
}
function render(append) {
  const f = filtered(), items = SSE.page(f, pg);
  $('#count').textContent = `${f.length.toLocaleString('en-IN')} item${f.length === 1 ? '' : 's'}${dept ? ' in ' + dept : ''}`;
  $('#more').hidden = pg * SSE.PAGE >= f.length;
  if (!append) grid.innerHTML = '';
  if (!f.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Not listed here</b><p>Most of the shelf isn't online yet. Send the part number and we'll find it.</p>
      <a class="btn" href="${SSE.wa('Namaste, yeh part chahiye: ' + $('#q').value.trim())}" target="_blank" rel="noopener">Ask on WhatsApp</a></div>`;
    return;
  }
  items.forEach((p, i) => grid.appendChild(card(p, i)));
}
function openQv(p) {
  qvP = p; qvQty = 1;
  const rate = rateOf(p), ok = (p.stock || 0) > 0;
  $('#qvQty').textContent = '1';
  $('#qvImg').src = SSE.safeImg(p.image);
  $('#qvImg').alt = p.name;
  $('#qvName').textContent = p.name;
  $('#qvBrand').textContent = p.brand || '';
  $('#qvPrice').textContent = rate ? SSE.fmt(rate) : 'Rate on request';
  $('#qvUnit').textContent = rate ? `per ${unitOf(p)}, plus ${Number(p.gst_pct) || 0}% GST` : 'We confirm the rate before dispatch';
  $('#qvSpecs').innerHTML = [['Type', p.category], ['HSN', p.hsn || '—'], ['GST', (Number(p.gst_pct) || 0) + '%'], ['Part ID', p.id]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${SSE.esc(v)}</dd></div>`).join('');
  $('#qvStock').innerHTML = `<i class="dot ${ok ? '' : 'off'}"></i>${ok ? `${Number(p.stock)} ${SSE.esc(unitOf(p))} in stock` : 'To order, ask for lead time'}`;
  $('#qvWa').href = SSE.wa(`Requirement: ${p.name} (${p.brand}). Please share rate and lead time.`);
  $('#scrim').classList.add('open');
  $('#qv').classList.add('open');
  $('#qv').setAttribute('aria-hidden', 'false');
}
function closeAll() {
  $('#scrim').classList.remove('open');
  $('#qv').classList.remove('open');
  $('#qv').setAttribute('aria-hidden', 'true');
  $('#filters').classList.remove('open');
}
(async function init() {
  ALL = await SSE.catalog();
  const want = new URLSearchParams(location.search).get('q');
  if (want) $('#q').value = want;
  buildDepts(); buildFilters(); render(); drawCartbar();
  $('#q').oninput = () => {
    if (dept || cat) { dept = ''; cat = ''; buildDepts(); buildFilters(); }
    pg = 1; render();
  };
  $('#sort').onchange = () => { pg = 1; render(); };
  $('#more').onclick = () => { pg++; render(true); };
  $('#slabSeg').querySelectorAll('button').forEach(b => b.onclick = () => {
    $('#slabSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    slab = b.dataset.s; pg = 1; render();
  });
  $('#fClear').onclick = () => { dept = ''; cat = ''; brands.clear(); stockOnly = false; pg = 1; buildDepts(); buildFilters(); render(); closeAll(); };
  $('#fBtn').onclick = () => { $('#filters').classList.add('open'); $('#scrim').classList.add('open'); };
  $('#scrim').onclick = closeAll;
  $('#qvClose').onclick = closeAll;
  $('#qvMinus').onclick = () => { qvQty = Math.max(1, qvQty - 1); $('#qvQty').textContent = qvQty; };
  $('#qvPlus').onclick = () => { qvQty++; $('#qvQty').textContent = qvQty; };
  $('#qvAdd').onclick = () => { if (qvP) { addToCart(qvP, qvQty); closeAll(); } };
  document.addEventListener('sse:cart', drawCartbar);
  addEventListener('scroll', drawCartbar, { passive: true });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q').focus(); }
  });
})();
