/* Landing page behaviour. The site is static, so forms hand off to WhatsApp. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const WA = 'https://wa.me/917240107540?text=';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const openWA = msg => window.open(WA + encodeURIComponent(msg), '_blank', 'noopener');

/* Range ledger, from the company profile */
const RANGE = [
  ['Bearings', 'Ball, roller and pillow block bearings, with sleeves, pedestals and housings.', 'SKF, FAG, NBC, Nachi, URB, FLT, Asahi, IKO, INA, KCI, RMP, NRB, ZKL'],
  ['V-belts and timing belts', 'MXL, XL, L, H, XH-XXH, metric pitch, HTD 3M to 14M, Poly-V, round, flat, classical A to E, cogged, wedge, variable speed, lifting and spindle tapes.', 'Mitsuboshi, MBL, Megadyne, Bando, Gates, Optibelt, Contitech, Elatech, Carlisle, Nitta'],
  ['Nut bolts', 'Stainless steel, high tensile, brass, copper and aluminium fasteners, allen cap, grub and CSK screws, lock, wing and nylon nuts, spring washers, dowel pins, cotter pins, eye bolts.', 'Unbrako, TVS, LPS, APL, Kun, SFPL'],
  ['Circlips', 'Internal and external circlips, spring pins, snap rings, bearing washers, wave washers, stainless steel circlips.', ''],
  ['Oil seals and rubber goods', 'Oil seals, O-rings, PU seals, mechanical seals, rubber gaskets and bushes, rubber sheets in silicone, neoprene, nitrile and EPDM, electrical insulation mats, ready-cut gaskets.', 'Occo, Sunny, Rajhans, SKF'],
  ['Chain, pulley, sprocket and coupling', 'Transmission and conveyor chains, chain wheels, sprockets, elevator buckets, flexible and love-joy couplings, V-belt pulleys, timing pulleys, spur and bevel gears, universal joints.', 'Rolon, Diamond, Lovejoy, Unique Coupling, Fenner'],
  ['Trolley wheels', 'Fixed and swivel caster wheels, polymer, rubber tyre cast iron, red H.C. and P.C., and white virgin quality wheels.', ''],
  ['Hardware', 'Cutting tools, hand tools, and machine tools: drill chucks, revolving centres, flexible chucks, machine vices, milling arbors, pipe threading machines.', 'Taparia, Jalani, Everest, Venus, Stanley, Totem, Miranda, Sandvik, Addison'],
  ['Hydraulic and pneumatic equipment', 'Filters, regulators, lubricators and FRL units in mini, midi, maxi and standard, solenoid, hand lever, push-pull, foot, limit switch, flow control and ball valves.', 'Polymatic (authorised), Festo, Janatics, Norgren, Yuken, Airmatic, Airmax, Polyhydron, Rexroth, Tecno, Shako'],
  ['Pneumatic fittings', 'Push-in collet fittings in brass and resin, aluminium and brass fittings, hydraulic fittings, hose pipe, S.S., M.S. and G.I., copper and brass pipes with attachments.', ''],
  ['Pipe', 'Nylon tubing, blue soft flexible polyurethane (P.U.) tubing, nylon retractable coiled tubing.', ''],
  ['Valves', 'C.I., C.S., G.M., S.S. and PVC ball, gate, foot, butterfly, non-return and pressure safety valves.', ''],
  ['Gauges', 'Pressure, temperature and vacuum gauges, glycerin filled gauges, cocks, siphons, coil and U-type siphons.', ''],
  ['Adhesives', 'Instant bonding adhesives and WD-40 rust loosener.', 'Loctite, Super Glue, Fevikwik'],
  ['Mesh and perforated sheets', 'Perforated brass, copper, zinc, stainless, aluminium, galvanised, P.V.C. and plastic sheets, wire mesh, centrifuge bags, filter fabrics, air filtration cloth.', ''],
  ['Welding and safety', 'Inverter welding machines and transformers, copper and aluminium welding cables, hose pipes, electrode holders and torches, tungsten rods, gas regulators.', ''],
  ['Packing materials', 'PP strapping tools, fully automatic and semi-automatic PP strapping, polyester and PET strapping, stretch films, G.I. clips, box strapping rolls, double-sided, duct, floor marking and polyester tapes.', ''],
  ['Asbestos and non-asbestos packing', 'Gland packing, asbestos cloth and rope, ceramic tape and blanket, fillers, PTFE rods, sheets, bushes and rollers, cast nylon, Delrin and UHMWPE.', ''],
  ['Electrical', 'Motor starters, contactors, MCB, ACB, PCB, overload relays, fuse links, cable trays and glands, lugs, limit switches, proximity switches, control stations, sirens, hooters and thermocouples.', 'L&T, Siemens, BCH, GE, ABB, Crompton Greaves, Polycab, Teknic, Essen'],
];
$('#ledger').innerHTML = RANGE.map(([n, d, m], i) => `<details name="range">
  <summary><i>${String(i + 1).padStart(2, '0')}</i><span>${n}</span><em>${m ? m.split(', ').slice(0, 3).join(' / ') : ''}</em></summary>
  <div><p>${d}</p><p>${m ? 'Makes: ' + m : ''}</p></div></details>`).join('');

