/* The 6205 that carries the landing page.
   Modelled to real proportions (mm): bore 25, OD 52, width 15, 9 balls of 7.938.
   Position, scale and explode are keyed to scroll stops built from the sections. */
import * as THREE from './vendor/three.module.min.js';

const OD = 26, BORE = 12.5, HALF = 7.5, PITCH = 19.25, BALL = 3.969, GROOVE = 4.15, BALLS = 9;

/* Corner arc with tight flats either side, so Lathe's smoothed normals stay crisp. */
function corner(p, cx, cy, r, a0, a1) {
  for (let i = 0; i <= 6; i++) {
    const a = a0 + (a1 - a0) * i / 6;
    p.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
}
function groove(p, sign, yMax) {
  for (let i = 0; i <= 28; i++) {
    const y = yMax - 2 * yMax * i / 28;
    p.push(new THREE.Vector2(PITCH + sign * Math.sqrt(GROOVE * GROOVE - y * y), y));
  }
}
const Q = Math.PI / 2, c = .8, s = .35;

function outerProfile() {
  const p = [];
  corner(p, OD - c, HALF - c, c, 0, Q);
  corner(p, 21.6 + s, HALF - s, s, Q, Q * 2);
  groove(p, 1, 3.42);
  corner(p, 21.6 + s, -HALF + s, s, Q * 2, Q * 3);
  corner(p, OD - c, -HALF + c, c, Q * 3, Q * 4);
  p.push(p[0].clone());
  return p;
}
function innerProfile() {
  const p = [];
  corner(p, 17 - s, HALF - s, s, 0, Q);
  corner(p, BORE + c, HALF - c, c, Q, Q * 2);
  corner(p, BORE + c, -HALF + c, c, Q * 2, Q * 3);
  corner(p, 17 - s, -HALF + s, s, Q * 3, Q * 4);
  groove(p, -1, -3.49); // runs bottom to top along the raceway
  p.push(p[0].clone());
  return p;
}

/* One half of a riveted pressed cage: a ribbon that bulges round each ball pocket. */
function cageHalf(sign) {
  const seg = 720, r0 = 17.7, r1 = 20.8, t = .7, R = 4.45, flat = .42, secN = 12;
  const rect = [];
  for (let i = 0; i < secN; i++) {
    const k = i / secN * 4, e = Math.floor(k), f = k - e;
    rect.push([[r0 + (r1 - r0) * f, 0], [r1, t * f], [r1 - (r1 - r0) * f, t], [r0, t - t * f]][e]);
  }
  const pos = [], idx = [], step = Math.PI * 2 / BALLS;
  for (let i = 0; i <= seg; i++) {
    const th = i / seg * Math.PI * 2;
    const near = Math.round(th / step) * step, sd = (th - near) * PITCH;
    const y = Math.max(flat, Math.abs(sd) < R ? Math.sqrt(R * R - sd * sd) : 0);
    for (const [r, h] of rect) pos.push(Math.cos(th) * r, sign * (y + h), Math.sin(th) * r);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < secN; j++) {
    const a = i * secN + j, b = i * secN + (j + 1) % secN, d = a + secN, e = b + secN;
    if (sign > 0) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function etching() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2048;
  const x = cv.getContext('2d');
  x.translate(1024, 1024);
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.font = '500 70px "Geist Mono", ui-monospace, monospace';
  const arc = (str, at) => {
    const r = 1024 * (23.5 / 26), gap = .058;
    [...str].forEach((ch, i) => {
      x.save();
      x.rotate(at + (i - (str.length - 1) / 2) * gap);
      x.translate(0, -r);
      x.fillText(ch, 0, 24);
      x.restore();
    });
  };
  arc('6205', 0);
  arc('25 x 52 x 15', Math.PI);
  const t = new THREE.CanvasTexture(cv);
  t.anisotropy = 8;
  return t;
}

/* Softbox studio, built in code so the page needs no HDR download. */
function studio(renderer) {
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x6f6f6e, side: THREE.BackSide })));
  const panel = (w, h, col, p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0], col[1], col[2]), side: THREE.DoubleSide }));
    m.position.set(...p);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  panel(30, 9, [3.4, 3.4, 3.4], [0, 22, 8]);
  panel(9, 30, [3, 3, 3.1], [-24, 2, 10]);
  panel(6, 26, [2.2, 2.1, 2], [24, 4, 12]);
  panel(16, 24, [.02, .02, .02], [12, -4, 26]);
  panel(10, 26, [.02, .02, .02], [-10, 0, 27]);
  panel(46, 7, [.03, .03, .03], [0, 5, -26]);
  panel(46, 14, [.05, .05, .05], [0, -24, 4]);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, .025);
  pm.dispose();
  return rt.texture;
}

