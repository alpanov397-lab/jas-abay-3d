// =====================================================================
//  game.js — 3D сахна, кейіпкер, камера, кітап жинау тапсырмасы.
//  Мектептің өлшемдері мен бөлмелері layout.js-те, физика world.js-те.
// =====================================================================
(function () {
  const S = window.SCHOOL, SW = window.SchoolWorld;
  if (!window.THREE) { document.getElementById('err').style.display = 'flex'; return; }
  // ---------------- Фотореалистік рендер: PBR материалдар, sRGB түстер ----------------
  // Барлық MeshLambertMaterial физикалық негізделген MeshStandardMaterial-ға айналады,
  // hex түстер sRGB-ден сызықтық кеңістікке ауысады, canvas-текстуралар sRGB.
  (function () {
    const Std = THREE.MeshStandardMaterial, Basic = THREE.MeshBasicMaterial, CT = THREE.CanvasTexture;
    const lin = (m, p) => { if (p && p.color !== undefined && !(p.color && p.color.isColor)) m.color.convertSRGBToLinear(); return m; };
    THREE.MeshLambertMaterial = function (p) { p = Object.assign({ roughness: 0.85, metalness: 0 }, p || {}); return lin(new Std(p), p); };
    THREE.MeshBasicMaterial = function (p) { return lin(new Basic(p), p); };
    THREE.PBR = function (p) { return lin(new Std(p), p); };
    THREE.CanvasTexture = function (c) { const t = new CT(c); t.encoding = THREE.sRGBEncoding; return t; };
    THREE.Color.prototype.setSRGB = function (v) { return this.set(v).convertSRGBToLinear(); };
  })();
  const W = SW.buildWorld(S);
  const L = S.levels, CO = S.colors, B = S.building, C = S.corridor, H = S.hall, ST = S.stairs;
  const PI = Math.PI;

  // ---------------- Рендер ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = true;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe0f7');
  scene.fog = new THREE.Fog('#bfe0f7', 60, 160);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 0.62); scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.26); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.42); sun.position.set(30, 50, 40); scene.add(sun);
  // күн көлеңкесі тек ауланы қамтиды (ғимарат іші қараңғы болмауы үшін)
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 220 }); sun.shadow.radius = 3;
  sun.target.position.set(0, 0, 4); scene.add(sun.target);
  const shadowCasters = [];
  const cast = (o) => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; } }); shadowCasters.push(o); return o; };

  // ---------------- Көмекші функциялар ----------------
  const occluders = [];               // камера өтпейтін заттар
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  const M = (color, extra) => {
    if (extra && extra.map) return new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
    const k = color + (extra ? JSON.stringify(extra) : '');
    return mats[k] || (mats[k] = new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})));
  };
  // Қораптың шекарасы бойынша құру: x0..x1, y0..y1, z0..z1
  function boxR(x0, x1, y0, y1, z0, z1, mat, o) {
    o = o || {};
    const m = new THREE.Mesh(o.geo || UNIT, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(m);
    if (o.occ) occluders.push(m);
    if (o.col) W.col(x0, x1, z0, z1, y0, y1, { kind: 'furn' });
    return m;
  }
  const boxC = (cx, cy, cz, sx, sy, sz, mat, o) => boxR(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, mat, o);

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  function rep(tex, rx, ry) {
    const t = tex.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
  }
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  function textTex(lines, o) {
    lines = [].concat(lines);
    return canvasTex(o.w, o.h, (g, w, h) => {
      if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.bw || 8; g.strokeRect(4, 4, w - 8, h - 8); }
      g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (o.vertical) {
        g.translate(w / 2, h / 2); g.rotate(-PI / 2);
        g.font = `${o.weight || 600} ${o.size}px ${FONT}`; g.fillText(lines[0], 0, 0);
      } else lines.forEach((t, i) => {
        const sz = (o.sizes && o.sizes[i]) || o.size;
        g.font = `${o.weight || 700} ${sz}px ${FONT}`;
        g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * o.size * (o.lh || 1.2));
      });
    });
  }
  const FACE = { '+z': 0, '-z': PI, '+x': PI / 2, '-x': -PI / 2 };
  function decal(cx, cy, cz, w, h, face, matOrTex, opts) {
    const mat = matOrTex.isTexture
      ? new THREE.MeshBasicMaterial(Object.assign({ map: matOrTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }, opts || {}))
      : matOrTex;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(cx, cy, cz); m.rotation.y = FACE[face]; scene.add(m); return m;
  }
  const flat = (color) => new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2 });

  // ---------------- Текстуралар (фотолардан) ----------------
  const TX = {};
  // Биіктік картасынан normal map жасау (беттің бедері жарықта көрінуі үшін)
  function normalFrom(w, h, drawH, strength) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); drawH(g, w, h);
    const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), o = out.data;
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.LinearEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Кірпіш: әр кірпіштің реңкі әртүрлі, ойық жіктер, кедір-бұдырлы бет
  const BRICKS = []; for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) BRICKS.push([k * 128 + (r % 2) * 64, r * 32, rnd(-14, 14), rnd(0.2, 0.9)]);
  TX.brick = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#c9c3b8'; g.fillRect(0, 0, w, h);
    for (const [x, y, v] of BRICKS) {
      const c = new THREE.Color(CO.brick); const hsl = {}; c.getHSL(hsl);
      g.fillStyle = `hsl(${hsl.h * 360 + v * 0.3},${hsl.s * 100 + 4}%,${hsl.l * 100 + v * 0.35}%)`; g.fillRect(x + 3, y + 3, 122, 26);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,80,70' : '255,255,250'},${rnd(0.04, 0.12)})`; g.fillRect(x + rnd(3, 124), y + rnd(3, 28), rnd(1, 3), rnd(1, 3)); }
    }
  });
  TX.brickN = normalFrom(512, 256, (g, w, h) => {
    g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, w, h);
    for (const [x, y] of BRICKS) { g.fillStyle = '#c8c8c8'; g.fillRect(x + 3, y + 3, 122, 26); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},0,0,0.15)`; g.fillRect(x + rnd(3, 124), y + rnd(3, 28), 3, 3); } }
  }, 2.2);
  // Шөп, бетон, тас төсеніш, мата
  TX.grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f8f3c'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k++) { const x = rnd(0, w), y = rnd(0, h), l = rnd(3, 8); g.strokeStyle = `hsl(${rnd(80, 110)},${rnd(35, 55)}%,${rnd(26, 46)}%)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-2, 2), y - l); g.stroke(); }
  });
  TX.grassN = normalFrom(256, 256, (g, w, h) => { for (let k = 0; k < 2200; k++) { g.fillStyle = `rgba(255,255,255,${rnd(0.1, 0.4)})`; g.fillRect(rnd(0, w), rnd(0, h), 1.5, rnd(3, 8)); } }, 2.5);
  TX.concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 3000; k++) { const v = rnd(150, 210); g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3)); }
  });
  TX.concreteN = normalFrom(256, 256, (g, w, h) => { for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},0,0,0.25)`; g.fillRect(rnd(0, w), rnd(0, h), 2, 2); } }, 1.6);
  TX.pavers = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8c8173'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { const x = k * 64 + (r % 2) * 32, y = r * 32; g.fillStyle = `hsl(${rnd(26, 34)},${rnd(14, 24)}%,${rnd(66, 76)}%)`; g.fillRect(x + 2, y + 2, 60, 28); }
  });
  TX.paversN = normalFrom(256, 256, (g, w, h) => { g.fillStyle = '#202020'; g.fillRect(0, 0, w, h); for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { g.fillStyle = '#d0d0d0'; g.fillRect(k * 64 + (r % 2) * 32 + 3, r * 32 + 3, 58, 26); } }, 2.4);
  TX.fabric = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${y % 4 ? 0.05 : 0.09})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(x, 0, 1, h); }
  });
  TX.fabricN = normalFrom(128, 128, (g, w, h) => {            // мата тоқымы + жұмсақ қатпарлар
    for (let y = 0; y < h; y++) { const v = 128 + Math.sin(y / h * Math.PI * 6) * 40 + Math.sin(y / h * Math.PI * 22) * 10; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, 0, 1, h); }
  }, 1.4);
  TX.denim = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 3) { g.strokeStyle = 'rgba(0,0,40,0.13)'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    for (let k = 0; k < 400; k++) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(rnd(0, w), rnd(0, h), 1, 2); }
  });
  TX.bark = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#5b4330'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,20,12' : '140,115,90'},0.5)`; g.lineWidth = rnd(1, 3); const x = rnd(0, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rnd(-6, 6), h); g.stroke(); }
  });
  TX.pattern = canvasTex(256, 256, (g, w, h) => {          // холлдағы өрнекті плитка
    g.fillStyle = '#e7e3da'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,140,125,0.35)'; g.lineWidth = 3;
    for (const [cx, cy] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
      g.beginPath(); g.arc(cx, cy, 26, 0, 2 * PI); g.stroke();
      g.beginPath(); g.moveTo(cx - 40, cy); g.quadraticCurveTo(cx, cy - 40, cx + 40, cy); g.quadraticCurveTo(cx, cy + 40, cx - 40, cy); g.stroke();
    }
    g.strokeStyle = '#6b5a4b'; g.lineWidth = 9;
    g.strokeRect(0, 0, w, h);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
  TX.tile = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = CO.tileLight; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9b7b0'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  });
  TX.laminate = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const v = 120 + Math.round(Math.random() * 25);
      g.fillStyle = `rgb(${v + 12},${v + 6},${v - 4})`; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(70,60,50,0.25)';
      for (let k = 0; k < 40; k++) g.fillRect(Math.random() * w, i * 32 + Math.random() * 30, 20 + Math.random() * 40, 1);
      g.fillStyle = 'rgba(60,50,40,0.6)'; g.fillRect(0, i * 32, w, 2);
      g.fillRect((i * 97) % w, i * 32, 2, 32);
    }
  });
  TX.lino = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c9cbcb'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) { g.fillStyle = Math.random() < 0.5 ? '#b3b6b7' : '#dfe0e0'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  TX.wood = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3f'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) { g.strokeStyle = `rgba(70,40,20,${0.15 + Math.random() * 0.25})`; g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 8, h / 3, x - 8, 2 * h / 3, x, h); g.stroke(); }
    g.fillStyle = 'rgba(60,35,15,0.5)'; g.fillRect(0, 0, 2, h);
  });
  TX.blinds = canvasTex(128, 128, (g, w, h) => {           // көк-сары-ақ перде
    const cols = [CO.blue, '#f2b21c', '#f4f4f4', '#f4f4f4', '#f4f4f4', '#f4f4f4', '#f2b21c', CO.blue];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 16, 0, 16, h); g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(i * 16 + 15, 0, 1, h); });
  });
  TX.strip = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = CO.yellowStrip; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160,110,0,0.35)'; for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 3, h);
  });
  TX.glass = canvasTex(64, 128, (g, w, h) => {            // күңгірт әйнек есік
    g.fillStyle = '#dfe9ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,140,145,0.35)';
    for (const y of [12, 24, 36, 48, 70, 92, 112]) g.fillRect(0, y, w, 3);
  });
  function logoDraw(g, cx, cy, s, color) {                  // мектеп эмблемасы (жеңілдетілген)
    g.fillStyle = color; g.beginPath();
    g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.8, cy + s * 0.8); g.lineTo(cx + s * 0.45, cy + s * 0.8);
    g.lineTo(cx, cy - s * 0.25); g.lineTo(cx - s * 0.45, cy + s * 0.8); g.lineTo(cx - s * 0.8, cy + s * 0.8); g.closePath(); g.fill();
    g.strokeStyle = color; g.lineWidth = s * 0.14; g.beginPath(); g.arc(cx, cy + s * 0.35, s * 0.2, PI * 0.2, PI * 1.6); g.stroke();
    g.fillRect(cx - s * 0.9, cy + s * 0.9, s * 1.8, s * 0.12);
  }
  TX.logo = canvasTex(512, 256, (g, w, h) => {
    logoDraw(g, w / 2, 60, 42, CO.gold);
    g.fillStyle = CO.navy; g.font = `700 78px ${FONT}`; g.textAlign = 'center'; g.fillText('Jas Abay', w / 2, 175);
    g.fillStyle = CO.gold; g.font = `500 30px ${FONT}`; g.fillText('M E K T E B I', w / 2, 225);
  });
  TX.receptionWall = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w * 0.62, h); g.rotate(-0.62);
    g.fillStyle = CO.blue; g.fillRect(-60, -40, 700, 34); g.fillStyle = CO.orange; g.fillRect(-60, -6, 700, 34);
    g.restore();
    g.save(); g.translate(-40, h * 0.9); g.rotate(-0.62);
    g.fillStyle = CO.orange; g.fillRect(0, -30, 260, 30); g.fillStyle = CO.blue; g.fillRect(0, 0, 260, 30);
    g.restore();
  });
  TX.spines = canvasTex(256, 64, (g, w, h) => {
    const cols = ['#2b6cb0', '#c0392b', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#f1c40f', '#34495e'];
    let x = 0; while (x < w) { const bw = 6 + Math.random() * 10; g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, 6 + Math.random() * 10, bw - 1, h); x += bw; }
  });
  TX.mirror = canvasTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#dfe8ee'); gr.addColorStop(1, '#bfcdd6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    logoDraw(g, w / 2, 80, 40, '#e0601e');
    g.fillStyle = CO.navy; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.fillText('Jas Abay', w / 2, 190);
    g.fillStyle = '#2b3f8f'; g.font = `italic 34px ${FONT}`; g.fillText('Жауапкершілік —', w / 2, 270); g.fillText('өз таңдауың', w / 2, 315);
  });
  TX.abay = canvasTex(384, 512, (g, w, h) => {
    // Абай портретінің ОРЫНЫ. Нақты муралдың фотосын қойғың келсе — README-ні қара.
    g.fillStyle = '#fbfbf9'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 10; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center';
    g.font = `800 96px ${FONT}`; g.fillText('АБАЙ', w / 2, h / 2 - 20);
    g.font = `500 34px ${FONT}`; g.fillText('Құнанбайұлы', w / 2, h / 2 + 40);
    g.font = `400 26px ${FONT}`; g.fillText('1845 — 1904', w / 2, h / 2 + 90);
  });
  TX.banner = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = CO.blue; g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
    g.fillStyle = '#e8b33a'; g.fillRect(22, 0, 10, h); g.fillRect(w - 32, 0, 10, h);
    logoDraw(g, w / 2, h / 2 - 50, 34, '#c8762a');
    g.fillStyle = '#222'; g.font = `700 40px ${FONT}`; g.textAlign = 'center'; g.fillText('Jas Abay', w / 2, h / 2 + 30);
    g.fillStyle = '#c8762a'; g.font = `500 18px ${FONT}`; g.fillText('M E K T E B I', w / 2, h / 2 + 62);
  });
  TX.spoon = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = CO.orange; g.beginPath(); g.ellipse(w / 2, 90, 42, 80, 0, 0, 2 * PI); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 10, 160); g.lineTo(w / 2 + 10, 160); g.lineTo(w / 2 + 14, 490); g.lineTo(w / 2 - 14, 490); g.fill();
  });
  TX.ornament = canvasTex(256, 512, (g, w, h) => {          // көк-сары қошқар мүйіз өрнегі
    g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2a51c'; g.beginPath(); g.moveTo(40, 0); g.lineTo(w - 50, 0); g.lineTo(w - 20, h); g.lineTo(10, h); g.fill();
    g.strokeStyle = '#1e3a8a'; g.lineWidth = 34; g.lineCap = 'round';
    g.beginPath(); g.moveTo(150, 30); g.bezierCurveTo(90, 160, 200, 260, 140, 330); g.bezierCurveTo(80, 400, 40, 300, 110, 290); g.stroke();
    g.beginPath(); g.moveTo(130, 470); g.bezierCurveTo(60, 430, 70, 360, 140, 360); g.stroke();
  });
  TX.kzFlag = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#00a3c4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5c518'; g.beginPath(); g.arc(w / 2, h * 0.35, 24, 0, 2 * PI); g.fill();
    for (let a = 0; a < 32; a++) { const r1 = 30, r2 = 40, t = a / 32 * 2 * PI; g.fillRect(w / 2 + Math.cos(t) * r1, h * 0.35 + Math.sin(t) * r1, (Math.cos(t) * (r2 - r1)) || 2, (Math.sin(t) * (r2 - r1)) || 2); }
  });
  TX.schoolFlag = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = CO.blue; g.fillRect(w - 18, 0, 18, h); g.fillStyle = CO.orange; g.fillRect(w - 30, 0, 12, h);
    logoDraw(g, w / 2 - 10, h * 0.4, 26, CO.orange);
  });

  const WALLM = M(CO.wall);
  const brickFor = (w, h) => M('#ffffff', { map: rep(TX.brick, w / 3.2, h / 1.6), normalMap: rep(TX.brickN, w / 3.2, h / 1.6), roughness: 0.92 });

  // ---------------- Қабырғалар ----------------
  // BoxGeometry беттерінің реті: +x, -x, +y, -y, +z, -z
  for (const wb of W.walls) {
    const w = wb.x1 - wb.x0, h = wb.y1 - wb.y0, d = wb.z1 - wb.z0;
    let mat = WALLM;
    if (wb.style.startsWith('ext')) {
      const len = wb.axis === 'x' ? w : d, bm = brickFor(len, h);
      const idx = { '+x': 0, '-x': 1, '+z': 4, '-z': 5 }[wb.style.slice(3)];
      mat = [bm, bm, bm, WALLM, bm, bm];
      const inner = { 0: 1, 1: 0, 4: 5, 5: 4 }[idx]; mat[inner] = WALLM;
    }
    const m = boxR(wb.x0, wb.x1, wb.y0, wb.y1, wb.z0, wb.z1, mat, { geo: new THREE.BoxGeometry(1, 1, 1), occ: true });
    m.userData.wall = true; if (wb.style.startsWith('ext')) m.castShadow = true;
  }
  // Еденнің негізі, қабат аралық жабын, шатыр
  const BASE = M('#cfc9bf');
  boxR(B.x0, H.x0, 0, L.floor1, B.z0, B.z1, BASE, { occ: true });
  boxR(H.x1, B.x1, 0, L.floor1, B.z0, B.z1, BASE, { occ: true });
  boxR(H.x0, H.x1, 0, L.floor1, B.z0, C.z1, BASE, { occ: true });
  boxR(H.x0, H.x1, 0, L.reception, C.z1, B.z1, BASE, { occ: true });
  const SLAB = M('#fafaf8');
  boxR(B.x0, ST.x0, L.ceil1, L.floor2, B.z0, B.z1, SLAB, { occ: true });
  boxR(ST.x0, ST.x1, L.ceil1, L.floor2, ST.zBottom, B.z1, SLAB, { occ: true });
  boxR(ST.x1, B.x1, L.ceil1, L.floor2, B.z0, B.z1, SLAB, { occ: true });
  const roof = boxR(B.x0 - 0.3, B.x1 + 0.3, L.ceil2, L.ceil2 + 0.35, B.z0 - 0.3, B.z1 + 0.3,
    [M('#f4f4f1'), M('#f4f4f1'), M('#f4f4f1'), SLAB, M('#f4f4f1'), M('#f4f4f1')], { geo: new THREE.BoxGeometry(1, 1, 1), occ: true });

  // Еден беттері
  function floorPlane(x0, x1, z0, z1, y, tex, tile, color) {
    const w = x1 - x0, d = z1 - z0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      tex ? new THREE.MeshLambertMaterial({ map: rep(tex, w / tile, d / tile), color: color || '#ffffff' }) : M(color));
    m.rotation.x = -PI / 2; m.position.set((x0 + x1) / 2, y + 0.004, (z0 + z1) / 2);
    if (y < 0.5) m.receiveShadow = true;
    scene.add(m); occluders.push(m); return m;
  }
  const FLOOR_BY_TYPE = {
    classroom: [TX.lino, 1.2], teachers: [TX.laminate, 1.6], office: [TX.laminate, 1.6], library: [TX.laminate, 1.6],
    canteen: [TX.tile, 0.6], lab: [TX.tile, 0.6], medical: [TX.tile, 0.6], psychology: [TX.laminate, 1.6],
    wc: [TX.tile, 0.4], storage: [TX.tile, 0.6]
  };
  floorPlane(H.x0, H.x1, C.z1, B.z1, L.reception, TX.pattern, 1.2);
  floorPlane(H.x0, H.x1, B.z0, C.z1, L.floor1, TX.pattern, 1.2);
  floorPlane(B.x0, H.x0, C.z0, C.z1, L.floor1, TX.tile, 0.6);
  floorPlane(H.x1, B.x1, C.z0, C.z1, L.floor1, TX.tile, 0.6);
  floorPlane(B.x0, B.x1, C.z0, C.z1, L.floor2, TX.laminate, 1.6);
  floorPlane(H.x0, ST.x0, B.z0, C.z0, L.floor2, TX.laminate, 1.6);
  floorPlane(ST.x0, ST.x1, ST.zBottom, C.z0, L.floor2, TX.laminate, 1.6);
  for (const r of W.rooms) {
    if (r.type === 'reception') continue;
    const f = FLOOR_BY_TYPE[r.type] || [TX.tile, 0.6];
    floorPlane(r.x0, r.x1, r.z0, r.z1, r.base, f[0], f[1]);
  }
  // Сары бағыттау жолағы
  const stripMat = (w, d) => new THREE.MeshLambertMaterial({ map: rep(TX.strip, w / 0.3, d / 0.3) });
  function strip(x0, x1, z0, z1, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), stripMat(x1 - x0, z1 - z0));
    m.rotation.x = -PI / 2; m.position.set((x0 + x1) / 2, y + 0.009, (z0 + z1) / 2); scene.add(m);
  }
  strip(-0.16, 0.16, -6.2, -0.25, L.reception);
  strip(-0.6, 0.6, -6.25, -5.95, L.reception);
  strip(-0.16, 0.16, C.z0 + 0.6, C.z1, L.floor1);
  strip(B.x0 + 1, B.x1 - 1, C.z0 + 0.6, C.z0 + 0.92, L.floor1);
  strip(-0.16, 0.16, 1.0, 1.95, L.reception);

  // ---------------- Есіктер, жазулар, табличкалар ----------------
  const doorFrameM = M('#a7adb2');
  const glassM = new THREE.MeshLambertMaterial({ map: TX.glass });
  const lockedM = new THREE.MeshLambertMaterial({ color: '#7f8d93' });
  const doorMeshes = [];
  for (const d of W.doors) {
    const accent = d.floor === 1 ? CO.orange : CO.blue;
    const ceil = d.floor === 1 ? L.ceil1 : L.ceil2;
    const s = -d.intoRoom;                       // дәліз жағы (z бағыты)
    const face = s > 0 ? '+z' : '-z';
    const zf = d.z + s * 0.112;
    const top = d.y + d.h, r = d.room;
    // Түсті жолақ (есік ойығын жаппайды)
    const xs0 = d.x - 0.7, xs1 = d.x + 0.95, accM = flat(accent);
    decal((xs0 + d.x - 0.5) / 2, (d.y + ceil) / 2, zf, d.x - 0.5 - xs0, ceil - d.y, face, accM);
    decal((xs1 + d.x + 0.5) / 2, (d.y + ceil) / 2, zf, xs1 - d.x - 0.5, ceil - d.y, face, accM);
    decal(d.x, (top + ceil) / 2, zf, 1.0, ceil - top, face, accM);
    // Ағылшынша вертикаль жазу мен нөмір (фотодағыдай), жолақтың сыртында
    const tx = d.x + (s > 0 ? 1 : -1) * (-1.05);
    if (r.label) decal(tx, d.y + 1.25, zf, 0.42, 2.0, face, textTex(r.label, { w: 96, h: 512, fg: accent, size: r.label.length > 10 ? 52 : 70, vertical: true }));
    if (r.num) decal(tx, d.y + 2.55, zf, 0.55, 0.62, face, textTex(r.num, { w: 128, h: 144, fg: accent, size: 130 }));
    if (r.icon === 'spoon') decal(tx, d.y + 1.4, zf, 0.4, 1.6, face, TX.spoon);
    if (r.ornament) decal(d.x + (s > 0 ? 1 : -1) * 1.95, (d.y + ceil) / 2, zf, 1.5, ceil - d.y, face, TX.ornament);
    // Қазақша тақтайша
    decal(d.x, top + 0.28, zf + s * 0.003, 1.25, 0.3, face,
      textTex(r.name, { w: 512, h: 120, bg: '#ffffff', fg: CO.navy, size: r.name.length > 16 ? 40 : 50, border: accent, bw: 10 }));
    // Алюминий жақтау
    for (const sx of [-1, 1]) boxC(d.x + sx * (d.w / 2 + 0.03), d.y + d.h / 2, d.z, 0.07, d.h, 0.26, doorFrameM);
    boxC(d.x, top + 0.035, d.z, d.w + 0.13, 0.07, 0.26, doorFrameM);
    // Есік жармасы (топсасы оң жақта)
    const pivot = new THREE.Group(); pivot.position.set(d.x + d.w / 2, 0, d.z);
    const leafW = d.w - 0.04;
    const frame = new THREE.Mesh(UNIT, doorFrameM); frame.scale.set(leafW, d.h - 0.02, 0.05); frame.position.set(-leafW / 2, d.y + d.h / 2, 0);
    const pane = new THREE.Mesh(UNIT, d.locked ? lockedM : glassM); pane.scale.set(leafW - 0.16, d.h - 0.2, 0.06); pane.position.set(-leafW / 2, d.y + d.h / 2, 0);
    const handle = new THREE.Mesh(UNIT, M('#d0d4d6')); handle.scale.set(0.14, 0.03, 0.12); handle.position.set(-leafW + 0.12, d.y + 1.0, 0);
    pivot.add(frame, pane, handle); scene.add(pivot);
    pivot.rotation.y = d.intoRoom * (PI / 2) * d.angle;
    d.pivot = pivot; occluders.push(frame);
    doorMeshes.push(d);
  }

  // ---------------- Терезелер (сырты мен іші) ----------------
  const winFrame = M('#f4f4f2', { roughness: 0.35 });
  const winGlassOut = THREE.PBR({ color: '#22364a', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -2 });
  const blindsM = new THREE.MeshLambertMaterial({ map: TX.blinds });
  function windowAt(axis, c, along, y0, outSign) {
    const w = 1.5, h = 1.7, cy = y0 + 0.95 + h / 2;
    const face = axis === 'x' ? (outSign > 0 ? '+z' : '-z') : (outSign > 0 ? '+x' : '-x');
    const inFace = axis === 'x' ? (outSign > 0 ? '-z' : '+z') : (outSign > 0 ? '-x' : '+x');
    const P = (off) => axis === 'x' ? [along, cy, c + off] : [c + off, cy, along];
    let p = P(outSign * 0.115); decal(p[0], p[1], p[2], w + 0.16, h + 0.16, face, winFrame);
    p = P(outSign * 0.12); decal(p[0], p[1], p[2], w, h, face, winGlassOut);
    p = P(outSign * 0.125); decal(p[0], p[1], p[2], 0.07, h, face, winFrame);
    p = P(-outSign * 0.115); decal(p[0], p[1], p[2], w, h, inFace, blindsM);
    frame3D(axis, c + outSign * 0.115, along, cy, w, h, outSign);
  }
  // Көлемді терезе жақтауы: шығыңқы профиль, ортаңғы импост, бетон тұғыр (подоконник)
  const sillM = M('#ffffff', { map: TX.concrete, normalMap: TX.concreteN, roughness: 0.9 });
  function frame3D(axis, face, along, cy, w, h, outSign) {
    const bar = (a0, a1, y0, y1, d0, d1, m) => axis === 'x'
      ? boxR(along + a0, along + a1, y0, y1, Math.min(face + outSign * d0, face + outSign * d1), Math.max(face + outSign * d0, face + outSign * d1), m)
      : boxR(Math.min(face + outSign * d0, face + outSign * d1), Math.max(face + outSign * d0, face + outSign * d1), y0, y1, along + a0, along + a1, m);
    const hw = w / 2 + 0.08, t = 0.07;
    bar(-hw, hw, cy + h / 2, cy + h / 2 + t, 0, 0.06, winFrame);
    bar(-hw, -hw + t, cy - h / 2, cy + h / 2, 0, 0.06, winFrame); bar(hw - t, hw, cy - h / 2, cy + h / 2, 0, 0.06, winFrame);
    bar(-0.035, 0.035, cy - h / 2, cy + h / 2, 0, 0.045, winFrame);
    bar(-hw, hw, cy - h / 2 - 0.02, cy - h / 2 + 0.05, 0, 0.05, winFrame);
    bar(-hw - 0.06, hw + 0.06, cy - h / 2 - 0.09, cy - h / 2 - 0.02, 0, 0.16, sillM);
  }
  for (const f of [1, 2]) {
    const y0 = f === 1 ? L.floor1 : L.floor2;
    for (let x = -16.2; x <= 16.3; x += 3.6) {
      if (!(x > H.x0 - 0.9 && x < H.x1 + 0.9)) windowAt('x', B.z0, x, y0, -1);
    }
    for (const z of [-12, -2.5]) { windowAt('z', B.x0, z, y0, -1); windowAt('z', B.x1, z, y0, 1); }
  }

  // ---------------- Баспалдақ ----------------
  const stairM = M(CO.wood, { roughness: 0.45 }), railM = M('#3e1f14', { roughness: 0.4 });
  const n = ST.steps, run = (ST.zBottom - ST.zLanding) / n;
  const rise1 = (L.landing - L.floor1) / n, rise2 = (L.floor2 - L.landing) / n;
  for (let i = 0; i < n; i++) {
    boxR(ST.mid, ST.x1, L.floor1, L.floor1 + rise1 * (i + 1), ST.zBottom - run * (i + 1), ST.zBottom - run * i, stairM, { occ: true });
    boxR(ST.x0, ST.mid, L.floor1, L.landing + rise2 * (i + 1), ST.zLanding + run * i, ST.zLanding + run * (i + 1), stairM, { occ: true });
  }
  boxR(ST.x0, ST.x1, L.floor1, L.landing, ST.zBack, ST.zLanding, stairM, { occ: true });
  boxR(ST.mid + 0.05, ST.x1 - 0.05, L.floor1 + rise1 + 0.002, L.floor1 + rise1 + 0.006, ST.zBottom - 0.06, ST.zBottom - 0.01, M(CO.yellowStrip));
  // 2-саты астындағы ақ қабырға мен қара есік
  boxR(ST.x0, ST.mid, L.floor1, L.floor2 - 0.25, ST.zBottom - 0.02, ST.zBottom + 0.02, WALLM, { occ: true });
  decal((ST.x0 + ST.mid) / 2, L.floor1 + 1.05, ST.zBottom + 0.025, 0.85, 2.1, '+z', flat('#3a1d14'));
  // Тұтқа мен балясиналар
  // Жұмыр тұтқа, жоңғыланған баллюстрада (биіктігі 1-ге нормаланған)
  const RAILG = new THREE.CylinderGeometry(0.038, 0.038, 1, 12);
  const KNOB = new THREE.SphereGeometry(0.06, 14, 10);
  const BALG = new THREE.LatheGeometry([[0.001, 0], [0.026, 0], [0.026, 0.05], [0.014, 0.09], [0.02, 0.2], [0.011, 0.5], [0.018, 0.78], [0.012, 0.9], [0.022, 0.95], [0.022, 1], [0.001, 1]].map(p => new THREE.Vector2(p[0], p[1])), 10);
  function rail(xa, za, ya, xb, zb, yb, h) {
    h = h || 0.95;
    const a = new THREE.Vector3(xa, ya + h, za), b = new THREE.Vector3(xb, yb + h, zb);
    const len = a.distanceTo(b);
    const hr = new THREE.Mesh(RAILG, railM); hr.scale.set(1, len, 1);
    hr.position.copy(a).add(b).multiplyScalar(0.5); hr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); hr.castShadow = true; scene.add(hr);
    const cnt = Math.max(1, Math.round(len / 0.24));
    for (let i = 0; i <= cnt; i++) {
      const t = i / cnt, x = xa + (xb - xa) * t, z = za + (zb - za) * t, y = ya + (yb - ya) * t;
      const post = i === 0 || i === cnt;
      if (post) { boxR(x - 0.05, x + 0.05, y, y + h + 0.06, z - 0.05, z + 0.05, railM); const k = new THREE.Mesh(KNOB, railM); k.position.set(x, y + h + 0.11, z); scene.add(k); }
      else { const b2 = new THREE.Mesh(BALG, railM); b2.scale.y = h; b2.position.set(x, y, z); b2.castShadow = true; scene.add(b2); }
    }
  }
  rail(ST.mid, ST.zBottom, L.floor1, ST.mid, ST.zLanding, L.landing);
  rail(ST.x0, ST.zLanding, L.landing, ST.x0, ST.zBottom, L.floor2);
  rail(ST.x0, ST.zBack + 0.1, L.landing, ST.x0, ST.zLanding, L.landing);
  rail(ST.x0, ST.zBack + 0.1, L.floor2, ST.x0, ST.zBottom, L.floor2);
  rail(ST.mid, ST.zBottom, L.floor2, ST.x1 - 0.1, ST.zBottom, L.floor2);
  // Абай қабырғасы: портреттің орны + Jas Abay баннері
  decal(2.55, L.landing + 2.25, B.z0 + 0.112, 1.6, 2.1, '+z', TX.abay);
  decal(3.95, L.landing + 2.25, B.z0 + 0.112, 0.8, 2.4, '+z', TX.banner);
  // Сатының оң жақ қабырғасындағы көк постерлер
  for (let i = 0; i < 5; i++) {
    const z = ST.zBottom - 0.4 - i * 0.62, y = L.floor1 + 1.6 + (i + 0.5) * rise1 * n / 5;
    decal(ST.x1 - 0.112, y, z, 0.5, 0.26, '-x', textTex(['Jas Abay', 'ұлы тұлғалар'], { w: 256, h: 128, bg: CO.navy, fg: '#ffffff', size: 34, sizes: [34, 24] }));
  }

  // ---------------- Жиһаз ----------------
  const bookPts = S.books.map(b => [b.x, b.z]);
  const SLOTS = []; let curRoom = null;          // 3D реквизит орындары (props.js толтырады)
  function free(x0, x1, z0, z1) {
    for (const [bx, bz] of bookPts) if (bx > x0 - 0.45 && bx < x1 + 0.45 && bz > z0 - 0.45 && bz < z1 + 0.45) return false;
    for (const d of W.doors) {
      const zz0 = Math.min(d.z, d.z + d.intoRoom * 1.6), zz1 = Math.max(d.z, d.z + d.intoRoom * 1.6);
      if (x1 > d.x - 0.9 && x0 < d.x + 0.9 && z1 > zz0 && z0 < zz1) return false;
    }
    return true;
  }
  const F = (x0, x1, y0, y1, z0, z1, mat, col) => free(x0, x1, z0, z1) ? boxR(x0, x1, y0, y1, z0, z1, mat, { col: col !== false }) : null;

  function studentDesk(x, z, y, faceZ) {
    if (!free(x - 0.6, x + 0.6, z - 0.55, z + 0.55)) return;
    SLOTS.push({ k: 'sdesk', x, z, y, f: faceZ, room: curRoom });
    boxR(x - 0.6, x + 0.6, y + 0.72, y + 0.76, z - 0.25, z + 0.25, M('#e8e5dc'), { col: false });
    for (const sx of [-0.52, 0.52]) boxR(x + sx - 0.025, x + sx + 0.025, y, y + 0.72, z - 0.2, z + 0.2, M('#8a9095'));
    W.col(x - 0.6, x + 0.6, z - 0.25, z + 0.25, y, y + 0.76, { kind: 'furn' });
    for (const sx of [-0.28, 0.28]) {
      const cz = z + faceZ * 0.45;
      boxR(x + sx - 0.2, x + sx + 0.2, y + 0.42, y + 0.46, cz - 0.2, cz + 0.2, M('#6fbfa8'));
      boxR(x + sx - 0.2, x + sx + 0.2, y + 0.46, y + 0.86, cz + faceZ * 0.18, cz + faceZ * 0.22, M('#6fbfa8'));
      boxR(x + sx - 0.02, x + sx + 0.02, y, y + 0.42, cz - 0.02, cz + 0.02, M('#8a9095'));
    }
  }
  function officeDesk(x0, x1, z0, z1, y) {
    if (!free(x0, x1, z0, z1)) return;
    SLOTS.push({ k: 'odesk', x0, x1, z0, z1, y, room: curRoom });
    boxR(x0, x1, y + 0.72, y + 0.76, z0, z1, M('#cfae80'));
    boxR(x0 + 0.03, x1 - 0.03, y, y + 0.72, z0 + 0.03, z1 - 0.03, M('#26272b'));
    W.col(x0, x1, z0, z1, y, y + 0.76, { kind: 'furn' });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    boxC(cx, y + 0.98, cz, 0.5, 0.34, 0.04, M('#111'));
  }
  function shelf(x0, x1, z0, z1, y, h) {
    if (!free(x0, x1, z0, z1)) return;
    boxR(x0, x1, y, y + (h || 2), z0, z1, M('#d8c39d'), { col: true });
    const wx = x1 - x0, wz = z1 - z0, horiz = wx > wz, len = horiz ? wx : wz;
    const sm = new THREE.MeshLambertMaterial({ map: rep(TX.spines, len / 1.2, 1) });
    for (let k = 0; k < 4; k++) {
      const yy = y + 0.25 + k * 0.45;
      const m = new THREE.Mesh(UNIT, sm);
      if (horiz) { m.scale.set(wx - 0.08, 0.3, 0.02); m.position.set((x0 + x1) / 2, yy + 0.15, wz > 0 ? (z0 + z1) / 2 + (wz / 2 + 0.005) * (z0 > -7 ? -1 : 1) : 0); }
      else { m.scale.set(0.02, 0.3, wz - 0.08); m.position.set((x0 + x1) / 2 + (wx / 2 + 0.005) * (x0 < 0 ? 1 : -1), yy + 0.15, (z0 + z1) / 2); }
      scene.add(m);
    }
  }
  function board(x, y, z, w, face, dark) {
    SLOTS.push({ k: 'board', x, y, z, w, face, dark: !!dark, room: curRoom });
    decal(x, y, z, w + 0.08, 1.18, face, flat('#9aa1a6'));
    decal(x, y, z + 0.0005, w, 1.1, face, flat(dark ? '#16181b' : '#fbfbfb'));
  }
  function lamp(cx, cz, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    m.rotation.x = PI / 2; m.position.set(cx, y - 0.01, cz); scene.add(m);
  }

  function furnish(r) {
    curRoom = r;
    const y = r.base, front = r.side === 'front';
    const ix0 = r.x0 + 0.15, ix1 = r.x1 - 0.15;
    const zDoor = front ? r.z0 + 0.1 : r.z1 - 0.1, zOut = front ? r.z1 - 0.1 : r.z0 + 0.1;
    const inn = front ? 1 : -1;                    // есіктен ішке қарай
    const ceil = r.floor === 1 ? L.ceil1 : L.ceil2;
    const zMid = (r.z0 + r.z1) / 2, xMid = (r.x0 + r.x1) / 2;
    lamp(xMid, zMid, ceil); if (r.x1 - r.x0 > 6) { lamp(xMid - 2.5, zMid, ceil); lamp(xMid + 2.5, zMid, ceil); }
    const wallFace = (x) => x < xMid ? '+x' : '-x';
    switch (r.type) {
      case 'classroom': {
        board(ix0 + 0.012, y + 1.55, zMid, Math.min(3, Math.abs(r.z1 - r.z0) - 2), '+x', r.num === '10');
        officeDesk(ix0 + 0.5, ix0 + 1.1, zMid - 0.7, zMid + 0.7, y);
        for (let x = ix0 + 2.1; x < ix1 - 0.6; x += 1.55)
          for (let k = 0; k < 3; k++) studentDesk(x, zOut - inn * (1.1 + k * 1.35), y, inn);
        shelf(ix1 - 0.45, ix1, zOut - inn * 0.2 - 1.6 * (inn > 0 ? 1 : 0), zOut - inn * 0.2 + 1.6 * (inn > 0 ? 0 : 1), y, 2.0);
        decal(ix1 - 0.012, y + 1.6, zMid, 0.9, 0.65, '-x', flat('#f3c34a'));
        decal(ix1 - 0.013, y + 1.6, zMid, 0.8, 0.55, '-x', flat('#2f73c9'));
        break;
      }
      case 'teachers': {
        officeDesk(ix0 + 0.2, ix0 + 1.6, zDoor + 1.6, zDoor + 2.4, y);
        officeDesk(xMid - 1.2, xMid + 0.2, zMid + 0.3, zMid + 1.1, y);
        officeDesk(xMid + 0.2, xMid + 0.9, zMid + 0.3, zMid + 2.2, y);
        officeDesk(ix1 - 1.6, ix1 - 0.2, zDoor + 2.6, zDoor + 3.4, y);
        F(ix0, ix0 + 0.6, y, y + 2.1, zOut - 1.6, zOut - 0.8, M('#cdb38a'));
        shelf(ix1 - 0.45, ix1, zOut - 2.4, zOut - 1.6, y, 1.8);
        board(xMid + 2.2, y + 1.5, zOut - 0.012, 1.6, '-z');
        F(ix1 - 0.9, ix1 - 0.3, y, y + 0.9, zOut - 1.3, zOut - 0.8, M('#e9eaec'));   // принтер
        decal(xMid - 0.6, y + 1.5, zOut - 0.013, 1.1, 2.2, '-z', canvasTex(128, 256, (g, w, h) => {
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#20252b';
          g.beginPath(); g.moveTo(10, h - 6); g.lineTo(10, 70); g.arc(w / 2, 70, w / 2 - 10, PI, 0); g.lineTo(w - 10, h - 6); g.fill();
          g.fillStyle = '#fff'; g.fillRect(w / 2 - 3, 20, 6, h); g.fillRect(10, 130, w - 20, 6);
        }));
        break;
      }
      case 'office':
        officeDesk(xMid - 1.0, xMid + 1.0, zOut - inn * 2.2 - 0.45, zOut - inn * 2.2 + 0.45, y);
        F(ix1 - 0.5, ix1, y, y + 2.0, zOut - inn * 0.3 - 0.5, zOut - inn * 0.3 + 0.5, M('#cdb38a'));
        shelf(ix0, ix0 + 0.45, zMid - 1.0, zMid + 1.0, y, 2.0);
        break;
      case 'library':
        shelf(ix0, ix0 + 0.45, Math.min(zDoor, zOut) + 0.4, Math.max(zDoor, zOut) - 0.4, y, 2.2);
        shelf(ix0 + 0.6, ix1 - 0.2, zOut - 0.45 * (inn > 0 ? 1 : 0), zOut + 0.45 * (inn > 0 ? 0 : 1), y, 2.2);
        F(xMid - 0.4, xMid + 0.9, y + 0.72, y + 0.76, zMid + 0.6, zMid + 1.4, M('#e2c99a'));
        break;
      case 'canteen':
        for (let x = ix0 + 1.2; x < ix1 - 2.2; x += 2.6)
          for (const zz of [r.z0 + 1.4, r.z0 + 3.4]) {
            if (!free(x - 0.9, x + 0.9, zz - 0.8, zz + 0.8)) continue;
            boxR(x - 0.9, x + 0.9, y + 0.72, y + 0.76, zz - 0.4, zz + 0.4, M('#f2f2ef'), { col: true });
            boxR(x - 0.05, x + 0.05, y, y + 0.72, zz - 0.05, zz + 0.05, M('#8a9095'));
            for (const s of [-1, 1]) boxR(x - 0.85, x + 0.85, y + 0.42, y + 0.46, zz + s * 0.65 - 0.15, zz + s * 0.65 + 0.15, M('#e0812a'));
          }
        F(ix1 - 1.2, ix1 - 0.1, y, y + 1.0, r.z0 + 0.3, r.z1 - 1.5, M('#d9dcdf'));
        break;
      case 'lab':
        F(ix0, ix1, y, y + 0.9, zOut - inn * 0.7 - 0.35, zOut - inn * 0.7 + 0.35, M('#f1f1ee'));
        F(ix0, ix0 + 0.7, y, y + 0.9, zMid - 1.0, zMid + 1.0, M('#f1f1ee'));
        break;
      case 'medical':
        F(ix0 + 0.1, ix0 + 0.8, y, y + 0.55, zOut - inn * 0.4 - 1.0, zOut - inn * 0.4 + 1.0, M('#dfe8ea'));
        F(ix1 - 0.5, ix1, y, y + 1.9, zOut - inn * 0.3 - 0.4, zOut - inn * 0.3 + 0.4, M('#ffffff'));
        break;
      case 'psychology':
        F(xMid - 0.4, xMid + 0.4, y, y + 0.45, zMid + 0.2, zMid + 0.8, M('#cfae80'));
        for (const s of [-1, 1]) {
          const bb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), M(s > 0 ? '#e8a33c' : '#3c69b5'));
          bb.scale.set(1, 0.65, 1); bb.position.set(xMid + s * 0.9, y + 0.27, zMid + 1.4); scene.add(bb);
        }
        break;
    }
  }
  W.rooms.forEach(r => { if (r.type !== 'reception') furnish(r); });


  // ---------------- Анимациялы экрандар ----------------
  function screen(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
    return { tex, update(t) { draw(g, w, h, t); tex.needsUpdate = true; } };
  }
  const TV = screen(512, 288, (g, w, h, t) => {           // кіреберістегі теледидар: мектеп роликтері
    const slides = [
      { bg: ['#13254f', '#1746b5'], big: 'Jas Abay', small: 'мектебіне қош келдіңіз!' },
      { bg: ['#e0761e', '#f2b21c'], big: 'Оқы. Ойлан. Өс.', small: 'Кітап апталығы басталды' },
      { bg: ['#0f6b5c', '#1aa38a'], big: 'Абай оқулары', small: 'Қара сөздер · 15 қараша' }
    ];
    const dur = 4, k = Math.floor(t / dur) % slides.length, p = (t % dur) / dur, sl = slides[k];
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, sl.bg[0]); gr.addColorStop(1, sl.bg[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.save(); g.globalAlpha = 0.18; g.fillStyle = '#ffffff';
    for (let i = -2; i < 8; i++) { g.save(); g.translate(i * 90 + (t * 40) % 90, 0); g.rotate(0.5); g.fillRect(0, -50, 22, 500); g.restore(); }
    g.restore();
    const a = Math.min(1, p * 5, (1 - p) * 5);
    g.globalAlpha = a; logoDraw(g, w / 2, 70 - (1 - a) * 20, 30 + Math.sin(t * 3) * 2, '#f2c14e');
    g.fillStyle = '#ffffff'; g.textAlign = 'center';
    g.font = `800 ${52}px ${FONT}`; g.fillText(sl.big, w / 2, 160 + (1 - a) * 20);
    g.font = `500 26px ${FONT}`; g.fillText(sl.small, w / 2, 200);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#ffffff'; g.font = `600 20px ${FONT}`; g.textAlign = 'left';
    const msg = '  Jas Abay мектебі  •  Кітапханаға жаңа кітаптар келді  •  Шайханада түлектермен кездесу  •  ';
    const mw = g.measureText(msg).width, off = (t * 70) % mw;
    g.fillText(msg + msg + msg, -off, h - 14);
    for (let i = 0; i < 3; i++) { g.fillStyle = i === k ? '#ffffff' : 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(w / 2 - 20 + i * 20, 230, 5, 0, 7); g.fill(); }
  });
  const CCTV = screen(256, 144, (g, w, h, t) => {         // бақылау мониторы: 4 камера
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, w, h);
    const names = ['АУЛА', 'КІРЕБЕРІС', 'ХОЛЛ', '2-ҚАБАТ'];
    for (let i = 0; i < 4; i++) {
      const x = (i % 2) * w / 2, y = Math.floor(i / 2) * h / 2;
      g.fillStyle = ['#41505c', '#4e5a52', '#58524a', '#46505e'][i]; g.fillRect(x + 2, y + 2, w / 2 - 4, h / 2 - 4);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k < 12; k++) g.fillRect(x + 2 + Math.random() * (w / 2 - 6), y + 2 + Math.random() * (h / 2 - 6), 3, 1);
      const px = x + 20 + ((t * 18 + i * 37) % (w / 2 - 40));
      g.fillStyle = '#c9302c'; g.fillRect(px, y + h / 4 - 4, 6, 14);
      g.fillStyle = '#ffffff'; g.font = `600 10px ${FONT}`; g.fillText(names[i], x + 6, y + 13);
    }
    g.fillStyle = Math.floor(t * 2) % 2 ? '#ff3b30' : '#7a1c18'; g.beginPath(); g.arc(w - 10, 10, 4, 0, 7); g.fill();
  });
  TV.update(0); CCTV.update(0);

  // ---------------- Кіреберіс залы ----------------
  (function reception() {
    const y = L.reception, ceil = L.ceil1;
    // Сол жақ: ағаш панель, туылар, елтаңба
    decal(H.x0 + 0.112, (y + ceil) / 2, -2.5, 4.4, ceil - y, '+x', new THREE.MeshLambertMaterial({ map: rep(TX.wood, 3, 1) }));
    const pole = M('#c9a227');
    for (const [z, tex] of [[-1.5, TX.kzFlag], [-3.5, TX.schoolFlag]]) {
      boxR(H.x0 + 0.38, H.x0 + 0.42, y, y + 2.4, z - 0.02, z + 0.02, pole, { col: true });
      const fl = decal(H.x0 + 0.45, y + 1.65, z + 0.28, 0.5, 1.4, '+x', tex, { side: THREE.DoubleSide, transparent: false });
      fl.rotation.y = PI / 2 - 0.5;
    }
    const em = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 32), M(CO.gold));
    em.rotation.z = PI / 2; em.position.set(H.x0 + 0.13, y + 2.35, -2.5); scene.add(em);
    // Артқы қабырға: қара орындық пен үлкен теледидар (сол жақта), турникет
    boxR(-4.2, -2.3, y + 0.4, y + 0.48, C.z1 + 0.15, C.z1 + 0.65, M('#1d1d1f'), { col: true });
    boxR(-4.2, -2.3, y + 0.48, y + 0.85, C.z1 + 0.12, C.z1 + 0.2, M('#1d1d1f'));
    for (const x of [-4.1, -2.4]) boxR(x - 0.03, x + 0.03, y, y + 0.4, C.z1 + 0.2, C.z1 + 0.6, M('#1d1d1f'));
    boxR(-3.9, -2.4, y + 1.55, y + 2.4, C.z1 + 0.1, C.z1 + 0.16, M('#0d0d0f'));
    decal(-3.15, y + 1.975, C.z1 + 0.166, 1.42, 0.78, '+z', TV.tex, { transparent: false });
    decal(-3.2, (y + ceil) / 2, C.z1 + 0.112, 2.6, ceil - y, '+z', TX.receptionWall, { transparent: false });
    // Оң жақ: логотипті қабырға, ақ қабылдау үстелі, бақылау мониторы
    decal(H.x1 - 0.112, (y + ceil) / 2, -3.2, 6.2, ceil - y, '-x', TX.receptionWall, { transparent: false });
    decal(H.x1 - 0.115, y + 2.3, -3.2, 2.6, 1.3, '-x', TX.logo);
    boxR(2.35, 2.75, y, y + 1.1, -4.6, -1.3, M('#f5f5f3'), { col: true });
    boxR(2.75, 3.9, y, y + 1.1, -4.6, -4.2, M('#f5f5f3'), { col: true });
    boxR(2.3, 2.8, y + 1.1, y + 1.14, -4.65, -1.25, M('#ffffff'));
    boxR(2.32, 2.34, y + 0.95, y + 1.1, -4.55, -1.35, M('#e0761e'));        // күзгі жапырақ гирляндасы
    boxR(3.1, 3.6, y + 0.45, y + 0.5, -3.2, -2.7, M('#222'));
    boxR(3.1, 3.6, y + 0.5, y + 1.0, -2.75, -2.7, M('#222'));
    boxR(2.4, 3.6, y + 1.65, y + 2.3, C.z1 + 0.1, C.z1 + 0.15, M('#111'));
    decal(3.0, y + 1.97, C.z1 + 0.156, 1.12, 0.57, '+z', CCTV.tex, { transparent: false });
    // Терезе перделері (алдыңғы қабырға)
    // Аласа екі саты (қоңыр плитка) мен турникет
    const stepM = M('#5d4a40');
    boxR(-1.5, 1.5, y, y + 0.15, C.z1 + 0.35, C.z1 + 0.7, stepM, { occ: true });
    boxR(-1.5, 1.5, y, L.floor1, C.z1 + 0.1, C.z1 + 0.35, stepM, { occ: true });
    const steel = M('#c4c9cc');
    for (const x of [-0.8, 0.8]) {
      boxR(x - 0.15, x + 0.15, y, y + 1.05, C.z1 + 0.05, C.z1 + 0.45, steel);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), steel);
      arm.rotation.z = PI / 2; arm.position.set(x - Math.sign(x) * 0.4, y + 0.95, C.z1 + 0.25); scene.add(arm);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    disc.rotation.x = PI / 2; disc.position.set(0, ceil - 0.02, -3.2); scene.add(disc);
  })();

  // ---------------- Холл және дәліздер ----------------
  // Айна: турникет пен №9 кабинеттің арасында, артқы жарығы бар, үстінде логотип
  const mirror = (function () {
    const x0 = -3.8, x1 = -1.2, w = x1 - x0, cx = (x0 + x1) / 2, y0 = L.floor1 + 0.2, h = 2.3, cy = y0 + h / 2, z = C.z1 - 0.112;
    // артқы жарық (айна шетіндегі жұмсақ сәуле)
    const glow = canvasTex(256, 256, (g, cw, ch) => {
      g.shadowColor = 'rgba(255,246,220,1)'; g.shadowBlur = 36; g.strokeStyle = 'rgba(255,248,228,0.95)'; g.lineWidth = 10;
      for (let i = 0; i < 3; i++) g.strokeRect(34, 34, cw - 68, ch - 68);
    });
    decal(cx, cy, z - 0.004, w + 0.55, h + 0.55, '-z', glow, { blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [px, py, sw, sh] of [[cx, y0 + h + 0.015, w + 0.06, 0.03], [cx, y0 - 0.015, w + 0.06, 0.03], [x0 - 0.015, cy, 0.03, h], [x1 + 0.015, cy, 0.03, h]])
      decal(px, py, z - 0.006, sw, sh, '-z', new THREE.MeshBasicMaterial({ color: '#fff8e6' }));
    // шағылыс беретін әйнек
    const sheen = canvasTex(256, 256, (g, cw, ch) => {       // айна беті: күміс-көгілдір реңк пен жарық жолақтар
      const gr = g.createLinearGradient(0, 0, cw, ch); gr.addColorStop(0, '#f4f8fa'); gr.addColorStop(0.55, '#dfe7ec'); gr.addColorStop(1, '#cfdae1');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      g.save(); g.translate(cw * 0.15, 0); g.rotate(0.45);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(40, -60, 34, 420); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(92, -60, 12, 420);
      g.restore();
    });
    decal(cx, cy, z - 0.008, w, h, '-z', new THREE.MeshBasicMaterial({ map: sheen, polygonOffset: true, polygonOffsetFactor: -2 }));
    // үстіндегі сурет: логотип, жазу, сары жапырақ өрнегі
    const art = canvasTex(512, 452, (g, cw, ch) => {
      logoDraw(g, cw / 2, 62, 40, CO.gold);
      g.textAlign = 'center'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,0.9)';
      const txt = (t, x, y, font, color, lw) => { g.font = font; g.lineWidth = lw; g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y); };
      txt('Jas Abay', cw / 2, 170, `700 70px ${FONT}`, CO.navy, 10);
      txt('Жауапкершілік —', cw * 0.58, 250, `italic 600 30px ${FONT}`, '#2b3f8f', 7);
      txt('өз таңдауың', cw * 0.58, 290, `italic 600 30px ${FONT}`, '#2b3f8f', 7);
      const branch = (sx, sy, dir, len) => {
        g.strokeStyle = 'rgba(214,160,40,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx, sy);
        g.bezierCurveTo(sx + dir * 30, sy - len * 0.4, sx + dir * 10, sy - len * 0.7, sx + dir * 40, sy - len); g.stroke();
        for (let k = 1; k < 8; k++) {
          const t = k / 8, lx = sx + dir * (40 * t + Math.sin(t * 6) * 8), ly = sy - len * t;
          g.save(); g.translate(lx, ly); g.rotate(dir * (0.6 + (k % 2) * 0.9) - (k % 2 ? 1.6 : 0));
          g.fillStyle = k % 3 ? 'rgba(232,178,52,0.85)' : 'rgba(205,140,30,0.85)';
          g.beginPath(); g.ellipse(14, 0, 16, 6, 0, 0, 2 * PI); g.fill(); g.restore();
        }
      };
      branch(40, ch - 10, 1, 230); branch(cw - 40, ch - 10, -1, 200); branch(cw - 90, ch - 20, -1, 140);
      g.fillStyle = 'rgba(214,160,40,0.75)';
      for (let k = 0; k < 14; k++) { g.save(); g.translate(300 + Math.random() * 180, 120 + Math.random() * 240); g.rotate(Math.random() * 6); g.beginPath(); g.ellipse(0, 0, 8, 3, 0, 0, 2 * PI); g.fill(); g.restore(); }
    });
    decal(cx, cy + 0.05, z - 0.012, w * 0.94, w * 0.94 * 452 / 512, '-z', art);
    return { update() {} };
  })();
  decal(H.x0 + 0.112, L.floor1 + 1.6, -11.6, 1.6, 1.0, '+x',
    textTex(['МЕМЛЕКЕТТІК ҚЫЗМЕТ', 'ақпарат тақтасы'], { w: 512, h: 320, bg: '#bfe0f5', fg: '#1d4e89', size: 44, sizes: [44, 30], border: '#7fb6dc' }));
  F(H.x0 + 0.2, H.x0 + 0.7, L.floor1 + 0.72, L.floor1 + 0.76, -13.0, -11.9, M('#e2c99a'));
  for (const f of [1, 2]) {
    const ceil = f === 1 ? L.ceil1 : L.ceil2, base = f === 1 ? L.floor1 : L.floor2;
    for (let x = -16; x <= 16; x += 4) lamp(x, -8, ceil);
    lamp(-1.5, -11.5, ceil);
    // Дәліз шеттері
    if (f === 1) {
      decal(B.x0 + 0.112, base + 1.05, -8, 0.95, 2.1, '+x', flat('#f4f4f2'));
      decal(B.x0 + 0.113, base + 1.05, -8, 0.8, 1.9, '+x', flat('#e8e9e6'));
      decal(B.x0 + 0.114, base + 2.45, -8, 0.7, 0.2, '+x', textTex('ЗАПАСНОЙ ВЫХОД', { w: 256, h: 72, bg: '#1e9a4a', fg: '#fff', size: 26 }));
      decal(B.x1 - 0.112, base + 1.05, -8.3, 0.9, 2.1, '-x', flat('#f4f4f2'));
      F(B.x1 - 0.6, B.x1 - 0.1, base, base + 0.85, -7.8, -7.25, M('#ffffff'));
    } else {
      decal(B.x0 + 0.112, base + 1.3, -8, 1.6, 2.6, '+x', TX.banner);
      decal(B.x1 - 0.112, base + 1.25, -8, 1.6, 2.5, '-x', flat('#f6f6f4'));
      decal(B.x1 - 0.113, base + 1.2, -8, 1.4, 2.3, '-x', flat('#2a3138'));
      decal(B.x1 - 0.114, base + 1.2, -8, 0.06, 2.3, '-x', flat('#f6f6f4'));
      decal(B.x1 - 0.114, base + 2.75, -8, 0.5, 0.18, '-x', textTex('EXIT', { w: 128, h: 48, bg: '#1e9a4a', fg: '#fff', size: 32 }));
      // су кулері
      F(-4.2, -3.8, base, base + 1.0, -13.7, -13.3, M('#f2f2f2'));
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 16), M('#7fb2e0', { transparent: true, opacity: 0.8 }));
      bottle.position.set(-4.0, base + 1.22, -13.5); scene.add(bottle);
    }
  }
  // 1-қабаттағы сары стендтер (психолог тұсы)
  for (const x of [-10.4, -12.3]) {
    decal(x, L.floor1 + 1.55, C.z1 - 0.112, 1.3, 1.25, '-z', flat('#f5d330'));
    for (const [dx, dy] of [[-0.3, 0.25], [0.3, 0.25], [-0.3, -0.25], [0.3, -0.25]])
      decal(x + dx, L.floor1 + 1.55 + dy, C.z1 - 0.114, 0.48, 0.38, '-z', flat(dy > 0 ? '#2f62c2' : '#e8902a'));
  }


  // ---------------- Сыртқы көрініс ----------------
  // Фасад: ашық сұр кірпіш, алтын пилястрлар, ортасында үшбұрыш маңдайша (фотоға қарап)
  const GOLD = M(CO.pilaster), WHITE = M('#f6f6f3'), PZ = W.portico;
  const halfDisc = (x, y, z, r, mat) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28, 0, PI), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const glassOut = THREE.PBR({ color: '#22364a', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -2 }), goldFlat = flat(CO.pilaster), whiteFlat = flat('#ffffff');
  function frontWindow(x, y0, arch, zFace, w, h, inner) {
    if (zFace === undefined) zFace = B.z1; w = w || 1.4; h = h || 1.6; const cy = y0 + 0.95 + h / 2, z = zFace + 0.115;
    decal(x, cy, z, w + 0.34, h + 0.3, '+z', goldFlat);
    if (arch) halfDisc(x, cy + h / 2 + 0.15, z, (w + 0.34) / 2, goldFlat);
    decal(x, cy, z + 0.003, w + 0.12, h + 0.12, '+z', whiteFlat);
    if (arch) halfDisc(x, cy + h / 2 + 0.06, z + 0.003, (w + 0.12) / 2, whiteFlat);
    decal(x, cy, z + 0.006, w, h, '+z', glassOut);
    if (arch) halfDisc(x, cy + h / 2, z + 0.006, w / 2, glassOut);
    decal(x, cy, z + 0.009, 0.06, h, '+z', whiteFlat);
    boxR(x - w / 2 - 0.06, x + w / 2 + 0.06, y0 + 0.95 - 0.11, y0 + 0.95 - 0.03, z, z + 0.15, sillM);
    boxR(x - 0.03, x + 0.03, cy - h / 2, cy + h / 2, z, z + 0.04, winFrame);
    boxR(x - w / 2 - 0.03, x + w / 2 + 0.03, cy - h / 2 - 0.02, cy - h / 2 + 0.04, z, z + 0.05, winFrame);
    if (inner !== false) decal(x, cy, zFace - 0.115, w, h, '-z', blindsM);
  }
  for (const s of [-1, 1]) {
    for (const x of [9.2, 12.6, 16]) { frontWindow(s * x, L.floor1); frontWindow(s * x, L.floor2); }
    frontWindow(s * 3.8, L.floor1); frontWindow(s * 3.8, L.floor2, true);
    for (const x of [6.6, 17.75]) boxR(s * x - 0.3, s * x + 0.3, 0, L.ceil2 + 0.35, B.z1, B.z1 + 0.17, GOLD);
    // портик: алтын бұрыштар және кішкене терезелер
    boxR(s * PZ.x - 0.28, s * PZ.x + 0.28, 0, L.ceil1 - 0.3, PZ.z - 0.05, PZ.z + 0.2, GOLD);
    frontWindow(s * 1.65, L.reception - 0.35, false, PZ.z, 0.7, 1.3, false);
  }
  frontWindow(0, L.floor2, true);
  boxR(-PZ.x - 0.35, PZ.x + 0.35, L.ceil1 - 0.3, L.ceil1 - 0.1, B.z1, PZ.z + 0.32, WHITE, { occ: true });
  // қоңыр қос есік (ашық)
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.85, 0, PZ.z);
    const lf = new THREE.Mesh(UNIT, M('#5a2c1c')); lf.scale.set(0.83, 2.4, 0.06); lf.position.set(-s * 0.415, L.reception + 1.2, 0);
    const gl = new THREE.Mesh(UNIT, M('#8fa3ad')); gl.scale.set(0.5, 1.5, 0.07); gl.position.set(-s * 0.415, L.reception + 1.5, 0);
    g.add(lf, gl); g.rotation.y = -s * (PI / 2) * 0.95; scene.add(g);
  }
  // Шатыр: төрт қырлы металл шатыр
  (function hipRoof() {
    const y0 = L.ceil2 + 0.36, y1 = y0 + 2.2, x0 = B.x0 - 0.4, x1 = B.x1 + 0.4, z0 = B.z0 - 0.4, z1 = B.z1 + 0.4, zc = (z0 + z1) / 2, hx = (z1 - z0) / 2;
    const A = [x0, y0, z1], Bv = [x1, y0, z1], Cv = [x1, y0, z0], D = [x0, y0, z0], R1 = [x0 + hx, y1, zc], R2 = [x1 - hx, y1, zc];
    const tris = [A, Bv, R2, A, R2, R1, Bv, Cv, R2, Cv, D, R1, Cv, R1, R2, D, A, R1];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, M(CO.roof, { side: THREE.DoubleSide })); m.castShadow = true; scene.add(m);
    // маңдайша
    const tri = new THREE.Shape(); tri.moveTo(-6.9, 0); tri.lineTo(6.9, 0); tri.lineTo(0, 3.0); tri.closePath();
    const bt = rep(TX.brick, 1 / 2.4, 1 / 1.2);
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 7.3, bevelEnabled: false }), [new THREE.MeshLambertMaterial({ map: bt }), M(CO.roof)]);
    ped.position.set(0, y0 - 0.02, -7.1); scene.add(ped);
    const ang = Math.atan2(3.0, 6.9), len = Math.hypot(6.9, 3.0) + 0.5;
    for (const s of [-1, 1]) { const t = new THREE.Mesh(UNIT, WHITE); t.scale.set(len, 0.24, 0.5); t.position.set(s * 3.45, y0 + 1.5, 0.12); t.rotation.z = -s * ang; scene.add(t); }
    decal(0, y0 + 1.95, 0.21, 0.95, 0.95, '+z', canvasTex(256, 256, (g, w, h) => logoDraw(g, w / 2, h / 2 - 10, 90, CO.pilaster)));
    decal(0, y0 + 1.05, 0.21, 4.0, 0.75, '+z', textTex('Jas Abay', { w: 512, h: 96, fg: '#1e3fb8', size: 84 }));
    decal(0, y0 + 0.5, 0.21, 1.8, 0.32, '+z', textTex('MEKTEBI', { w: 256, h: 48, fg: CO.pilaster, size: 40, weight: 800 }));
    for (const [x, z] of [[8.5, -6.2], [10.2, -6.0]]) boxR(x - 0.3, x + 0.3, y0 + 1.0, y1 + 0.4, z - 0.3, z + 0.3, M(x > 9 ? '#8a4b35' : '#c9ccd0'));
  })();
  // Сыртқы баспалдақ
  const porchM = M('#ffffff', { map: rep(TX.concrete, 2, 1), normalMap: rep(TX.concreteN, 2, 1), roughness: 0.95 });
  boxR(-2.5, 2.5, 0, L.reception, 0, 2.0, porchM, { occ: true });
  boxR(-2.5, 2.5, 0, 0.3, 2.0, 2.45, porchM, { occ: true });
  boxR(-2.5, 2.5, 0, 0.15, 2.45, 2.9, porchM, { occ: true });

  // Аула
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: rep(TX.grass, 90, 90), normalMap: rep(TX.grassN, 90, 90), roughness: 1 }));
  grass.rotation.x = -PI / 2; grass.receiveShadow = true; scene.add(grass); occluders.push(grass);
  floorPlane(-2.2, 2.2, 2.9, 30, 0, TX.tile, 0.8, '#d6d0c6');
  floorPlane(B.x0 - 2, B.x1 + 2, 0, 2.9, -0.002, TX.tile, 0.8, '#d6d0c6');
  floorPlane(-6, 6, 8, 14, -0.001, TX.tile, 0.8, '#d6d0c6');
  floorPlane(-26, 26, 3.75, 6.6, 0.001, TX.tile, 0.5, '#d8c3ad');
  // ---------------- Өсімдіктер: бұтақты ағаштар, туя, жапырақты бұталар ----------------
  // Жапырақтар — мөлдір жиекті «жапырақ карталары» (InstancedMesh), көлеңкесі де жапырақ пішінді.
  let seed = 7; const rr = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const leafTex = (hue, sat, light, needle) => canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < (needle ? 260 : 38); k++) {
      const x = 30 + Math.random() * 196, y = 30 + Math.random() * 196, a = Math.random() * PI * 2, L = needle ? 26 : 34;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = `hsl(${hue + Math.random() * 18 - 9},${sat}%,${light + Math.random() * 16 - 8}%)`;
      g.beginPath();
      if (needle) { g.ellipse(0, 0, L, 2.2, 0, 0, PI * 2); }
      else { g.moveTo(-L, 0); g.quadraticCurveTo(0, -L * 0.42, L, 0); g.quadraticCurveTo(0, L * 0.42, -L, 0); }
      g.fill();
      if (!needle) { g.strokeStyle = 'rgba(30,50,20,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); }
      g.restore();
    }
  });
  const leafMat = (tex) => {
    const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
    m.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 });
    return m;
  };
  const LEAF = { tree: leafMat(leafTex(102, 48, 36)), tree2: leafMat(leafTex(88, 52, 40)), thuja: leafMat(leafTex(128, 38, 24, true)), bush: leafMat(leafTex(110, 44, 32)) };
  const barkM = M('#ffffff', { map: rep(TX.bark, 1, 1), roughness: 0.95 });
  const CARD = new THREE.PlaneGeometry(1, 1);
  // pts: [x,y,z,size] тізімі → бір InstancedMesh
  function foliage(pts, mat) {
    const im = new THREE.InstancedMesh(CARD, mat, pts.length), o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(rr(0, PI), rr(0, PI * 2), rr(0, PI)); o.scale.setScalar(p[3]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = mat.userData.depth; (vegTarget || scene).add(im); return im;
  }
  const ellPts = (cx, cy, cz, rx, ry, rz, n, sz) => { const a = []; for (let k = 0; k < n; k++) { const u = rr(0, PI * 2), v = Math.acos(rr(-1, 1)), r = Math.cbrt(rr(0.35, 1)); a.push([cx + Math.sin(v) * Math.cos(u) * rx * r, cy + Math.cos(v) * ry * r, cz + Math.sin(v) * Math.sin(u) * rz * r, sz * rr(0.75, 1.2)]); } return a; };
  // Бұтақ: екі нүкте арасындағы жіңішкеретін цилиндр (нүктелер — [x,y,z] массивтері)
  const UP = new THREE.Vector3(0, 1, 0), nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function limb(a, b, r0, r1) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]), n = nrm(d);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, 7, 1), barkM);
    m.position.set(a[0] + d[0] / 2, a[1] + d[1] / 2, a[2] + d[2] / 2); m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(n[0], n[1], n[2])); m.castShadow = true; (vegTarget || scene).add(m);
  }
  const procTrees = new THREE.Group(); scene.add(procTrees); let vegTarget = null;
  function tree(x, z, s) {
    SLOTS.push({ k: 'tree', x, z, s: s || 1 });
    vegTarget = procTrees; treeBody(x, z, s); vegTarget = null;
  }
  function treeBody(x, z, s) {
    s = s || 1; const pts = [];
    const top = [x + rr(-0.15, 0.15), 2.3 * s, z + rr(-0.15, 0.15)];
    limb([x, 0, z], top, 0.2 * s, 0.13 * s);
    W.col(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 2.5, { kind: 'furn' });
    const grow = (from, dir, len, r, depth) => {
      const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len]; limb(from, to, r, r * 0.62);
      if (depth === 0) { pts.push(...ellPts(to[0], to[1], to[2], 0.95 * s, 0.75 * s, 0.95 * s, 46, 0.95 * s)); return; }
      const n = depth > 1 ? 3 : 2;
      for (let k = 0; k < n; k++) grow(to, nrm([dir[0] + rr(-0.75, 0.75), dir[1] + rr(0.15, 0.6), dir[2] + rr(-0.75, 0.75)]), len * rr(0.6, 0.78), r * 0.62, depth - 1);
    };
    for (let k = 0; k < 4; k++) { const a = k / 4 * PI * 2 + rr(-0.4, 0.4); grow(top, nrm([Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7]), 1.1 * s, 0.11 * s, 2); }
    pts.push(...ellPts(top[0], top[1] + 1.7 * s, top[2], 1.5 * s, 1.0 * s, 1.5 * s, 70, 1.05 * s));
    foliage(pts, rr(0, 1) < 0.5 ? LEAF.tree : LEAF.tree2);
  }
  function thuja(x, z, h) {            // конус шыршалардың орнына — тығыз туя
    limb([x, 0, z], [x, 0.5, z], 0.07, 0.05);
    const pts = [];
    for (let k = 0; k < 120; k++) { const y = rr(0.25, h), t = y / h, R = 0.55 * Math.sin(Math.min(1, (1 - t) * 1.25 + 0.08) * PI * 0.5) * (1 - t * 0.35), a = rr(0, PI * 2), r = R * Math.sqrt(rr(0.3, 1)); pts.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r, rr(0.42, 0.62)]); }
    foliage(pts, LEAF.thuja);
  }
  // бұталар бір InstancedMesh-ке жиналады
  const bushPts = [];
  const bush = (x0, x1, z0, z1, h) => bushPts.push(...ellPts((x0 + x1) / 2, h * 0.52, (z0 + z1) / 2, (x1 - x0) / 2 + 0.05, h * 0.55, (z1 - z0) / 2 + 0.05, 34, 0.5));
  // Қара металл қоршау (жұмыр бағаналар), бұталар, туялар
  const fenceM = M('#1e1f22', { metalness: 0.75, roughness: 0.38 });
  for (const s of [-1, 1]) {
    const xa = s * 2.8, xb = s * 19.5, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    boxR(lo, hi, 0.95, 1.0, 3.45, 3.5, fenceM); boxR(lo, hi, 0.15, 0.2, 3.45, 3.5, fenceM);
    { const n = Math.floor((hi - lo) / 0.14) + 1, im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.013, 0.013, 0.95, 6), fenceM, n), o = new THREE.Object3D();
      for (let k = 0; k < n; k++) { o.position.set(lo + k * 0.14, 0.575, 3.475); o.updateMatrix(); im.setMatrixAt(k, o.matrix); } im.castShadow = true; scene.add(im); }
    for (let x = lo; x <= hi + 0.01; x += 2.4) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.12, 10), fenceM); p.position.set(x, 0.56, 3.475); p.castShadow = true; scene.add(p);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), fenceM); k.position.set(x, 1.14, 3.475); scene.add(k); }
    W.col(lo, hi, 3.4, 3.55, 0, 1.1, { kind: 'fence' });
    for (let x = lo + 0.6; x < hi - 0.4; x += 1.25) bush(x - 0.55, x + 0.55, 3.62, 4.1, 0.6);
    for (const x of [4.9, 8.0, 11.0, 14.3, 17.4]) {
      thuja(s * x, 1.9, 2.5);
      W.col(s * x - 0.3, s * x + 0.3, 1.6, 2.2, 0, 2.4, { kind: 'furn' });
    }
  }
  for (const [x, z] of [[-31, 7], [-31, 19], [31, 7], [31, 22], [-4.5, 27], [4.5, 27], [-21, -6], [21, -9], [-24, 26], [24, 28]]) tree(x, z, 1 + (Math.abs(x * 7 + z) % 3) * 0.1);
  const oldBenches = [];
  for (const x of [-5, 5]) { oldBenches.push(boxR(x - 0.8, x + 0.8, 0.42, 0.48, 11.6, 12.0, M('#9b6b43'), { col: true }), boxR(x - 0.8, x + 0.8, 0.48, 0.85, 11.95, 12.0, M('#9b6b43'))); }
  foliage(bushPts, LEAF.bush);
  function sign(x, z, lines, faceZ) {
    boxR(x - 0.05, x + 0.05, 0, 1.4, z - 0.05, z + 0.05, M('#6b4a2e'), { col: true });
    decal(x, 1.9, z + 0.03 * faceZ, 2.2, 1.0, faceZ > 0 ? '+z' : '-z',
      textTex(lines, { w: 512, h: 232, bg: '#fffaf0', fg: CO.navy, size: 46, sizes: [46, 30], border: CO.gold, bw: 10 }), { side: THREE.DoubleSide, transparent: false });
  }
  sign(-4.2, 25, ['Jas Abay мектебі', 'виртуалды кампус · демо'], 1);

  // ---------------- Кітаптар ----------------
  const books = S.books.map((b, i) => {
    const g = new THREE.Group();
    const cover = new THREE.Mesh(UNIT, M(b.color)); cover.scale.set(0.3, 0.06, 0.22);
    const pages = new THREE.Mesh(UNIT, M('#fbf7ea')); pages.scale.set(0.28, 0.05, 0.225); pages.position.x = 0.012;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd34d' }));
    ring.rotation.x = PI / 2; ring.position.y = -0.12;
    g.add(cover, pages, ring); g.position.set(b.x, b.y + 0.15, b.z); scene.add(g);
    // кітап тұратын шағын үстел
    return { i, data: b, g, ring, got: false };
  });

  // ---------------- Кейіпкер: табиғи пропорция (≈7.5 бас), буынды қаңқа ----------------
  // Жамбас → сан → тізе → балтыр/аяқ киім; омыртқа → иық → шынтақ → білек → алақан; мойын → бас.
  // Бомбер мен джинсыда мата бедері (normal map) бар, сондықтан қатпарлар жарықта көрінеді.
  const AV = {
    cap: (r, L, seg) => {                         // жұмыр ұшты цилиндр (капсула), төмен қарай өседі
      const pts = [], n = 6;
      for (let i = 0; i <= n; i++) { const a = -PI / 2 + i / n * PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r[1], -L + Math.sin(a) * r[1])); }
      for (let i = 0; i <= n; i++) { const a = i / n * PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r[0], Math.sin(a) * r[0])); }
      return new THREE.LatheGeometry(pts, seg || 14);
    },
    sph: (r) => new THREE.SphereGeometry(r, 20, 16),
    skin: M('#e0b08a', { roughness: 0.62 }), rib: M('#1c1c1f', { normalMap: TX.fabricN, roughness: 0.9 }),
    jeans: M('#3a4a6b', { map: TX.denim, normalMap: TX.fabricN, roughness: 0.88 }),
    shoe: M('#f4f4f2', { roughness: 0.5 }), sole: M('#d8d8d6', { roughness: 0.8 }),
    eyeW: M('#f6f3ee', { roughness: 0.25 }), iris: M('#3b2616', { roughness: 0.2 }), brow: M('#2a1d15'), lip: M('#b56a5e', { roughness: 0.5 }),
    zip: M('#cfcfcf', { metalness: 0.9, roughness: 0.3 })
  };
  // Бомбер денесі: иықтан белге дейін жұмсақ профиль
  const TORSO = new THREE.LatheGeometry([[0.001, -0.02], [0.165, -0.02], [0.178, 0.06], [0.183, 0.18], [0.198, 0.3], [0.21, 0.4], [0.196, 0.46], [0.15, 0.5], [0.075, 0.52], [0.001, 0.52]].map(p => new THREE.Vector2(p[0], p[1])), 22);
  const PELVIS = new THREE.LatheGeometry([[0.001, -0.12], [0.12, -0.12], [0.168, -0.06], [0.175, 0.02], [0.166, 0.08], [0.001, 0.08]].map(p => new THREE.Vector2(p[0], p[1])), 18);
  function makeAvatar(jacket, gender) {
    const g = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: jacket || CO.bomber, normalMap: TX.fabricN, roughness: 0.72 });
    red.normalScale = new THREE.Vector2(0.9, 0.9);
    const hairM = new THREE.MeshLambertMaterial({ color: '#1f1712', roughness: 0.55 });
    const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; (parent || g).add(m); return m; };
    const grp = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x || 0, y || 0, z || 0); parent.add(p); return p; };
    // жамбас және аяқтар
    const hips = grp(g, 0, 0.92, 0);
    mesh(PELVIS, AV.jeans, 0, 0, 0, hips).scale.z = 0.66;
    const leg = (sx) => {
      const thigh = grp(hips, sx * 0.092, -0.04, 0);
      mesh(AV.cap([0.085, 0.064], 0.42), AV.jeans, 0, 0, 0, thigh);
      const knee = grp(thigh, 0, -0.42, 0);
      mesh(AV.cap([0.062, 0.05], 0.4), AV.jeans, 0, 0, 0, knee);
      const foot = grp(knee, 0, -0.42, 0);
      const sh = mesh(AV.sph(0.06), AV.shoe, 0, -0.01, -0.045, foot); sh.scale.set(1.15, 0.72, 2.1);
      mesh(new THREE.BoxGeometry(0.115, 0.022, 0.27), AV.sole, 0, -0.045, -0.045, foot);
      return { thigh, knee, foot };
    };
    const L = leg(-1), R = leg(1);
    // омыртқа, бомбер, иықтар
    const spine = grp(hips, 0, 0.06, 0);
    mesh(new THREE.CylinderGeometry(0.166, 0.17, 0.07, 20), AV.rib, 0, 0.0, 0, spine).scale.z = 0.66;
    const body = mesh(TORSO, red, 0, 0.02, 0, spine); body.scale.z = 0.64;
    mesh(new THREE.TorusGeometry(0.085, 0.026, 8, 18), AV.rib, 0, 0.53, 0, spine).rotation.x = PI / 2;
    mesh(new THREE.BoxGeometry(0.014, 0.46, 0.012), AV.zip, 0, 0.27, -0.128, spine);
    for (const sx of [-1, 1]) {                    // қалта жиектері — мата қатпарлары
      const pk = mesh(new THREE.BoxGeometry(0.012, 0.13, 0.01), AV.rib, sx * 0.1, 0.16, -0.125, spine); pk.rotation.z = sx * 0.35;
    }
    const arm = (sx) => {
      const sh = grp(spine, sx * 0.205, 0.44, 0);
      mesh(AV.sph(0.078), red, 0, 0, 0, sh).scale.set(1, 0.95, 0.92);
      mesh(AV.cap([0.07, 0.058], 0.29), red, 0, 0, 0, sh);
      const el = grp(sh, 0, -0.29, 0);
      mesh(AV.cap([0.058, 0.05], 0.24), red, 0, 0, 0, el);
      mesh(new THREE.CylinderGeometry(0.048, 0.046, 0.05, 14), AV.rib, 0, -0.245, 0, el);
      const hand = grp(el, 0, -0.29, 0);
      mesh(AV.sph(0.045), AV.skin, 0, -0.01, 0, hand).scale.set(0.62, 1.1, 1.05);
      mesh(AV.cap([0.015, 0.013], 0.05, 8), AV.skin, 0, -0.035, -0.012, hand);
      const th = mesh(AV.cap([0.014, 0.012], 0.045, 8), AV.skin, -sx * 0.024, 0.0, -0.03, hand); th.rotation.set(0.6, 0, sx * 0.5);
      return { sh, el, hand };
    };
    const AL = arm(-1), AR = arm(1);
    // мойын және бас
    mesh(AV.cap([0.048, 0.052], 0.1), AV.skin, 0, 0.62, 0, spine);
    const head = grp(spine, 0, 0.72, 0);
    mesh(AV.sph(0.112), AV.skin, 0, 0, 0, head).scale.set(0.9, 1.1, 1.0);
    const jaw = mesh(AV.sph(0.085), AV.skin, 0, -0.055, -0.022, head); jaw.scale.set(0.95, 0.85, 1.0);
    for (const sx of [-1, 1]) {
      mesh(AV.sph(0.024), AV.skin, sx * 0.1, -0.005, 0.005, head).scale.set(0.5, 1, 0.8);       // құлақ
      const ew = mesh(AV.sph(0.017), AV.eyeW, sx * 0.038, 0.018, -0.094, head); ew.scale.set(1.15, 0.8, 0.6);
      mesh(AV.sph(0.009), AV.iris, sx * 0.038, 0.018, -0.104, head);
      const br = mesh(AV.cap([0.006, 0.005], 0.04, 6), AV.brow, sx * 0.058, 0.05, -0.1, head); br.rotation.z = sx * (PI / 2 - 0.12);
    }
    const nose = mesh(AV.sph(0.017), AV.skin, 0, -0.012, -0.112, head); nose.scale.set(0.85, 1.25, 1);
    const lip = mesh(AV.sph(0.02), AV.lip, 0, -0.058, -0.098, head); lip.scale.set(1.5, 0.45, 0.6);
    // шаш: ұлда қысқа сәндік, қызда ұзын + құйрық шаш
    const hair = grp(head);
    const capH = mesh(new THREE.SphereGeometry(0.122, 24, 16, 0, 2 * PI, 0, PI * 0.52), hairM, 0, 0.02, 0.012, hair); capH.scale.set(0.95, 1.1, 1.05); capH.rotation.x = 0.42;   // алды маңдайда, арты желкеде
    const fringe = mesh(AV.sph(0.06), hairM, 0.02, 0.085, -0.085, hair); fringe.scale.set(1.5, 0.45, 0.8); fringe.rotation.z = -0.2;
    const longHair = grp(hair);
    const back = mesh(new THREE.LatheGeometry([[0.001, -0.3], [0.09, -0.29], [0.12, -0.15], [0.122, 0.0], [0.001, 0.02]].map(p => new THREE.Vector2(p[0], p[1])), 18), hairM, 0, 0, 0.04, longHair);
    back.scale.set(1, 1, 0.7);
    for (const sx of [-1, 1]) { const st = mesh(AV.cap([0.03, 0.022], 0.24, 10), hairM, sx * 0.098, 0.02, -0.035, longHair); st.rotation.z = sx * 0.06; }
    const tie = mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), M('#d42a2a'), 0, 0.03, 0.125, longHair); tie.rotation.x = 0.3;
    const tail = mesh(AV.cap([0.035, 0.018], 0.26, 10), hairM, 0, 0.03, 0.135, longHair); tail.rotation.x = -0.35;
    // қолдағы зат және бас үстіндегі шырақ (бұрынғы орындары сақталды)
    const prop = new THREE.Group(); prop.position.set(0, 1.0, -0.36); g.add(prop); prop.visible = false;
    const lamp = new THREE.Group(); lamp.position.set(0, 2.12, 0); g.add(lamp); lamp.visible = false;
    const o = { g, hips, spine, legL: L.thigh, legR: R.thigh, armL: AL.sh, armR: AR.sh, jacket: red, prop, lamp, head };
    o.setJacket = (c) => red.color.setSRGB(c);
    o.setGender = (gd) => {
      o.gender = gd; const girl = gd === 'girl';
      longHair.visible = girl; fringe.visible = !girl; hairM.color.setSRGB(girl ? '#2a1a12' : '#1f1712');
      g.scale.setScalar(girl ? 0.965 : 1); body.scale.x = girl ? 0.93 : 1;
    };
    o.setGender(gender || 'boy');
    // Анимация. Оң rotation.x — аяқ/қол алға (-z) қарай. walk — фаза, run — жүгіру.
    let k = 0;
    o.pose = (walk, moving, sit, holding, run) => {
      k += ((moving && !sit ? 1 : 0) - k) * 0.18;         // бірқалыпты басталу/тоқтау
      const amp = (run ? 0.85 : 0.5) * k, p = walk, s = Math.sin(p), c = Math.cos(p);
      if (sit) {
        L.thigh.rotation.set(1.52, 0, -0.06); R.thigh.rotation.set(1.52, 0, 0.06);
        L.knee.rotation.x = R.knee.rotation.x = -1.5; L.foot.rotation.x = R.foot.rotation.x = 0;
        hips.position.y = 0.9; spine.rotation.x = 0.06; hips.rotation.y = 0;
      } else {
        L.thigh.rotation.set(s * amp, 0, 0); R.thigh.rotation.set(-s * amp, 0, 0);
        L.knee.rotation.x = -(Math.max(0, -c) * (run ? 1.5 : 0.85) + 0.05) * k;
        R.knee.rotation.x = -(Math.max(0, c) * (run ? 1.5 : 0.85) + 0.05) * k;
        L.foot.rotation.x = -L.thigh.rotation.x * 0.35 - L.knee.rotation.x * 0.25; R.foot.rotation.x = -R.thigh.rotation.x * 0.35 - R.knee.rotation.x * 0.25;
        hips.position.y = 0.92 - (run ? 0.045 : 0.012) * k + Math.abs(c) * (run ? 0.045 : 0.022) * k;
        hips.rotation.y = s * 0.08 * k; spine.rotation.y = -s * 0.14 * k;
        spine.rotation.x = -(run ? 0.2 : 0.04) * k;
      }
      if (holding) {
        AL.sh.rotation.set(0.85, 0, -0.32); AR.sh.rotation.set(0.85, 0, 0.32);
        AL.el.rotation.x = AR.el.rotation.x = 0.9;
      } else if (sit) {
        AL.sh.rotation.set(0.35, 0, -0.08); AR.sh.rotation.set(0.35, 0, 0.08); AL.el.rotation.x = AR.el.rotation.x = 0.75;
      } else {
        AL.sh.rotation.set(-s * amp * 0.9, 0, -0.07); AR.sh.rotation.set(s * amp * 0.9, 0, 0.07);
        AL.el.rotation.x = AR.el.rotation.x = 0.12 + (run ? 1.2 : 0.3) * k;
      }
      head.rotation.x = -spine.rotation.x * 0.6; head.rotation.y = -spine.rotation.y * 0.7;
    };
    return o;
  }
  // Қолдағы кітап (ашық) және шай кесесі
  function makeBookProp(title, color) {
    const grp = new THREE.Group();
    const c = M(color || '#2b6cb0'), pg = M('#fbf7ea');
    for (const sx of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.23), c); cover.position.set(sx * 0.085, 0, 0); cover.rotation.z = sx * 0.18; grp.add(cover);
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.014, 0.21), pg); page.position.set(sx * 0.08, 0.01, 0); page.rotation.z = sx * 0.18; grp.add(page);
    }
    grp.rotation.x = 0.9;
    if (title) {
      const t = textTex(['📖 ' + title], { w: 512, h: 96, bg: 'rgba(255,250,235,0.92)', fg: CO.navy, size: 40, border: CO.gold, bw: 6 });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      sp.scale.set(0.95, 0.18, 1); sp.position.set(0, 0.28, 0.05); sp.renderOrder = 11; grp.add(sp);
    }
    return grp;
  }
  function makeCupProp() {
    const grp = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.06, 14), M('#f4f4f4')); grp.add(cup);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.046, 14), M('#a5541e')); tea.rotation.x = -PI / 2; tea.position.y = 0.026; grp.add(tea);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.048, 0.012, 14), M('#1f5fbf')); band.position.y = 0.012; grp.add(band);
    return grp;
  }
  // Шырақ: жылы жарық шашатын шамшырақ + жарқырау
  const GLOW = canvasTex(128, 128, (g2, w, h) => {
    const gr = g2.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.35, 'rgba(255,190,90,0.55)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, w, h);
  });
  function fillLamp(lamp) {
    if (lamp.children.length) return;
    const frame = M('#3a2a1a');
    lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 10), frame));
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 10), frame); top.position.y = 0.15; lamp.add(top);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd27a' })); flame.position.y = 0.065; flame.scale.y = 1.5; lamp.add(flame);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.35 })); gl.position.y = 0.075; lamp.add(gl);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(0.9, 0.9, 1); halo.position.y = 0.07; lamp.add(halo);
    lamp.userData.flame = flame; lamp.userData.halo = halo;
  }
  // Кейіпкерге зат беру: kind 'book' | 'cup' | null
  function setHeld(o, kind, title, color) {
    const key = kind + '|' + (title || '');
    if (o.heldKey === key) return; o.heldKey = key;
    o.prop.clear(); o.prop.visible = !!kind;
    if (kind === 'book') o.prop.add(makeBookProp(title, color));
    if (kind === 'cup') { const c = makeCupProp(); c.position.set(0.12, 0.02, 0.05); o.prop.add(c); }
    o.lamp.visible = kind === 'book'; if (kind === 'book') fillLamp(o.lamp);
  }
  function animLamp(o, t) {
    if (!o.lamp.visible || !o.lamp.userData.flame) return;
    const k = 1 + Math.sin(t * 9 + o.g.id) * 0.08 + Math.sin(t * 23) * 0.04;
    o.lamp.userData.flame.scale.set(k, 1.5 * k, k); o.lamp.userData.halo.scale.set(0.9 * k, 0.9 * k, 1);
    o.lamp.position.y = 2.12 + Math.sin(t * 1.6 + o.g.id) * 0.03;
  }
  const av = makeAvatar(); scene.add(av.g);
  const G = window.__game = { THREE, scene, camera, renderer, M, UNIT, boxR, decal, textTex, canvasTex, shelf, flat, makeAvatar, av, W, SW, S, CO, FONT,
    sun, hemi, amb, cast, floorPlane, sign, tree, setHeld, animLamp, GLOW, occluders, glassOut, winGlassOut, logoDraw,
    touch: { x: 0, y: 0, active: false }, run: false,
    extras: [], frameHooks: [], paused: false, sitting: null, toast: null, slots: SLOTS, procTrees, oldBenches, grassMesh: grass, LEAF, TX };

  // ---------------- Басқару ----------------
  const st = { x: 0, y: 0, z: 0, vy: 0, grounded: true };
  let yaw = 0, pitch = 0.25, firstPerson = false, facing = 0, walkT = 0, started = false, won = false;
  const keys = {};
  const hud = {
    count: document.getElementById('count'), place: document.getElementById('place'),
    prompt: document.getElementById('prompt'), toast: document.getElementById('toast'),
    start: document.getElementById('start'), win: document.getElementById('win'), list: document.getElementById('booklist')
  };
  G.toast = toast;
  function toast(t) { hud.toast.textContent = t; hud.toast.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => hud.toast.classList.remove('show'), 2200); }
  function renderList() {
    hud.count.textContent = `${books.filter(b => b.got).length} / ${books.length}`;
    hud.list.innerHTML = books.map(b => `<li class="${b.got ? 'got' : ''}">${b.got ? '✓' : '○'} ${b.got ? b.data.title : '???'}</li>`).join('');
  }
  function reset() {
    st.x = S.start.x; st.z = S.start.z; st.y = 0; st.vy = 0; st.grounded = true;
    yaw = S.start.yaw; facing = yaw; pitch = 0.25; won = false;
    books.forEach(b => { b.got = true; b.g.visible = false; });   // 5 кітап тапсырмасы өшірілді
    W.doors.forEach(d => { d.open = !!d.room.open; d.collider.on = !d.open; });
    hud.win.classList.remove('show'); renderList();
  }
  reset();

  addEventListener('keydown', e => {
    if (G.paused) return;
    keys[e.code] = true;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyV') G.toggleCam();
    if (e.code === 'KeyR' && won) reset();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  const cv = renderer.domElement;
  let dragging = false;
  cv.addEventListener('mousedown', () => {
    dragging = true;
    if (started && !G.paused && !G.isTouch && document.pointerLockElement !== cv) { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  });
  addEventListener('mouseup', () => { dragging = false; });
  G.look = (dx, dy) => {
    yaw -= dx; pitch += dy;
    pitch = firstPerson ? Math.max(-1.3, Math.min(1.3, pitch)) : Math.max(-0.35, Math.min(1.1, pitch));
  };
  G.toggleCam = () => { firstPerson = !firstPerson; toast(firstPerson ? 'Бірінші жақтан көрініс' : 'Кейіпкер артынан көрініс'); };
  addEventListener('mousemove', e => {
    if (!started || G.paused || G.isTouch) return;
    if (document.pointerLockElement !== cv && !dragging) return;
    G.look(e.movementX * 0.0026 * (G.sens || 1), e.movementY * 0.0022 * (G.sens || 1));
  });
  G.lockMouse = () => { if (G.isTouch) return; try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  G.begin = () => { started = true; hud.start.classList.remove('show'); };
  document.getElementById('play').addEventListener('click', () => {
    // онлайн модуль алдымен профиль сұрауы мүмкін
    if (G.beforeStart) G.beforeStart(() => { G.begin(); G.lockMouse(); });
    else { G.begin(); G.lockMouse(); }
  });
  document.getElementById('restart').addEventListener('click', () => { reset(); toast('Ойын басынан басталды'); });
  document.getElementById('again').addEventListener('click', () => { reset(); });

  let target = null;
  function findTarget() {
    let best = null, bd = 1e9;
    for (const b of books) {
      if (b.got) continue;
      const d = Math.hypot(b.data.x - st.x, b.data.z - st.z);
      if (d < 1.9 && Math.abs(b.data.y - (st.y + 0.9)) < 1.4 && d < bd) { bd = d; best = { kind: 'book', b }; }
    }
    if (!best) for (const x of G.extras) {
      if (x.enabled && !x.enabled()) continue;
      const d = Math.hypot(x.x - st.x, x.z - st.z);
      if (d < (x.r || 2) && Math.abs((x.y || 0) - st.y) < 1.5 && d < bd) { bd = d; best = { kind: 'extra', x }; }
    }
    if (!best) for (const d of W.doors) {
      const dist = Math.hypot(d.x - st.x, d.z - st.z);
      if (dist < 1.7 && Math.abs(d.y - st.y) < 1 && dist < bd) { bd = dist; best = { kind: 'door', d }; }
    }
    return best;
  }
  function interact() {
    if (!started || !target) return;
    if (target.kind === 'book') {
      const b = target.b; b.got = true; b.g.visible = false; renderList();
      const got = books.filter(x => x.got).length;
      toast(`«${b.data.title}» табылды! (${got}/${books.length})`);
      dispatchEvent(new CustomEvent('jas:book', { detail: { title: b.data.title, got, total: books.length } }));
      if (got === books.length) { won = true; setTimeout(() => hud.win.classList.add('show'), 600); }
    } else if (target.kind === 'extra') {
      target.x.action();
    } else {
      const d = target.d;
      if (d.locked) { toast('Бұл есік жабық'); return; }
      if (d.open && Math.abs(st.z - d.z) < 0.45 && Math.abs(st.x - d.x) < 0.7) return;   // есік алдында тұрсаң жабылмайды
      d.open = !d.open; d.collider.on = !d.open;
    }
  }

  // ---------------- Камера ----------------
  const ray = new THREE.Raycaster();
  const pivot = new THREE.Vector3(), dir = new THREE.Vector3();
  function updateCamera() {
    pivot.set(st.x, st.y + 1.58, st.z);
    if (firstPerson) {
      camera.position.set(st.x, st.y + 1.62, st.z);
      camera.rotation.set(-pitch, yaw, 0);
      av.g.visible = false; return;
    }
    const dist = 3.0;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    ray.set(pivot, dir); ray.far = dist + 0.3;
    const hit = ray.intersectObjects(occluders, false)[0];
    const d = hit ? Math.max(0.15, Math.min(dist, hit.distance - 0.25)) : dist;
    camera.position.copy(pivot).addScaledVector(dir, d);
    camera.lookAt(pivot.x - Math.sin(yaw) * 0.6, pivot.y, pivot.z - Math.cos(yaw) * 0.6);
    av.g.visible = d > 0.6;
  }

  // ---------------- Негізгі цикл ----------------
  const clock = new THREE.Clock();
  let lastPlace = '';
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    let fx = 0, fz = 0;
    if (started && !G.paused && !G.sitting) {
      let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      let r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      let mag = 1;
      if (G.touch.active) { f = -G.touch.y; r = G.touch.x; mag = Math.min(1, Math.hypot(f, r)); }   // телефондағы джойстик
      fx = -Math.sin(yaw) * f + Math.cos(yaw) * r;
      fz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
      const len = Math.hypot(fx, fz);
      if (len > 0.05) { fx = fx / len * mag; fz = fz / len * mag; } else { fx = 0; fz = 0; }
    }
    const speed = keys.ShiftLeft || keys.ShiftRight || G.run ? 5.2 : 3.0;
    SW.step(W, st, fx * speed * dt, fz * speed * dt, dt);
    const moving = fx !== 0 || fz !== 0;
    if (moving) {
      const want = Math.atan2(-fx, -fz);
      let dd = want - facing; while (dd > PI) dd -= 2 * PI; while (dd < -PI) dd += 2 * PI;
      facing += dd * Math.min(1, dt * 12);
      walkT += dt * speed * 2.6;
    } else walkT *= 0.85;
    av.pose(walkT, moving, !!G.sitting, !!(G.sitting && G.sitting.hold), speed > 4);
    animLamp(av, clock.elapsedTime);
    if (G.sitting) { av.g.position.set(G.sitting.x, G.sitting.y, G.sitting.z); av.g.rotation.y = G.sitting.f; }
    else { av.g.position.set(st.x, st.y, st.z); av.g.rotation.y = facing; }
    G.facing = facing; G.moving = moving;
    // Есіктер мен кітаптар анимациясы
    for (const d of W.doors) {
      const tgt = d.open ? 1 : 0; d.angle += (tgt - d.angle) * Math.min(1, dt * 8);
      d.pivot.rotation.y = d.intoRoom * (PI / 2) * d.angle;
    }
    const t = clock.elapsedTime;
    for (const b of books) if (!b.got) { b.g.rotation.y = t * 1.5 + b.i; b.g.position.y = b.data.y + 0.18 + Math.sin(t * 2 + b.i) * 0.05; }
    updateCamera();
    // HUD
    target = started && !G.paused ? findTarget() : null;
    if (target) {
      hud.prompt.textContent = target.kind === 'book' ? `E — «${target.b.data.title}» кітабын алу`
        : target.kind === 'extra' ? target.x.label
        : target.d.locked ? `${target.d.room.name} — жабық` : `E — ${target.d.room.name}: есікті ${target.d.open ? 'жабу' : 'ашу'}`;
      hud.prompt.classList.add('show');
    } else hud.prompt.classList.remove('show');
    const w = SW.whereAmI(W, st.x, st.y, st.z);
    const place = (w.floor === 0 ? '' : w.floor === 1.5 ? '' : w.floor + '-қабат · ') + w.name;
    if (place !== lastPlace) { hud.place.textContent = place; lastPlace = place; }
    if (Math.floor(t * 30) !== frame.tvTick) { frame.tvTick = Math.floor(t * 30); TV.update(t); if (frame.tvTick % 3 === 0) CCTV.update(t); }
    mirror.update(t);
    for (const fn of G.frameHooks) fn(dt, t);
    renderer.render(scene, camera);
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  frame();

  // Тексеру үшін (браузер консолі): window.__game
  Object.assign(G, { st, books, setView: (y, p) => { yaw = y; pitch = p; }, teleport: (x, z, y) => { st.x = x; st.z = z; st.y = SW.groundAt(W, x, z, y === undefined ? 10 : y); st.vy = 0; st.grounded = true; }, start: () => G.begin(), interact, keys, place: () => lastPlace });
})();