/* Reveals */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .2 });
$$('.rv, .lineup').forEach(el => io.observe(el));

/* Word-by-word */
const words = $('#words');
words.innerHTML = words.textContent.trim().split(/\s+/).map(w => `<span>${w}</span>`).join(' ');
const wordEls = $$('span', words);

/* How buying works: tabs that run on their own until someone takes over */
const flowTabs = $('#flowTabs'), tabs = $$('[role=tab]', flowTabs), fsteps = $$('.fstep', $('#flow'));
let step = 0, stopped = reduce, timer = 0;
function goStep(i, focus) {
  step = (i + tabs.length) % tabs.length;
  tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === step)); t.tabIndex = k === step ? 0 : -1; });
  fsteps.forEach((s, k) => s.classList.toggle('on', k === step));
  if (focus) tabs[step].focus();
  if (step === 0 && flowInView) playChat(CHAT_KEYS[chatTurn++ % 3]);
  armFlow();
}
function armFlow() {
  clearTimeout(timer);
  const run = !stopped && flowInView && !flowTabs.classList.contains('paused');
  const ms = step === 0 ? 11000 : 8000;
  flowTabs.classList.toggle('auto', !stopped);
  flowTabs.style.setProperty('--dur', ms + 'ms');
  if (run) timer = setTimeout(() => goStep(step + 1), ms);
}
const takeOver = () => { stopped = true; armFlow(); };
// The wide phone leans slightly toward the pointer.
if (!reduce && matchMedia('(hover:hover)').matches) $$('.fwide').forEach(box => {
  const fold = $('.fold', box);
  box.addEventListener('pointermove', e => {
    const r = box.getBoundingClientRect();
    fold.style.setProperty('--ty', ((e.clientX - r.left) / r.width - .5) * 7 + 'deg');
    fold.style.setProperty('--tx', (.5 - (e.clientY - r.top) / r.height) * 5 + 'deg');
  });
  box.addEventListener('pointerleave', () => { fold.style.removeProperty('--ty'); fold.style.removeProperty('--tx'); });
});
let flowInView = false;
tabs.forEach((t, i) => { t.onclick = () => { takeOver(); goStep(i); }; });
flowTabs.addEventListener('keydown', e => {
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (d) { e.preventDefault(); takeOver(); goStep(step + d, true); }
});
const flowEl = $('#flow');
['pointerenter', 'focusin'].forEach(ev => flowEl.addEventListener(ev, () => { flowTabs.classList.add('paused'); armFlow(); }));
['pointerleave', 'focusout'].forEach(ev => flowEl.addEventListener(ev, () => { flowTabs.classList.remove('paused'); armFlow(); }));
// Swipe between steps on touch screens
let swipeX = null;
flowEl.addEventListener('touchstart', e => { swipeX = e.touches[0].clientX; }, { passive: true });
flowEl.addEventListener('touchend', e => {
  const d = e.changedTouches[0].clientX - (swipeX ?? 0);
  if (swipeX !== null && Math.abs(d) > 48) { takeOver(); goStep(step + (d < 0 ? 1 : -1)); }
  swipeX = null;
}, { passive: true });
new IntersectionObserver(([e]) => {
  flowInView = e.isIntersecting;
  if (flowInView && step === 0 && !chatStarted) playChat(CHAT_KEYS[chatTurn++ % 3]);
  armFlow();
}, { threshold: .3 }).observe(flowEl);

