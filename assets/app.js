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
    initLiquidNav();
  }

  /* WhatsApp-style swappable liquid glass bottom navigation */
  function initLiquidNav() {
    const nav = document.querySelector('.mtabs');
    if (!nav || nav.__sse_swapped__) return;
    nav.__sse_swapped__ = true;
    const links = Array.from(nav.querySelectorAll('a'));
    if (!links.length) return;

    let startX = 0, startY = 0;
    nav.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].screenX;
      startY = e.changedTouches[0].screenY;
    }, { passive: true });

    nav.addEventListener('touchend', e => {
      const diffX = e.changedTouches[0].screenX - startX;
      const diffY = e.changedTouches[0].screenY - startY;
      if (Math.abs(diffX) > 42 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
        const currentIdx = links.findIndex(a => a.classList.contains('on'));
        if (currentIdx !== -1) {
          if (diffX < 0 && currentIdx < links.length - 1) {
            links[currentIdx + 1].click();
          } else if (diffX > 0 && currentIdx > 0) {
            links[currentIdx - 1].click();
          }
        }
      }
    }, { passive: true });

    // Global Cmd+K / Ctrl+K search shortcut (Figma / Webflow pattern)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const qInput = document.getElementById('q');
        if (qInput) {
          qInput.focus();
          qInput.select();
        } else {
          window.location.href = 'shop.html';
        }
      }
    });
  }

  /* Working Video Reels & Canva Motion Studio Engine */
  function initCanvaVideoStudio() {
    const canvas = document.getElementById('motionCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let currentReel = 1;
    let isPlaying = true;
    let isAudioOn = false;
    let animFrameId = null;
    let timeTick = 0;
    let durationSec = 90;
    let elapsedSec = 14;

    const titles = {
      1: 'Reel 01: FAG / SKF Bearing Precision Laser Runout & Spindle Test',
      2: 'Reel 02: Polymatic 5/2 Pneumatic High-Speed Solenoid Actuation',
      3: 'Reel 03: 25-Min Emergency Van Dispatch & GPS Tracking Corridor'
    };

    const stageTitle = document.getElementById('stageCurrentTitle');
    const stageBadge = document.getElementById('stageBadge');
    const btnPlayPause = document.getElementById('btnPlayPause');
    const playPauseIcon = document.getElementById('playPauseIcon');
    const timeDisplay = document.getElementById('videoTimeDisplay');
    const hudRpm = document.getElementById('hudLiveRpm');
    const hudMicron = document.getElementById('hudLiveMicron');
    const hudStatus = document.getElementById('hudLiveStatus');
    const canvaIframe = document.getElementById('canvaIframe');
    const btnResetToReels = document.getElementById('btnResetToReels');
    const playlistBtns = document.querySelectorAll('#reelPlaylist .reel-item-btn');

    // Canvas Motion Renderers
    function renderReel1(t) {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = '#060B19';
      ctx.fillRect(0, 0, w, h);

      // Grid background
      ctx.strokeStyle = 'rgba(30, 58, 138, 0.25)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // Laser test beam (red line across screen)
      const laserY = 270;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#EF4444';
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, laserY);
      ctx.lineTo(920, laserY);
      ctx.stroke();

      // Rotating Bearing Center (x: 480, y: 270)
      const cx = 480, cy = 270;
      const angle = t * 0.04;

      // Outer Ring
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, Math.PI * 2);
      ctx.stroke();

      // Outer ring highlight
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 148, 0, Math.PI * 2);
      ctx.stroke();

      // Inner Ring
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.stroke();

      // Inner shaft bore
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1D4ED8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Rotating Steel Balls (10 balls)
      const ballRadius = 16;
      const ballOrbit = 110;
      for (let i = 0; i < 10; i++) {
        const bAngle = angle + (i * Math.PI * 2 / 10);
        const bx = cx + Math.cos(bAngle) * ballOrbit;
        const by = cy + Math.sin(bAngle) * ballOrbit;

        // Ball gradient
        const g = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, ballRadius);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.4, '#CBD5E1');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Laser reflection point
      const rx = cx + 140;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#EF4444';
      ctx.beginPath();
      ctx.arc(rx, laserY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Sinusoidal Runout Oscilloscope Graph (Bottom Left)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.strokeRect(60, 360, 240, 120);
      ctx.fillRect(60, 360, 240, 120);

      ctx.fillStyle = '#38BDF8';
      ctx.font = '10px monospace';
      ctx.fillText('OSCILLOSCOPE: RUNOUT WAVE', 70, 378);

      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let ox = 0; ox < 220; ox++) {
        const oy = 420 + Math.sin((ox + t * 4) * 0.08) * 18 + (Math.sin(ox * 0.2) * 3);
        if (ox === 0) ctx.moveTo(70 + ox, oy);
        else ctx.lineTo(70 + ox, oy);
      }
      ctx.stroke();

      // Top HUD Overlay
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Manrope, sans-serif';
      ctx.fillText('OPTICAL RUNOUT & VIBRATION SENSOR (DIN 625)', 60, 50);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px Manrope, sans-serif';
      ctx.fillText('TARGET: FAG 6312-2Z · RADIAL RUNOUT SPEC: < 0.003 mm', 60, 72);

      // Fluctuate telemetry values
      if (t % 30 === 0 && hudRpm && hudMicron) {
        const rpm = 3238 + Math.floor(Math.sin(t) * 12);
        hudRpm.textContent = rpm.toLocaleString() + ' RPM';
        const mic = (0.0017 + Math.abs(Math.sin(t * 0.1)) * 0.0003).toFixed(4);
        hudMicron.textContent = mic + ' mm';
        hudStatus.textContent = 'PASS · 0.002mm MAX';
        hudStatus.style.color = '#10B981';
      }
    }

    function renderReel2(t) {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = '#060B19';
      ctx.fillRect(0, 0, w, h);

      // Pneumatic System Diagram Header
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Manrope, sans-serif';
      ctx.fillText('POLYMATIC 5/2 WAY HIGH-SPEED PNEUMATIC ACTUATOR', 60, 50);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px Manrope, sans-serif';
      ctx.fillText('SOLENOID PILOT 24V DC · 120 CYCLES/MIN · DRY COMPRESSED AIR 8.2 BAR', 60, 72);

      // Air Cylinder Body
      const cylX = 300, cylY = 200, cylW = 360, cylH = 140;
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4;
      ctx.fillRect(cylX, cylY, cylW, cylH);
      ctx.strokeRect(cylX, cylY, cylW, cylH);

      // Stroke motion (reciprocating piston)
      const strokeProgress = (Math.sin(t * 0.08) + 1) / 2; // 0 to 1
      const pistonX = cylX + 30 + (strokeProgress * (cylW - 120));

      // Piston Head
      ctx.fillStyle = '#1D4ED8';
      ctx.fillRect(pistonX, cylY + 10, 30, cylH - 20);

      // Piston Rod extending out right
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(pistonX + 30, cylY + (cylH / 2) - 14, 280, 28);

      // Valve Box below cylinder
      const vX = 400, vY = 380, vW = 160, vH = 90;
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.fillRect(vX, vY, vW, vH);
      ctx.strokeRect(vX, vY, vW, vH);

      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('POLYMATIC 5/2 SPOOL', vX + 15, vY + 28);

      // Port lines connecting
      const activePort = strokeProgress > 0.5 ? 'PORT A (EXTEND)' : 'PORT B (RETRACT)';
      ctx.strokeStyle = strokeProgress > 0.5 ? '#10B981' : '#38BDF8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(vX + 40, vY);
      ctx.lineTo(vX + 40, cylY + cylH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(vX + 120, vY);
      ctx.lineTo(vX + 120, cylY + cylH);
      ctx.stroke();

      // Flow pulse particles
      const pOffset = (t * 8) % 80;
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(vX + 40, vY - pOffset, 4, 0, Math.PI * 2);
      ctx.fill();

      // Digital Gauge on Left
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(60, 200, 180, 140);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.strokeRect(60, 200, 180, 140);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px monospace';
      ctx.fillText('SUPPLY PRESSURE', 75, 230);
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('8.24 BAR', 75, 265);
      ctx.fillStyle = '#10B981';
      ctx.font = '11px monospace';
      ctx.fillText('STATE: ' + activePort, 75, 305);

      if (t % 30 === 0 && hudRpm && hudMicron) {
        hudRpm.textContent = '120 CPM';
        hudMicron.textContent = '8.2 BAR';
        hudStatus.textContent = strokeProgress > 0.5 ? 'EXTENDING' : 'RETRACTING';
        hudStatus.style.color = '#38BDF8';
      }
    }

    function renderReel3(t) {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = '#060B19';
      ctx.fillRect(0, 0, w, h);

      // Radar & Route Map Overlay
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Manrope, sans-serif';
      ctx.fillText('RIICO NEEMRANA EMERGENCY DISPATCH VAN ROUTE', 60, 50);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px Manrope, sans-serif';
      ctx.fillText('LIVE GPS TELEMETRY · SPEED 48 KM/H · HUB: HANUMAN MARKET -> ZONE 2', 60, 72);

      // Map Grid Lines
      ctx.strokeStyle = 'rgba(30, 58, 138, 0.3)';
      ctx.lineWidth = 1;
      for (let x = 60; x < w - 60; x += 60) { ctx.beginPath(); ctx.moveTo(x, 100); ctx.lineTo(x, 480); ctx.stroke(); }
      for (let y = 100; y < 480; y += 50) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(w - 60, y); ctx.stroke(); }

      // Route Path (Neemrana Corridor NH-48)
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(120, 380); // Hanuman Market Hub
      ctx.lineTo(280, 320);
      ctx.lineTo(460, 240);
      ctx.lineTo(680, 210);
      ctx.lineTo(840, 160); // Plant Site
      ctx.stroke();

      // Hub Marker
      ctx.fillStyle = '#1D4ED8';
      ctx.beginPath();
      ctx.arc(120, 380, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px Manrope';
      ctx.fillText('HUB (SHOP 191)', 85, 410);

      // Destination Marker
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(840, 160, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('PLANT GATE (ZONE 2)', 760, 140);

      // Moving Van Marker on Path
      const vanProgress = ((t * 0.005) % 1);
      const vx = 120 + vanProgress * (840 - 120);
      const vy = 380 - (vanProgress * (380 - 160));

      // Van Pulse beacon
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vx, vy, 16 + (Math.sin(t * 0.2) * 6), 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(vx, vy, 8, 0, Math.PI * 2);
      ctx.fill();

      // Van Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('VAN RJ-32 (ACTIVE)', vx - 45, vy - 18);

      // ETA Box
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(60, 130, 220, 100);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.strokeRect(60, 130, 220, 100);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '11px monospace';
      ctx.fillText('SLA DISPATCH TIMER', 75, 155);
      ctx.fillStyle = '#10B981';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('18m 42s REMAINING', 75, 188);
      ctx.fillStyle = '#38BDF8';
      ctx.font = '11px monospace';
      ctx.fillText('DISTANCE: 3.4 KM', 75, 215);

      if (t % 30 === 0 && hudRpm && hudMicron) {
        hudRpm.textContent = '48 KM/H';
        hudMicron.textContent = '3.4 KM REMAINING';
        hudStatus.textContent = 'ON TIME (< 25 MIN SLA)';
        hudStatus.style.color = '#10B981';
      }
    }

    function renderLoop() {
      if (isPlaying) {
        timeTick++;
        if (timeTick % 60 === 0) {
          elapsedSec = (elapsedSec + 1) % durationSec;
          const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const ss = String(elapsedSec % 60).padStart(2, '0');
          if (timeDisplay) timeDisplay.textContent = `${mm}:${ss} / 01:30`;
        }

        if (currentReel === 1) renderReel1(timeTick);
        else if (currentReel === 2) renderReel2(timeTick);
        else if (currentReel === 3) renderReel3(timeTick);
      }
      animFrameId = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    // Reel switching
    playlistBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        playlistBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentReel = Number(btn.getAttribute('data-reel')) || 1;
        if (stageTitle) stageTitle.textContent = titles[currentReel];
        if (canvaIframe) canvaIframe.style.display = 'none';
        canvas.style.display = 'block';
        if (btnResetToReels) btnResetToReels.style.display = 'none';
      });
    });

    // Play / Pause toggle
    if (btnPlayPause && playPauseIcon) {
      btnPlayPause.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (isPlaying) {
          playPauseIcon.className = 'hgi-stroke hgi-pause';
        } else {
          playPauseIcon.className = 'hgi-stroke hgi-play';
        }
      });
    }

    // Audio toggle
    const btnAudio = document.getElementById('btnToggleAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (btnAudio && audioIcon) {
      btnAudio.addEventListener('click', () => {
        isAudioOn = !isAudioOn;
        if (isAudioOn) {
          audioIcon.className = 'hgi-stroke hgi-volume-high';
          btnAudio.style.background = 'rgba(29, 78, 216, 0.4)';
        } else {
          audioIcon.className = 'hgi-stroke hgi-volume-off';
          btnAudio.style.background = 'rgba(255, 255, 255, 0.08)';
        }
      });
    }

    // Fullscreen toggle
    const btnFullscreen = document.getElementById('btnFullscreenVideo');
    const screenBox = document.getElementById('canvaScreenBox');
    if (btnFullscreen && screenBox) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          screenBox.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Load Canva URL
    function loadCanvaUrl(url) {
      if (!url) return;
      let embedUrl = url.trim();

      // If user pasted full iframe tag, extract src
      const srcMatch = embedUrl.match(/src=["'](.*?)["']/);
      if (srcMatch && srcMatch[1]) embedUrl = srcMatch[1];

      // Clean and normalize Canva URL
      if (embedUrl.includes('canva.com/design/')) {
        if (!embedUrl.includes('?embed') && !embedUrl.includes('&embed')) {
          embedUrl = embedUrl.replace(/\/view(\?.*)?$/, '') + '/view?embed';
        }
      }

      if (canvaIframe) {
        canvaIframe.src = embedUrl;
        canvaIframe.style.display = 'block';
        canvas.style.display = 'none';
      }
      if (stageTitle) stageTitle.textContent = 'Canva Live Motion & Video Presentation';
      if (stageBadge) stageBadge.textContent = 'CANVA EMBED';
      if (btnResetToReels) btnResetToReels.style.display = 'inline-flex';
    }

    const inputUrl = document.getElementById('canvaUrlInput');
    const btnLoadCanva = document.getElementById('btnLoadCanva');
    if (btnLoadCanva && inputUrl) {
      btnLoadCanva.addEventListener('click', () => {
        const u = inputUrl.value.trim();
        if (u) {
          loadCanvaUrl(u);
        } else {
          alert('Please paste a Canva design embed link or view URL.');
        }
      });
    }

    // Demo Canva Reel
    const btnSampleCanva = document.getElementById('btnSampleCanva');
    if (btnSampleCanva) {
      btnSampleCanva.addEventListener('click', () => {
        // High quality industrial presentation embed demo
        const demoUrl = 'https://www.canva.com/design/DAGQ_8yJ3f0/view?embed';
        if (inputUrl) inputUrl.value = demoUrl;
        loadCanvaUrl(demoUrl);
      });
    }

    // Reset button back to live reels
    if (btnResetToReels) {
      btnResetToReels.addEventListener('click', () => {
        if (canvaIframe) canvaIframe.style.display = 'none';
        canvas.style.display = 'block';
        btnResetToReels.style.display = 'none';
        if (stageTitle) stageTitle.textContent = titles[currentReel];
        if (stageBadge) stageBadge.textContent = '60 FPS · 1080p';
      });
    }

    // Guide Modal
    const guideModal = document.getElementById('canvaGuideModal');
    const btnGuide = document.getElementById('btnCanvaGuide');
    const btnCloseGuide = document.getElementById('btnCloseCanvaGuide');
    const btnGotIt = document.getElementById('btnGotItCanva');

    if (btnGuide && guideModal) {
      btnGuide.addEventListener('click', () => guideModal.classList.add('open'));
    }
    if (btnCloseGuide && guideModal) {
      btnCloseGuide.addEventListener('click', () => guideModal.classList.remove('open'));
    }
    if (btnGotIt && guideModal) {
      btnGotIt.addEventListener('click', () => guideModal.classList.remove('open'));
    }
  }

  function initApp() {
    footer();
    initCanvaVideoStudio();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp);else initApp();

  return { all, put, seed, filter, page, PAGE, content, saveContent, fmt, esc, safeImg, seq, totals, logStock, motion, footer, updateNavBadge, initCanvaVideoStudio, $ };
})();

