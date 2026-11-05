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
  // One transaction for a whole import, so thousands of rows stay fast and all-or-nothing.
  async function putMany(list) {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('products', 'readwrite'), st = tx.objectStore('products');
      list.forEach(p => st.put(p));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async function del(id) {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('products', 'readwrite');
      tx.objectStore('products').delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function clearProducts() {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('products', 'readwrite');
      tx.objectStore('products').clear();
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function seed() {
    const have = await all();
    if (have.length) return have;
    try {
      const r = await fetch('data/catalog-001.json');
      const j = await r.json();
      await putMany(j.products);
      if (j.content) localStorage.setItem('sse_content', JSON.stringify(j.content));
      return j.products;
    } catch { return []; }
  }
  const content = () => { try { return JSON.parse(localStorage.getItem('sse_content') || '{}'); } catch { return {}; } };
  const saveContent = c => localStorage.setItem('sse_content', JSON.stringify(c));
  const fmt = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  // Escape anything rendered via innerHTML: product names (admin/CSV import),
  // order text (public form), customer names. Prevents stored XSS.
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Product images come from admin input and imports: site paths, http(s) and
  // uploaded photos only. Anything else, such as javascript:, gets the placeholder.
  const PLACEHOLDER = 'assets/img/plc-tools.svg';
  const safeImg = u => {
    if (!u) return PLACEHOLDER;
    if (/^data:image\/(webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(u)) return u;
    try { const x = new URL(u, location.href); if (x.protocol === 'http:' || x.protocol === 'https:') return esc(x.href); } catch {}
    return PLACEHOLDER;
  };
  // Broken product image: swap for the placeholder without inline handlers, which the CSP blocks.
  document.addEventListener('error', e => {
    const t = e.target;
    if (t.tagName !== 'IMG') return;
    if (t.classList.contains('mir')) t.remove();
    else if (!t.src.endsWith(PLACEHOLDER)) t.src = PLACEHOLDER;
  }, true);

  function filter(list, q, cat) {
    q = (q || '').toLowerCase();
    return list.filter(p =>
      (!cat || p.category === cat) &&
      (!q || (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)));
  }
  function page(list, n) { return list.slice((n - 1) * PAGE, n * PAGE); }

  /* Billing helpers */
  // Calendar date in the shop's own timezone. toISOString() is UTC and flips at 5:30 am IST.
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fy = (d = new Date()) => { const y = d.getFullYear() - (d.getMonth() < 3 ? 1 : 0); return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; };
  // GST invoice numbers run consecutively within a financial year.
  const seq = () => {
    const cur = fy(), kept = localStorage.getItem('sse_seq_fy');
    const v = kept === cur || !kept ? Number(localStorage.getItem('sse_seq') || '1') : 1;
    localStorage.setItem('sse_seq', String(v + 1));
    localStorage.setItem('sse_seq_fy', cur);
    return `SSE/${cur}/${String(v).padStart(4, '0')}`;
  };
  // Discount comes off the taxable value before GST, shared across lines by value.
  function totals(items, discount = 0) {
    const sub = items.reduce((a, it) => a + it.qty * it.rate, 0);
    const disc = Math.min(Math.max(0, Number(discount) || 0), sub);
    const keep = sub > 0 ? (sub - disc) / sub : 1;
    const gst = items.reduce((a, it) => a + it.qty * it.rate * keep * ((Number(it.gst_pct) || 0) / 100), 0);
    const taxable = sub - disc, exact = taxable + gst, grand = Math.round(exact);
    return { sub, disc, taxable, gst, keep, grand, round: grand - exact };
  }
  function logStock(id, delta, reason) {
    try {
      const a = JSON.parse(localStorage.getItem('sse_stocklog') || '[]');
      a.push({ id, delta, reason, date: new Date().toISOString() });
      localStorage.setItem('sse_stocklog', JSON.stringify(a.slice(-2000)));
    } catch {}
  }

  /* Reveal (single observer, no scroll listeners) */
  function motion() {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
    document.querySelectorAll('.rv').forEach(el => io.observe(el));
  }

  /* Cart is a shared list in localStorage, used by the catalogue, checkout and account pages. */
  const getCart = () => { try { return JSON.parse(localStorage.getItem('sse_cart') || '[]'); } catch { return []; } };
  const setCart = c => { localStorage.setItem('sse_cart', JSON.stringify(c)); updateNavBadge(); };
  const cartCount = () => getCart().reduce((a, c) => a + (Number(c.qty) || 0), 0);
  function updateNavBadge() {
    const n = cartCount();
    document.querySelectorAll('[data-nav-badge]').forEach(b => { b.textContent = n; b.hidden = !n; });
    document.dispatchEvent(new CustomEvent('sse:cart', { detail: n }));
  }

  function toast(msg) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts no-print'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  /* What customers see: the published catalogue, always fresh. Only the counter
     device overlays its own local edits (set when the console is unlocked). */
  async function catalog() {
    let pub = [];
    try {
      const r = await fetch('data/catalog-001.json', { cache: 'no-cache' });
      const j = await r.json();
      pub = j.products || [];
      if (j.content && !localStorage.getItem('sse_content')) localStorage.setItem('sse_content', JSON.stringify(j.content));
    } catch { return all(); }
    if (localStorage.getItem('sse_counter') !== '1') return pub;
    const local = await all();
    const map = new Map(pub.map(p => [p.id, p]));
    local.forEach(p => map.set(p.id, p));
    return [...map.values()];
  }

  const WA_NUMBER = '917240107540';
  const wa = text => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

  /* Shared header and footer for every customer page */
  const quoteLink = wa('Namaste, mujhe industrial parts quote chahiye');
  const LINKS = [['Home', 'index.html'], ['Catalogue', 'shop.html'], ['Range', 'index.html#lake'], ['Contact', 'index.html#bulk']];
  function chrome() {
    if (document.body.dataset.chrome === 'none') return;
    const path = (location.pathname.split('/').pop() || 'index').replace('.html', '').toLowerCase() || 'index';
    const onLink = LINKS.findIndex(l => l[1] === path + '.html');
    document.body.insertAdjacentHTML('afterbegin', `<header class="hdr no-print" id="hdr">
      <div class="hdr-bar">
        <a class="hdr-brand" href="index.html" aria-label="Shree Shyam Enterprises, home">
          <span class="hdr-logo"><img src="assets/land/logo-mark-ink.png" alt="" width="640" height="579"></span>
          <span class="hdr-word"><b>SHREE SHYAM</b><small>ENTERPRISES</small></span>
        </a>
        <nav class="hdr-nav" aria-label="Main"><span class="hdr-ink" aria-hidden="true"></span>
          ${LINKS.map((l, i) => `<a href="${l[1]}" class="hdr-link${i === onLink ? ' is-on' : ''}">${l[0]}</a>`).join('')}
        </nav>
        <div class="hdr-act">
          <a class="hdr-ghost" href="account.html">Account</a>
          <a class="hdr-cart" href="checkout.html" aria-label="Cart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.4l2.3 11h10.4l2-8H6.3"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg><span class="hdr-count" data-nav-badge hidden>0</span></a>
          <a class="hdr-cta" href="${quoteLink}" target="_blank" rel="noopener">Get a quote</a>
          <button class="hdr-burger" id="hdrMenu" aria-label="Open menu" aria-expanded="false" aria-controls="mnav"><i></i><i></i></button>
        </div>
      </div>
    </header>
    <div class="mnav no-print" id="mnav" hidden>
      <img class="mnav-mark" src="assets/land/logo-mark-ink.png" alt="" aria-hidden="true">
      <div class="mnav-grid">
        <nav aria-label="Mobile">
          ${[...LINKS, ['Your account', 'account.html'], ['Cart', 'checkout.html']].map((l, i) => `<a href="${l[1]}" style="--i:${i}"${l[1] === path + '.html' ? ' class="is-on" aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span><b>${l[0]}</b><i aria-hidden="true">→</i></a>`).join('')}
        </nav>
        <aside class="mnav-side">
          <p>On the shelf</p>
          <div class="mnav-shelf">
            ${[['Pneumatics', 'assets/land/p/p13.webp', 'polymatic'], ['Bearings', 'assets/land/pdf/bearings.webp', 'bearing'], ['Belts', 'assets/land/pdf/belts.webp', 'belt'], ['Valves', 'assets/land/p/p12.webp', 'valve']].map(t => `<a href="shop.html?q=${t[2]}"><img src="${t[1]}" alt="" loading="lazy"><span>${t[0]}</span></a>`).join('')}
          </div>
          <div class="mnav-card"><b>The counter</b><span>Shop 191, RIICO Hanuman Market, Neemrana</span><span>Open 9 to 8</span></div>
        </aside>
      </div>
      <div class="mnav-foot"><a class="mnav-go" href="${quoteLink}" target="_blank" rel="noopener">Get a quote on WhatsApp</a><a class="mnav-call" href="tel:+917240107540">Call the shop</a></div>
    </div>`);
    document.body.insertAdjacentHTML('beforeend', `<footer class="foot no-print" id="foot">
      <section class="foot-call">
        <div>
          <p class="foot-kicker">Line stopped?</p>
          <h2>Call the counter.<br><em>We'll find the part.</em></h2>
        </div>
        <div class="foot-reach">
          <a class="foot-phone" href="tel:+917240107540">+91 72401 07540</a>
          <a class="foot-wa" href="${wa('Namaste, requirement bhejni hai')}" target="_blank" rel="noopener">Send your list on WhatsApp</a>
        </div>
      </section>
      <div class="foot-stage" id="footStage" aria-hidden="true"><canvas></canvas></div>
      <div class="foot-top">
        <div class="foot-id">
          <img src="assets/land/logo-full-white.png" alt="Shree Shyam Enterprises" width="652" height="760" loading="lazy">
          <p>Industrial and project suppliers, and authorised Polymatic distributor.</p>
        </div>
        <div><h4>Visit</h4><p>Shop No. 191, RIICO Hanuman Market Complex, Neemrana (Alwar), Rajasthan 301705</p><p>Open 9 to 8</p></div>
        <div><h4>Shop</h4><a href="shop.html">Catalogue</a><a href="checkout.html">Cart</a><a href="account.html">Your account</a></div>
        <div><h4>Company</h4><a href="index.html#lake">Range</a><a href="index.html#air">Polymatic</a><a href="index.html#faq">FAQ</a></div>
        <div><h4>Reach us</h4><a href="tel:+919887979884">+91 98879 79884</a><a href="mailto:shreeshyamenterprises7540@gmail.com">Email us</a></div>
      </div>
      <div class="foot-word" aria-hidden="true"><span>Shree Shyam</span></div>
      <p class="foot-end"><span>© ${new Date().getFullYear()} Shree Shyam Enterprises</span><span>GSTIN 08SJHPS7017F1ZK</span><span><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></span></p>
    </footer>`);
    const foot = $('#foot');
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { foot.classList.add('in'); o.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' }).observe($('.foot-word', foot));
    // The bearing rolls in as you scroll, then opens. Loaded only when the footer is close.
    const stage = $('#footStage');
    if (stage.querySelector('canvas').getContext && document.createElement('canvas').getContext('webgl2')) {
      new IntersectionObserver(([e], o) => {
        if (!e.isIntersecting) return;
        o.disconnect();
        import('./bearing.js').then(({ start }) => start({
          canvas: stage.querySelector('canvas'), box: stage,
          onStops({ W, H }) {
            const top = stage.getBoundingClientRect().top + scrollY, v = innerHeight;
            // Fully open with the bearing centred under the header, and before the page runs out.
            const from = top - v, to = Math.max(from + 200, Math.min(top + H / 2 - (v + 70) / 2, document.documentElement.scrollHeight - v - 40));
            const at = f => from + (to - from) * f;
            const phone = W < 620, s = phone ? 1.25 : Math.min(1.5, W / H * .46), open = s * (phone ? .68 : .86);
            const st = (f, o2) => ({ at: at(f), x: 0, y: -.02, s, rx: .06, ry: -.14, rz: 0, ex: 0, a: 1, fl: 1, ...o2 });
            return [
              st(0, { x: -1.15, rz: 3.2 }),
              st(.43, {}),
              st(.67, {}),
              st(.82, { ry: -1.16, rx: .12, s: open }),
              st(1, { ry: -1.16, rx: .12, s: open, ex: 1 }),
            ];
          },
        })).catch(() => stage.remove());
      }, { rootMargin: '500px 0px' }).observe(stage);
    } else stage.remove();
    // Raking light: the sheet is lit from wherever the cursor is
    if (matchMedia('(hover:hover)').matches) foot.addEventListener('pointermove', e => {
      const r = foot.getBoundingClientRect();
      foot.style.setProperty('--lx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      foot.style.setProperty('--ly', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });

    const hdr = $('#hdr'), navEl = $('.hdr-nav', hdr), ink = $('.hdr-ink', hdr), links = [...hdr.querySelectorAll('.hdr-link')];
    const moveInk = el => {
      if (!el || !el.offsetWidth) { ink.style.opacity = 0; return; }
      ink.style.opacity = 1; ink.style.width = el.offsetWidth + 'px'; ink.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    const rest = () => moveInk(links.find(l => l.classList.contains('is-on')));
    links.forEach(l => l.addEventListener('pointerenter', () => moveInk(l)));
    navEl.addEventListener('pointerleave', rest);
    addEventListener('resize', rest);
    (document.fonts?.ready || Promise.resolve()).then(rest);
    rest();
    const onScroll = () => {
      hdr.classList.toggle('scrolled', scrollY > 24);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    onScroll();

    const menu = $('#mnav'), btn = $('#hdrMenu');
    const setMenu = open => {
      menu.hidden = !open;
      hdr.classList.toggle('menu-open', open);
      document.documentElement.classList.toggle('no-scroll', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.onclick = () => setMenu(menu.hidden);
    menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    addEventListener('resize', () => { if (innerWidth > 900) setMenu(false); });

    if (document.body.dataset.nav === 'dark') hdr.classList.add('dark');
    SSE_HDR.dark = v => hdr.classList.toggle('dark', v);
    SSE_HDR.active = i => { links.forEach((l, k) => l.classList.toggle('is-on', k === i)); rest(); };
    updateNavBadge();
  }
  const SSE_HDR = { dark() {}, active() {} };

  // Scripts sit at the end of body, so the page is parsed by now on every page.
  if (document.body) chrome(); else document.addEventListener('DOMContentLoaded', chrome);

  return { hdr: SSE_HDR, all, put, putMany, del, clearProducts, localDate, fy, seed, catalog, filter, page, PAGE, content, saveContent, fmt, esc, safeImg, seq, totals, logStock, motion, updateNavBadge, getCart, setCart, cartCount, toast, wa, $ };
})();