/* The phone: each option plays the conversation that kind of customer really has */
const CHATS = {
  photo: [
    { me: 1, img: 'assets/land/tgvalve.webp', text: 'Yeh valve chahiye, 2 nos.' },
    { typing: 1300 },
    { text: 'Mil gaya. 4M310-08, Polymatic.' },
    { text: 'Sheet bhej rahe hain.', sheet: '1 item, rate and lead time' },
  ],
  part: [
    { me: 1, text: '6205 ZZ, 10 nos.' },
    { me: 1, text: 'V-belt A46, 4 nos.' },
    { typing: 1100 },
    { text: 'Mil gaya. Kaunsa make chahiye?' },
    { me: 1, text: 'SKF aur Mitsuboshi' },
    { typing: 1000 },
    { text: 'Sheet bhej rahe hain.', sheet: '2 items, rate and lead time' },
  ],
  boq: [
    { me: 1, file: ['Plant-BOQ.xlsx', 'Material list'] },
    { typing: 1500 },
    { text: 'BOQ mil gaya.' },
    { text: 'Line by line sheet bhej rahe hain.', sheet: 'Make, HSN and rate on each line' },
  ],
};
const CHAT_KEYS = Object.keys(CHATS);
const thread = $('#phThread'), phOpts = $$('#phOpts button');
let chatRun = 0, chatTurn = 1, chatStarted = false, lastSide = '';
const pause = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
const toEnd = () => thread.scrollTo({ top: thread.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
function bubble(m) {
  const side = m.me ? 'me' : 'shop';
  if (side !== lastSide) {
    lastSide = side;
    const who = el('div', 'ph-who' + (m.me ? ' me' : ''));
    who.innerHTML = m.me ? '<span>You</span><i>Y</i>' : '<i><img src="assets/land/logo-mark-white.png" alt=""></i><span>Shree Shyam</span>';
    thread.appendChild(who);
  }
  const b = el('div', 'ph-msg ' + (m.me ? 'out' : 'in'));
  if (m.img) { const i = el('img'); i.src = m.img; i.alt = 'Valve with its nameplate'; b.appendChild(i); }
  if (m.file) {
    const f = el('div', 'ph-file'), t = el('span');
    f.append(el('u', '', 'XLS'), t);
    t.append(el('b', '', m.file[0]), el('small', '', m.file[1]));
    b.appendChild(f);
  }
  if (m.text) b.append(m.text);
  thread.appendChild(b);
  if (m.sheet) {
    const s = el('button', 'ph-msg in'), f = el('span', 'ph-file'), t = el('span');
    s.type = 'button';
    f.append(el('u', '', 'PDF'), t);
    t.append(el('b', '', 'Quote sheet'), el('small', '', m.sheet));
    s.appendChild(f);
    s.onclick = () => { takeOver(); goStep(1); };
    thread.appendChild(s);
  }
  toEnd();
}
async function playChat(key) {
  const run = ++chatRun;
  chatStarted = true;
  lastSide = '';
  thread.textContent = '';
  phOpts.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.chat === key)));
  await pause(450);
  for (const m of CHATS[key]) {
    if (run !== chatRun) return;
    if (m.typing) {
      if (reduce) continue;
      const t = el('div', 'ph-typing');
      t.append(el('i'), el('i'), el('i'));
      thread.appendChild(t); toEnd();
      await pause(m.typing);
      t.remove();
      if (run !== chatRun) return;
    } else { bubble(m); await pause(850); }
  }
}
phOpts.forEach(b => { b.onclick = () => { takeOver(); playChat(b.dataset.chat); }; });

