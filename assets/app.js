/* SSE Store — unlimited products via IndexedDB (not 5MB localStorage).
   Public pages read paginated. Admin writes unlimited. Export shards for Vercel. */
const SSE = (() => {
  const DB = 'sse_db', LS_FALLBACK = 'sse_products_fb';
  const PAGE = 48;
  let mem = [];
  const $ = (s, r=document) => r.querySelector(s);

  function idb() {
    return new Promise((res, rej) => {
      try {
        const q = indexedDB.open(DB, 1);
        q.onupgradeneeded = () => q.result.createObjectStore('products', { keyPath: 'id' });
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      } catch (e) { rej(e); }
    });
  }
  async function all() {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const tx = db.transaction('products').objectStore('products').getAll();
        tx.onsuccess = () => res(tx.result || []);
        tx.onerror = () => rej(tx.error);
      });
    } catch { try { return JSON.parse(localStorage.getItem(LS_FALLBACK) || '[]'); } catch { return mem; } }
  }
  async function put(p) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction('products', 'readwrite').objectStore('products').put(p);
        tx.onsuccess = res; tx.onerror = () => rej(tx.error);
      });
    } catch { const a = await all(); const i = a.findIndex(x => x.id === p.id); if (i >= 0) a[i] = p; else a.push(p); localStorage.setItem(LS_FALLBACK, JSON.stringify(a)); }
  }
  async function seed() {
    const have = await all();
    if (have.length) return have;
    try {
      const r = await fetch('data/catalog-001.json');
      const j = await r.json();
      for (const p of j.products) await put(p);
      localStorage.setItem('sse_content', JSON.stringify(j.content));
      return j.products;
    } catch { return []; }
  }
  const content = () => { try { return JSON.parse(localStorage.getItem('sse_content') || '{}'); } catch { return {}; } };
  const saveContent = c => localStorage.setItem('sse_content', JSON.stringify(c));
  const fmt = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  // Escape anything rendered via innerHTML: product names (admin/CSV import),
  // order text (public form), customer names. Prevents stored XSS.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Product images are admin-pasted URLs — allow http(s) only, else placeholder.
  const safeImg = u => { try { const x = new URL(u, location.href); if (x.protocol === 'http:' || x.protocol === 'https:') return x.href; } catch {} return 'assets/img/cat-p21.png'; };

  function filter(list, q, cat) {
    q = (q || '').toLowerCase();
    return list.filter(p =>
      (!cat || p.category === cat) &&
      (!q || (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)));
  }
  function page(list, n) { return list.slice((n - 1) * PAGE, n * PAGE); }

  /* Billing helpers */
  const seq = () => {
    const k = 'sse_seq', v = Number(localStorage.getItem(k) || '1');
    localStorage.setItem(k, String(v + 1));
    const fy = '25-26'; return `SSE/${fy}/${String(v).padStart(4, '0')}`;
  };
  function totals(items, discount = 0) {
    let sub = 0, gst = 0;
    for (const it of items) { const t = it.qty * it.rate; sub += t; gst += t * (it.gst_pct / 100); }
    const grand = Math.round(sub + gst - discount);
    return { sub, gst, grand };
  }
  function logStock(id, delta, reason) {
    try {
      const a = JSON.parse(localStorage.getItem('sse_stocklog') || '[]');
      a.push({ id, delta, reason, date: new Date().toISOString() });
      localStorage.setItem('sse_stocklog', JSON.stringify(a.slice(-2000)));
    } catch {}
  }

  /* Reveal + tagline (single observer, no scroll listeners) */
  function motion() {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));
    const words = document.querySelectorAll('.tagline .w');
    if (!words.length) return;
    const wio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); wio.unobserve(e.target); } }), { threshold: .6, rootMargin: '0px 0px -40% 0px' });
    words.forEach((w, i) => { w.style.transitionDelay = (i * 40) + 'ms'; wio.observe(w); });
  }

  /* Update mobile bottom navigation cart badge & active states */
  function updateNavBadge() {
    try {
      const cart = JSON.parse(localStorage.getItem('sse_cart') || '[]');
      const count = cart.reduce((a, c) => a + (Number(c.qty) || 0), 0);
      const badges = document.querySelectorAll('.nav-badge, [data-nav-badge]');
      badges.forEach(b => {
        if (count > 0) {
          b.textContent = count;
          b.style.display = 'inline-block';
        } else {
          b.textContent = '0';
          b.style.display = 'none';
        }
      });
    } catch {}
  }

  /* Enterprise footer — clean corporate layout without mobile bottom nav buttons */
  function footer(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(path.includes('admin')||path.includes('bill'))return;
    const c=SSE.content();
    let f=document.querySelector('footer.sfooter');
    if(!f){f=document.createElement('footer');f.className='sfooter';document.body.appendChild(f);}
    const yr=new Date().getFullYear();
    f.innerHTML=`<div class="wrap cols">
    <div class="fbrand"><a class="brand" href="index.html" style="filter:invert(0)"><span class="brand-mark">S</span><span style="color:#fff">Shree Shyam<small style="color:#8FA5D4">Industrial & Project Suppliers</small></span></a>
    <p>Bearings, belts, fasteners, pneumatics, tools and industrial electricals for plants that cannot stop. Authorized Polymatic Pneumatic distributor since 2009.</p>
    </div>
    <div><h5>Catalogue</h5><a href="shop.html">All items</a><a href="checkout.html">Checkout</a><a href="index.html#bulk">Project desk</a><a href="account.html">Your account</a></div>
    <div><h5>Reach us</h5><a href="tel:+917240107540">72401 07540</a><a href="tel:+9188797979884">98879 79884</a><a href="https://wa.me/917240107540">WhatsApp us</a><a href="mailto:shreeshyamenterprises7540@gmail.com">Email</a></div>
    <div><h5>Counter</h5><span>Shop No. 191, RIICO Hanuman Market Complex, Neemrana (Alwar), Rajasthan 301705</span><span>Open 9 to 8 · all days</span><span>GSTIN ${SSE.esc(c.gstin||'08SJHPS7017F1ZK')}</span></div>
    </div>
    <div class="wrap legal"><span>© ${yr} Shree Shyam Enterprises · Industrial & Project Suppliers</span>
    <span class="lgl"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="sitemap.xml">Sitemap</a></span></div>
    <div class="giant" aria-hidden="true">SHREE SHYAM</div>`;
    updateNavBadge();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',footer);else footer();

  return { all, put, seed, filter, page, PAGE, content, saveContent, fmt, esc, safeImg, seq, totals, logStock, motion, footer, updateNavBadge, $ };
})();