const KEYS = ['x', 'y', 's', 'rx', 'ry', 'rz', 'ex', 'a', 'fl'];
const ease = t => t * t * (3 - 2 * t);

export function start({ canvas, tags, onStops, box }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1.5 : 2));

  const scene = new THREE.Scene();
  scene.environment = studio(renderer);
  const camera = new THREE.PerspectiveCamera(22, 1, .1, 60);
  camera.position.z = 14;
  const VH = 14 * Math.tan(THREE.MathUtils.degToRad(11)); // half-height of view at z=0

  const steel = new THREE.MeshStandardMaterial({ color: 0xdedbd5, metalness: 1, roughness: .24 });
  const polished = new THREE.MeshStandardMaterial({ color: 0xeceef0, metalness: 1, roughness: .06 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb5853a, metalness: 1, roughness: .34 });

  const root = new THREE.Group();          // scroll transform
  const axle = new THREE.Group();          // model Y (bearing axis) lies along world Z
  axle.rotation.x = Q;
  root.add(axle);
  scene.add(root);
  const mesh = (g, m) => new THREE.Mesh(g, m);

  const outer = new THREE.Group(), inner = new THREE.Group(), balls = new THREE.Group(), cageA = new THREE.Group(), cageB = new THREE.Group();
  outer.add(mesh(new THREE.LatheGeometry(outerProfile(), 192), steel));
  inner.add(mesh(new THREE.LatheGeometry(innerProfile(), 192), steel));
  const mark = mesh(new THREE.RingGeometry(21.9, OD - .9, 128).rotateX(-Q),
    new THREE.MeshBasicMaterial({ color: 0x0e2f42, alphaMap: etching(), transparent: true, opacity: .62, polygonOffset: true, polygonOffsetFactor: -2 }));
  mark.position.y = HALF + .01;
  outer.add(mark);

  const ballIM = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL, 48, 32), polished, BALLS);
  balls.add(ballIM);
  const setBalls = spread => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < BALLS; i++) {
      const th = i / BALLS * Math.PI * 2, r = PITCH * spread;
      ballIM.setMatrixAt(i, m.makeTranslation(Math.cos(th) * r, 0, Math.sin(th) * r));
    }
    ballIM.instanceMatrix.needsUpdate = true;
  };
  setBalls(1);

  cageA.add(mesh(cageHalf(1), brass));
  cageB.add(mesh(cageHalf(-1), brass));
  const rivetIM = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.62, 1.1, 6, 16), brass, BALLS);
  for (let i = 0; i < BALLS; i++) {
    const th = (i + .5) / BALLS * Math.PI * 2;
    rivetIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(th) * PITCH, .55, Math.sin(th) * PITCH));
  }
  cageA.add(rivetIM);
  axle.add(outer, inner, balls, cageA, cageB);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 6, 8);
  scene.add(key);

  /* Fades the mirrored pass into whatever colour the page is behind the canvas. */
  const fadeMat = new THREE.ShaderMaterial({
    uniforms: { uY: { value: 0 }, uStrength: { value: .4 }, uResY: { value: 1 } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform float uY;uniform float uStrength;uniform float uResY;
      void main(){float d=clamp((uY-gl_FragCoord.y)/uResY,0.,1.);
      float a=1.-uStrength*pow(1.-smoothstep(0.,.34,d),1.6);gl_FragColor=vec4(0.,0.,0.,a);}`,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const fadeScene = new THREE.Scene();
  const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat);
  fadeQuad.frustumCulled = false;
  fadeScene.add(fadeQuad);

  let W = 1, H = 1, aspect = 1, stops = [];
  const cur = {}; let target = {};

  function resize() {
    W = box ? box.clientWidth : innerWidth; H = box ? box.clientHeight : innerHeight; aspect = W / H;
    renderer.setSize(W, H, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    fadeMat.uniforms.uResY.value = H * renderer.getPixelRatio();
    stops = onStops({ W, H, narrow: W < 820, fit: Math.min(1, aspect / 1.3) }).sort((p, q) => p.at - q.at);
    Object.assign(target, sample(scrollY));
    KEYS.forEach(k => { if (cur[k] === undefined) cur[k] = target[k]; });
    dirty = true;
  }

  function sample(y) {
    if (y <= stops[0].at) return stops[0];
    for (let i = 1; i < stops.length; i++) if (y <= stops[i].at) {
      const a = stops[i - 1], b = stops[i], raw = (y - a.at) / Math.max(1, b.at - a.at), t = b.lin ? raw : ease(raw), o = {};
      KEYS.forEach(k => { o[k] = a[k] + (b[k] - a[k]) * t; });
      return o;
    }
    return stops[stops.length - 1];
  }

  const worldTag = new THREE.Vector3();
  const tagParts = [
    { obj: outer, p: [0, 0, -OD] }, { obj: cageB, p: [0, -2, -20.8] },
    { obj: balls, p: [0, 0, -PITCH - BALL] }, { obj: inner, p: [0, 0, -17] },
  ];
  function placeTags(ex) {
    if (!tags) return;
    const show = ex > .5 && W >= 820 ? (ex - .5) * 2 : 0;
    tags.parent.style.opacity = show;
    if (!show) return;
    tags.items.forEach((el, i) => {
      const t = tagParts[i];
      worldTag.set(...t.p);
      t.obj.localToWorld(worldTag).project(camera);
      const x = (worldTag.x + 1) / 2 * W, y = (1 - worldTag.y) / 2 * H;
      el.style.transform = `translate(${x.toFixed(1)}px,${(y - 12).toFixed(1)}px)`;
    });
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dirty = true, spin = 0, last = performance.now(), heroActive = true;
  addEventListener('scroll', () => { target = sample(scrollY); dirty = true; }, { passive: true });
  addEventListener('resize', resize);

  function frame(now) {
    if (!canvas.isConnected) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    let moving = false;
    const damp = reduce ? 1 : 1 - Math.exp(-dt * 9);
    KEYS.forEach(k => {
      const d = target[k] - cur[k];
      if (Math.abs(d) > .0004) { cur[k] += d * damp; moving = true; } else cur[k] = target[k];
    });
    heroActive = !box && scrollY < H * 1.2 && !reduce;
    if (!moving && !dirty && !heroActive) return;
    dirty = false;
    if (heroActive) spin += dt * .35;

    canvas.style.opacity = cur.a.toFixed(3);
    if (cur.a < .01) return;

    const unit = VH * cur.s / 52; // cur.s = outer diameter as a share of half the view height
    const wx = cur.x * VH * aspect, wy = cur.y * VH;
    root.position.set(wx, wy, 0);
    root.scale.setScalar(unit);
    root.rotation.set(cur.rx, cur.ry, cur.rz);

    const roll = -wx / (unit * OD);   // true rolling across the floor
    const ex = cur.ex;
    outer.rotation.y = roll;
    inner.rotation.y = roll + spin;
    const cage = roll * .72 + spin * .42;
    balls.rotation.y = cageA.rotation.y = cageB.rotation.y = cage;

    outer.position.y = -40 * ex;
    cageB.position.y = -19 * ex;
    cageA.position.y = 19 * ex;
    inner.position.y = 40 * ex;
    setBalls(1 + .04 * ex);

    renderer.clear();
    const floor = wy - unit * OD;
    if (cur.fl > .01) {
      root.scale.y = -unit;
      root.position.y = 2 * floor - wy;
      root.rotation.set(-cur.rx, cur.ry, -cur.rz);
      root.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const p = new THREE.Vector3(0, floor, 0).project(camera);
      fadeMat.uniforms.uY.value = (p.y + 1) / 2 * H * renderer.getPixelRatio();
      fadeMat.uniforms.uStrength.value = .46 * cur.fl;
      renderer.render(fadeScene, camera);
      renderer.clearDepth();
      root.scale.y = unit;
      root.position.y = wy;
      root.rotation.set(cur.rx, cur.ry, cur.rz);
    }
    root.updateMatrixWorld(true);
    renderer.render(scene, camera);
    placeTags(ex);
  }

  resize();
  requestAnimationFrame(frame);
  (document.fonts?.ready || Promise.resolve()).then(resize);
  addEventListener('load', resize);
  new ResizeObserver(() => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); }).observe(document.body);
  return { renderer };
}