/* Mosaic that resolves as it comes into view */
const mosaic = $('#mosaic'), mc = $('canvas', mosaic), mx = mc.getContext('2d');
const tiny = document.createElement('canvas'), tx = tiny.getContext('2d');
const photo = new Image();
photo.src = 'assets/land/family.webp';
let lastBlock = -1;
function drawMosaic(p) {
  if (!photo.complete || !photo.naturalWidth) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), W = mc.clientWidth * dpr | 0, H = mc.clientHeight * dpr | 0;
  if (!W || !H) return;
  if (mc.width !== W || mc.height !== H) { mc.width = W; mc.height = H; lastBlock = -1; }
  const block = Math.max(1, Math.round((1 - p) ** 2 * 64) * 2) * (p >= 1 ? 0 : 1);
  if (block === lastBlock) return;
  lastBlock = block;
  const scale = Math.max(W / photo.width, H / photo.height);
  const sw = W / scale, sh = H / scale, sx = (photo.width - sw) / 2, sy = (photo.height - sh) / 2;
  if (!block) { mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(photo, sx, sy, sw, sh, 0, 0, W, H); return; }
  const tw = Math.ceil(W / block / dpr), th = Math.ceil(H / block / dpr);
  tiny.width = tw; tiny.height = th;
  tx.drawImage(photo, sx, sy, sw, sh, 0, 0, tw, th);
  mx.imageSmoothingEnabled = false;
  mx.drawImage(tiny, 0, 0, tw, th, 0, 0, W, H);
}
photo.onload = () => { lastBlock = -1; tick(); };

/* Scroll-linked page state */
const turn = $('#turn'), turnLine = $('#turnLine'), air = $('#air');
let lastOn = 0;
const spy = [['#top', 0], ['#lake', 2], ['#bulk', 3]];
const lerpByte = (a, b, t) => Math.round(a + (b - a) * t);
function tick() {
  const H = innerHeight;

  const r = words.getBoundingClientRect();
  const wp = clamp((H * .86 - r.top) / (r.height + H * .42));
  const lit = reduce ? wordEls.length : Math.round(wp * wordEls.length);
  wordEls.forEach((w, i) => w.classList.toggle('on', i < lit));

  const t = turn.getBoundingClientRect();
  const dark = clamp((H * .55 - t.top) / (H * .7));
  const bg = `rgb(${lerpByte(255, 243, dark)},${lerpByte(255, 244, dark)},${lerpByte(255, 246, dark)})`;
  document.body.style.backgroundColor = bg;
  turnLine.style.opacity = clamp((-t.top / H - .1) / .3) * clamp((t.bottom - H * .55) / (H * .3));
  SSE.hdr.dark(dark > .55);
  $('meta[name=theme-color]').content = dark > .55 ? '#ffffff' : '#ffffff';

  const m = mosaic.getBoundingClientRect();
  drawMosaic(reduce ? 1 : clamp((H * .95 - m.top) / (m.height * .95)));

  let on = 0;
  spy.forEach(([s, i]) => { if ($(s).getBoundingClientRect().top < H * .4) on = i; });
  if (on !== lastOn) { lastOn = on; SSE.hdr.active(on); }
}
let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; tick(); });
}, { passive: true });
addEventListener('resize', tick);
tick();

/* Forms */
$('#askForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#askInput').value.trim();
  openWA(q ? `Namaste, yeh part chahiye: ${q}` : 'Namaste, mujhe industrial parts quote chahiye');
});
$('#bulkForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, msg = $('#bulkMsg');
  const v = k => f.elements[k].value.trim();
  const miss = ['name', 'phone', 'list'].find(k => !v(k));
  if (miss) { msg.textContent = 'Please fill in your name, phone and material list.'; f.elements[miss].focus(); return; }
  msg.textContent = '';
  openWA(`Namaste, quote chahiye.\nName: ${v('name')}\nPhone: ${v('phone')}\n\nMaterial list:\n${v('list')}`);
});

