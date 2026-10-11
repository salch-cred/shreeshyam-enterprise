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
  const fmt = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  // Escape anything rendered via innerHTML: product names (admin/CSV import),
  // order text (public form), customer names. Prevents stored XSS.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Product images are admin-pasted URLs — allow http(s) only, else placeholder.
  const safeImg = u => { try { const x = new URL(u, location.href); if (x.protocol === 'http:' || x.protocol === 'https:') return x.href; } catch {} return 'https://picsum.photos/seed/sse-fallback/800/600'; };

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
  /* Mobile bottom tabs: Home / Shop / Estimate / WhatsApp / Call. CSS shows them only on small screens. */
  function tabs(){
    if(document.querySelector('.mtabs'))return;
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    const cur=path.includes('shop')?'shop':path.includes('bill')?'billing':'home';
    const items=[
      ['index.html','home-01','Home',cur==='home'],
      ['shop.html','shopping-cart-01','Shop',cur==='shop'],
      ['billing.html','file-01','Estimate',cur==='billing','fab'],
      ['https://wa.me/919000000000?text=Namaste%2C%20mujhe%20rates%20chahiye','whatsapp','WhatsApp',false],
      ['tel:+919000000000','call','Call',false]];
    const n=document.createElement('nav');n.className='mtabs no-print';n.setAttribute('aria-label','Mobile');
    n.innerHTML=items.map(it=>{const c=[it[4]||'',it[3]?'on':''].join(' ').trim();
      return`<a href="${it[0]}"${it[3]?' aria-current="page"':''}${c?` class="${c}"`:''}><i class="hgi-stroke hgi-${it[1]}"></i><span>${it[2]}</span></a>`;}).join('');
    document.body.appendChild(n);
    if(cur!=='shop'&&!document.querySelector('.wafloat')){const w=document.createElement('a');
      w.className='wafloat no-print';w.href='https://wa.me/919000000000?text=Namaste%2C%20mujhe%20rates%20chahiye';
      w.setAttribute('aria-label','Chat on WhatsApp');w.innerHTML='<i class="hgi-stroke hgi-whatsapp"></i>';
      document.body.appendChild(w);}
  }
  return { all, put, seed, filter, page, PAGE, content, saveContent, fmt, esc, safeImg, seq, totals, logStock, motion, tabs, $ };
})();