/* 3D bearing: anything failing here leaves a complete page with the SVG fallback */
function hasGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
if (!hasGL()) document.documentElement.classList.add('no-gl');
else import('./bearing.js').then(({ start }) => {
  const tagsEl = $('#tags');
  start({
    canvas: $('#stage'),
    tags: { parent: tagsEl, items: $$('.tag', tagsEl) },
    onStops({ H, narrow, fit }) {
      const top = s => $(s).getBoundingClientRect().top + scrollY;
      const intro = top('#intro'), introEnd = intro + $('#intro').offsetHeight - H;
      const say = top('#say'), an = top('#anatomy'), anLen = $('#anatomy').offsetHeight - H;
      const how = top('#how'), tn = top('#turn'), tnLen = $('#turn').offsetHeight - H, airTop = top('#air');
      const S = v => v * (narrow ? Math.max(fit, .62) : 1);
      const exY = narrow ? .36 : -.03, exS = narrow ? .42 : .8;
      const st = (at, o) => ({ at, x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0, ex: 0, a: 1, fl: 0, ...o });
      return [
        st(0, { y: narrow ? .4 : .34, s: S(.92), rx: .32, ry: -.62, rz: .1 }),
        st(intro, { x: narrow ? 0 : .36, y: narrow ? .38 : .02, s: narrow ? .86 : 1.5, rx: .04, ry: -.46, fl: narrow ? 0 : 1 }),
        st(introEnd, { x: narrow ? .12 : .46, y: narrow ? .38 : .02, s: narrow ? .9 : 1.55, rx: .03, ry: -.24, fl: narrow ? 0 : 1 }),
        st(say - H * .1, { x: 1.7, y: narrow ? .38 : .02, s: narrow ? .9 : 1.55, ry: -.24, fl: narrow ? 0 : 1, a: 1 }),
        st(say + 1, { x: 1.7, y: 0, s: 1.1, ry: -.24, a: 0 }),
        st(an - H * .9, { x: -1.7, y: -.02, s: S(1.1), ry: -.3, fl: 1, a: 0 }),
        st(an - H * .85, { x: -1.7, y: -.02, s: S(1.1), ry: -.3, fl: 1 }),
        st(an, { x: 0, y: .12, s: S(1.1), ry: -.45, fl: 1 }),
        st(an + anLen * .22, { x: 0, y: exY, s: exS, ry: -1.2, rx: .12, fl: 0 }),
        st(an + anLen * .62, { x: 0, y: exY, s: exS, ry: -1.2, rx: .12, ex: 1 }),
        st(an + anLen * .88, { x: 0, y: exY, s: exS, ry: -1.08, rx: .12, ex: 1 }),
        st(an + anLen, { x: 0, y: exY, s: exS, ry: -1.04, rx: .12, ex: 1 }),
        st(how, { x: 0, y: exY + 2, s: exS, ry: -1.04, rx: .12, ex: 1, lin: true }), // leaves at scroll speed with the pinned section
        st(how + 1, { x: 0, y: exY + 2, s: exS, ry: -1.04, rx: .12, ex: 1, a: 0 }),
        st(how + 2, { y: -1.6, s: S(1.5), ry: -.2, a: 0 }),
        st(tn - H * .55, { y: -1.6, s: S(1.5), ry: -.2, a: 0 }),
        st(tn - H * .5, { y: -1.6, s: S(1.5), ry: -.2, fl: 1 }),
        st(tn + tnLen * .55, { y: -.3, s: S(1.15), ry: -.28, rx: .05, fl: 1 }),
        st(airTop - H * .55, { y: -.3, s: S(1.15), ry: -.12, rx: .05, fl: 1 }),
        st(airTop, { y: .1, s: S(1), ry: -.12, fl: 1 }),
        st(airTop + 1, { y: .1, s: S(1), a: 0 }),
      ];
    },
  });
}).catch(err => {
  console.warn('3D stage unavailable', err);
  document.documentElement.classList.add('no-gl');
});
