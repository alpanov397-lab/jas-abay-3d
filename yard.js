// =====================================================================
//  yard.js — аула: 50 орындық ашық кітапхана және ішіне кіретін
//  киіз үй-шайхана. Орындықтар G.yard.libSeats / G.yard.shSeats ішінде.
// =====================================================================
(function () {
  const G = window.__game;
  if (!G) return;
  const { THREE, W, M, boxR } = G;
  const PI = Math.PI;
  const yard = G.yard = { libSeats: [], shSeats: [], night: [] };
  const nightBulb = (color) => { const m = new THREE.MeshBasicMaterial({ color: '#d9d4c8' }); yard.night.push({ mat: m, day: '#d9d4c8', night: color || '#ffd58a' }); return m; };

  // ---------------- 50 орындық ашық кітапхана ----------------
  const LIB = yard.lib = { x0: -28, x1: -8, z0: 8, z1: 22, y: 0.2 };
  const lcx = (LIB.x0 + LIB.x1) / 2, lcz = (LIB.z0 + LIB.z1) / 2;
  const planks = G.canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const v = 150 + Math.round(Math.random() * 30);
      g.fillStyle = `rgb(${v + 30},${v + 4},${v - 40})`; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(80,50,20,0.35)'; g.fillRect(0, i * 32, w, 2); g.fillRect((i * 83) % w, i * 32, 2, 32);
      for (let k = 0; k < 20; k++) { g.fillStyle = 'rgba(90,55,25,0.18)'; g.fillRect(Math.random() * w, i * 32 + Math.random() * 30, 30 + Math.random() * 50, 1); }
    }
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping; planks.repeat.set(6, 4);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(LIB.x1 - LIB.x0, LIB.y, LIB.z1 - LIB.z0), new THREE.MeshLambertMaterial({ map: planks }));
  deck.position.set(lcx, LIB.y / 2, lcz); deck.receiveShadow = true; G.scene.add(deck); G.occluders.push(deck);
  W.surfaces.push({ x0: LIB.x0, x1: LIB.x1, z0: LIB.z0, z1: LIB.z1, y: LIB.y, tag: 'library' });
  // сөрелер: артқы және сол жақ
  G.shelf(LIB.x0 + 0.5, LIB.x1 - 0.5, LIB.z1 - 0.6, LIB.z1 - 0.1, LIB.y, 2.4);
  G.shelf(LIB.x0 + 0.1, LIB.x0 + 0.6, LIB.z0 + 1.5, LIB.z1 - 0.8, LIB.y, 2.4);
  // ағаш перголa мен гирлянда шамдар
  const postM = M('#6b4a2e');
  const posts = [];
  for (let x = LIB.x0 + 0.3; x <= LIB.x1 - 0.2; x += (LIB.x1 - LIB.x0 - 0.5) / 4) for (const z of [LIB.z0 + 0.3, LIB.z1 - 0.9]) {
    const p = boxR(x - 0.12, x + 0.12, LIB.y, 3.4, z - 0.12, z + 0.12, postM, { col: true }); p.castShadow = true; posts.push([x, z]);
  }
  for (const z of [LIB.z0 + 0.3, LIB.z1 - 0.9]) boxR(LIB.x0 + 0.1, LIB.x1 - 0.1, 3.3, 3.5, z - 0.1, z + 0.1, postM).castShadow = true;
  for (let x = LIB.x0 + 0.3; x <= LIB.x1 - 0.2; x += (LIB.x1 - LIB.x0 - 0.5) / 4) boxR(x - 0.08, x + 0.08, 3.42, 3.56, LIB.z0 + 0.3, LIB.z1 - 0.9, postM).castShadow = true;
  const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6), bulbM = nightBulb('#ffe1a0');
  for (let x = LIB.x0 + 0.3; x <= LIB.x1 - 0.2; x += (LIB.x1 - LIB.x0 - 0.5) / 4)
    for (let t = 0.05; t < 1; t += 0.07) {
      const z = LIB.z0 + 0.3 + t * (LIB.z1 - 1.2 - LIB.z0), y = 3.3 - Math.sin(t * PI) * 0.5;
      const b = new THREE.Mesh(bulbGeo, bulbM); b.position.set(x, y, z); G.scene.add(b);
    }
  // 50 орындық: 5 қатар × 10, бәрі сөреге (артқа) қарап отырады
  const seatM = M('#b0773f'), baseM = M('#7a4f2a'), cushM = M('#2f5fb3');
  const N = 50, inst = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, N); m.castShadow = true; m.receiveShadow = true; G.scene.add(m); return m; };
  const baseI = inst(new THREE.BoxGeometry(0.46, 0.4, 0.42), baseM), seatI = inst(new THREE.BoxGeometry(0.52, 0.07, 0.5), seatM);
  const cushI = inst(new THREE.BoxGeometry(0.46, 0.05, 0.44), cushM), backI = inst(new THREE.BoxGeometry(0.52, 0.55, 0.06), seatM);
  const tableI = inst(new THREE.BoxGeometry(0.42, 0.04, 0.32), M('#d9bd8e')), tlegI = inst(new THREE.BoxGeometry(0.05, 0.62, 0.05), baseM);
  const dummy = new THREE.Object3D();
  const put = (im, i, x, y, z) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
  let n = 0;
  for (let r = 0; r < 5; r++) for (let i = 0; i < 10; i++) {
    const x = LIB.x0 + 1.8 + i * 1.95, z = LIB.z0 + 2.2 + r * 2.3, y0 = LIB.y;
    put(baseI, n, x, y0 + 0.2, z); put(seatI, n, x, y0 + 0.435, z); put(cushI, n, x, y0 + 0.495, z);
    put(backI, n, x, y0 + 0.75, z - 0.24); put(tableI, n, x + 0.62, y0 + 0.64, z + 0.05); put(tlegI, n, x + 0.62, y0 + 0.31, z + 0.05);
    W.col(x - 0.26, x + 0.26, z - 0.27, z + 0.25, y0, y0 + 0.5, { kind: 'furn' });
    yard.libSeats.push({ area: 'lib', id: n, x, z: z + 0.02, y: y0 + 0.52 - 0.86, f: PI, px: x, pz: z + 0.75, hold: true });
    n++;
  }
  // мақсат орындалғанда ашылатын жаңа сөре (ортаңғы өтпе жанында)
  const ns = yard.newShelf = new THREE.Group(); G.scene.add(ns); ns.visible = false;
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 3.2), M('#e2c99a')); b.position.set(LIB.x1 - 0.5, LIB.y + 1.1, lcz); ns.add(b);
    const sp = G.canvasTex(256, 192, (g, w, h) => {
      const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22'];
      for (let r = 0; r < 4; r++) { let x = 0; while (x < w) { const bw = 5 + Math.random() * 9; g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(x, r * 48 + 6, bw - 1, 40); x += bw; } }
    });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9), new THREE.MeshLambertMaterial({ map: sp })); f.position.set(LIB.x1 - 0.73, LIB.y + 1.15, lcz); f.rotation.y = -PI / 2; ns.add(f);
    const lbl = G.decal(LIB.x1 - 0.74, LIB.y + 2.35, lcz, 2.2, 0.3, '-x', G.textTex('Мектепке сыйға тартылған кітаптар', { w: 512, h: 70, bg: '#13254f', fg: '#ffffff', size: 28 })); ns.add(lbl);
  }
  G.sign(-18, 7.2, ['Виртуалды кітапхана', '50 орын · E — отыру'], 1);
  G.extras.push({ x: lcx, z: lcz, y: LIB.y, r: 11.5, label: 'E — Кітапханада бос орынға отыру', action: () => yard.onSit && yard.onSit('lib') });

  // ---------------- Киіз үй — шайхана ----------------
  // Қазақтың алты қанат киіз үйі: кереге (торлы қабырға), уықтар, шаңырақ пен күлдіреуіш,
  // ақ киіз туырлық пен үзік, баскұр мен белдеу арқандар, ою-өрнекті қос есік, ішінде тұскиіз, сандық, жүк.
  const SH = yard.sh = { x: 18, z: 15, R: 4.6, h: 1.9 };
  const Hw = SH.h, RT = 0.82, HT = Hw + 1.85;                // кереге биіктігі, шаңырақ радиусы мен биіктігі
  const doorA = 3 * PI / 2, doorHalf = 0.62, doorW = doorHalf / SH.R;   // есік батысқа (-x) қарайды
  const yurt = new THREE.Group(); yurt.position.set(SH.x, 0, SH.z); G.scene.add(yurt);
  const RED = '#b3261e', GOLD = '#e9b949', BROWN = '#5b2c14', CREAM = '#efe6d2';
  // қошқар мүйіз оюы (қарапайым S-ирек)
  function oyu(g, x, y, s, col) {
    g.strokeStyle = col; g.lineWidth = Math.max(2, s * 0.16); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s, y);
    g.bezierCurveTo(x - s, y - s * 0.9, x - s * 0.1, y - s * 0.9, x - s * 0.2, y - s * 0.25);
    g.moveTo(x + s, y); g.bezierCurveTo(x + s, y - s * 0.9, x + s * 0.1, y - s * 0.9, x + s * 0.2, y - s * 0.25);
    g.moveTo(x - s, y); g.bezierCurveTo(x - s, y + s * 0.9, x - s * 0.1, y + s * 0.9, x - s * 0.2, y + s * 0.25);
    g.moveTo(x + s, y); g.bezierCurveTo(x + s, y + s * 0.9, x + s * 0.1, y + s * 0.9, x + s * 0.2, y + s * 0.25);
    g.stroke();
  }
  const feltNoise = (g, w, h) => { for (let i = 0; i < w * h / 40; i++) { const v = Math.random() < 0.5 ? '120,100,70' : '255,255,245'; g.fillStyle = `rgba(${v},${0.04 + Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
  // Туырлық (қабырға киізі): төменгі ою жиек, жоғарыда баскұр, ортада белдеу арқандар
  const wallTex = G.canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = CREAM; g.fillRect(0, 0, w, h); feltNoise(g, w, h);
    g.fillStyle = BROWN; g.fillRect(0, h - 40, w, 40);
    for (let x = 32; x < w; x += 64) oyu(g, x, h - 20, 14, GOLD);
    g.fillStyle = RED; g.fillRect(0, 0, w, 30);                                  // баскұр
    for (let x = 0; x < w; x += 24) { g.fillStyle = (x / 24) % 2 ? GOLD : '#1f3d7a'; g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 12, 26); g.lineTo(x + 24, 4); g.fill(); }
    g.strokeStyle = 'rgba(70,45,25,0.85)'; g.lineWidth = 5;                     // белдеу арқандар
    for (const y of [92, 150]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 3; for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x + 64, h - 40); g.moveTo(x + 64, 30); g.lineTo(x, h - 40); g.stroke(); }
  });
  wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(5, 1);
  // Үзік (шатыр киізі): ақ киіз, төменгі жиегінде тісті ою
  const roofTex = G.canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = CREAM; g.fillRect(0, 0, w, h); feltNoise(g, w, h);
    g.fillStyle = 'rgba(90,60,30,0.08)'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h);   // уық іздері
    g.fillStyle = BROWN; g.fillRect(0, 0, w, 46);
    for (let x = 0; x < w; x += 64) { g.fillStyle = RED; g.beginPath(); g.moveTo(x, 46); g.lineTo(x + 32, 86); g.lineTo(x + 64, 46); g.fill(); oyu(g, x + 32, 22, 11, GOLD); }
  });
  roofTex.wrapS = THREE.RepeatWrapping; roofTex.repeat.set(6, 1);
  const feltM = (map, side) => new THREE.MeshLambertMaterial({ map, side: side || THREE.FrontSide, roughness: 0.97 });
  const arcStart = doorA + doorW, arcLen = 2 * PI - 2 * doorW;
  // сыртқы қабырға (туырлық)
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(SH.R + 0.06, SH.R + 0.1, Hw, 72, 1, true, arcStart, arcLen), feltM(wallTex));
  outer.position.y = Hw / 2; outer.castShadow = true; outer.receiveShadow = true; yurt.add(outer); G.occluders.push(outer);
  // ішкі киіз және кереге торы (мөлдір тесіктері бар)
  const innerFelt = new THREE.Mesh(new THREE.CylinderGeometry(SH.R + 0.02, SH.R + 0.02, Hw, 72, 1, true, arcStart, arcLen), new THREE.MeshLambertMaterial({ color: '#e9dcc0', side: THREE.BackSide, roughness: 1 }));
  innerFelt.position.y = Hw / 2; yurt.add(innerFelt);
  const keregeTex = G.canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#a3321c'; g.lineWidth = 14; g.lineCap = 'round';
    for (let i = -w; i <= w * 2; i += 64) { g.beginPath(); g.moveTo(i, -4); g.lineTo(i + h, h + 4); g.stroke(); g.beginPath(); g.moveTo(i, h + 4); g.lineTo(i + h, -4); g.stroke(); }
    g.fillStyle = GOLD; for (let i = 0; i <= w; i += 64) for (let j = 0; j <= h; j += 64) { g.beginPath(); g.arc(i + 32, j + 32, 5, 0, 7); g.fill(); g.beginPath(); g.arc(i, j, 5, 0, 7); g.fill(); }
  });
  keregeTex.wrapS = keregeTex.wrapT = THREE.RepeatWrapping; keregeTex.repeat.set(26, 2);
  const kerM = new THREE.MeshLambertMaterial({ map: keregeTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const kerege = new THREE.Mesh(new THREE.CylinderGeometry(SH.R - 0.06, SH.R - 0.06, Hw - 0.05, 72, 1, true, arcStart + 0.01, arcLen - 0.02), kerM);
  kerege.position.y = Hw / 2; yurt.add(kerege);
  // шатыр профилі: керегеден шаңыраққа дейін сәл дөңес иін
  const prof = (k, dr, dy) => { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, r = (SH.R + dr) + (RT - (SH.R + dr)) * t, y = Hw + dy + (HT - Hw) * (Math.pow(t, 0.82)) + Math.sin(t * PI) * 0.18; pts.push(new THREE.Vector2(r, y)); } return k ? pts.reverse() : pts; };
  const roof = new THREE.Mesh(new THREE.LatheGeometry(prof(false, 0.32, -0.12), 72), feltM(roofTex));
  roof.castShadow = true; roof.receiveShadow = true; yurt.add(roof); G.occluders.push(roof);
  const roofIn = new THREE.Mesh(new THREE.LatheGeometry(prof(false, 0.12, -0.2), 72), new THREE.MeshLambertMaterial({ color: '#e4d6b8', side: THREE.BackSide, roughness: 1 }));
  yurt.add(roofIn);
  // уықтар: төменгі ұшы иілген қызыл ағаш (бір InstancedMesh)
  const uykCurve = new THREE.CatmullRomCurve3(prof(false, -0.06, -0.24).map((p, i) => new THREE.Vector3(p.x, p.y - (i === 0 ? 0.12 : 0), 0)));
  const uykGeo = new THREE.TubeGeometry(uykCurve, 24, 0.035, 6, false);
  const NU = 72, uyks = new THREE.InstancedMesh(uykGeo, M('#a3321c', { roughness: 0.55 }), NU), dm = new THREE.Object3D();
  for (let k = 0; k < NU; k++) { dm.rotation.set(0, k / NU * 2 * PI, 0); dm.updateMatrix(); uyks.setMatrixAt(k, dm.matrix); }
  uyks.castShadow = true; yurt.add(uyks);
  // шаңырақ: шеңбер + айқасқан күлдіреуіштер
  const woodM = M('#8a3b1a', { roughness: 0.5 }), goldM = M(GOLD, { roughness: 0.35, metalness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RT, 0.09, 10, 48), woodM); ring.rotation.x = PI / 2; ring.position.y = HT; ring.castShadow = true; yurt.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(RT + 0.1, 0.035, 8, 48), goldM); ring2.rotation.x = PI / 2; ring2.position.y = HT + 0.04; yurt.add(ring2);
  for (const off of [-0.42, 0, 0.42]) for (const rot of [0, PI / 2]) {
    const half = Math.sqrt(Math.max(0.05, RT * RT - off * off));
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-half, 0, off), new THREE.Vector3(0, 0.5, off), new THREE.Vector3(half, 0, off));
    const bar = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.035, 6, false), woodM); bar.position.y = HT; bar.rotation.y = rot; bar.castShadow = true; yurt.add(bar);
  }
  // түндік: шаңырақтың жартысын жауып, артқа қайырылған киіз
  const tunduk = new THREE.Mesh(new THREE.CircleGeometry(RT + 0.15, 32, 0, PI), feltM(roofTex, THREE.DoubleSide));
  tunduk.rotation.set(-PI / 2 + 0.25, 0, 0); tunduk.position.y = HT + 0.42; tunduk.castShadow = true; yurt.add(tunduk);
  // ---- есік: жақтау (босаға, маңдайша, табалдырық) және ою-өрнекті қос жармалы есік ----
  const ex = SH.x - SH.R - 0.04, ez = SH.z, DH = 1.82;
  const frameM = M('#c0392b', { roughness: 0.45 });
  boxR(ex - 0.12, ex + 0.12, 0, DH + 0.2, ez - doorHalf - 0.12, ez - doorHalf, frameM).castShadow = true;
  boxR(ex - 0.12, ex + 0.12, 0, DH + 0.2, ez + doorHalf, ez + doorHalf + 0.12, frameM).castShadow = true;
  boxR(ex - 0.13, ex + 0.13, DH, DH + 0.24, ez - doorHalf - 0.12, ez + doorHalf + 0.12, frameM).castShadow = true;
  boxR(ex - 0.12, ex + 0.12, 0, 0.08, ez - doorHalf, ez + doorHalf, M('#7a2a12'));
  const lintelTex = G.canvasTex(512, 64, (g, w, h) => { g.fillStyle = RED; g.fillRect(0, 0, w, h); for (let x = 32; x < w; x += 64) oyu(g, x, h / 2, 18, GOLD); });
  G.decal(ex - 0.135, DH + 0.12, ez, 2 * doorHalf + 0.24, 0.22, '-x', lintelTex);
  const leafTex = G.canvasTex(128, 384, (g, w, h) => {
    g.fillStyle = '#a8231b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = GOLD; g.lineWidth = 5; g.strokeRect(9, 9, w - 18, h - 18); g.lineWidth = 2; g.strokeRect(18, 18, w - 36, h - 36);
    for (const y of [70, 190, 310]) { oyu(g, w / 2, y, 30, GOLD); g.fillStyle = GOLD; g.beginPath(); g.arc(w / 2, y, 6, 0, 7); g.fill(); }
  });
  const leafM = new THREE.MeshLambertMaterial({ map: leafTex, roughness: 0.5 });
  for (const s of [-1, 1]) {                           // есік жармалары сыртқа ашылған
    const hinge = new THREE.Group(); hinge.position.set(ex - 0.12, 0.04, ez + s * doorHalf); G.scene.add(hinge);
    const lf = new THREE.Mesh(new THREE.BoxGeometry(0.05, DH - 0.06, doorHalf), leafM); lf.position.set(0, (DH - 0.06) / 2, -s * doorHalf / 2); lf.castShadow = true; hinge.add(lf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), goldM); knob.position.set(-0.04, DH * 0.52, -s * (doorHalf - 0.08)); hinge.add(knob);
    hinge.rotation.y = s * 1.25;
  }
  // ішкі еден: текемет кілем
  const rug = new THREE.Mesh(new THREE.CircleGeometry(SH.R - 0.05, 64), new THREE.MeshLambertMaterial({ roughness: 1, map: G.canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7d1b16'; g.fillRect(0, 0, w, h);
    for (const [r, c] of [[250, '#a3261e'], [200, GOLD], [192, '#7d1b16'], [130, '#1f3d7a'], [84, GOLD], [76, '#a3261e']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.fill(); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * PI; oyu(g, w / 2 + Math.cos(a) * 160, h / 2 + Math.sin(a) * 160, 14, '#f3e2b3'); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * 2 * PI; oyu(g, w / 2 + Math.cos(a) * 105, h / 2 + Math.sin(a) * 105, 12, GOLD); }
    oyu(g, w / 2, h / 2, 26, GOLD);
  }) }));
  rug.rotation.x = -PI / 2; rug.position.set(SH.x, 0.04, SH.z); rug.receiveShadow = true; G.scene.add(rug);
  W.surfaces.push({ x0: SH.x - SH.R, x1: SH.x + SH.R, z0: SH.z - SH.R, z1: SH.z + SH.R, y: 0.04, tag: 'yurt' });
  // қабырға коллайдерлері (есіктен басқа)
  for (let k = 0; k < 64; k++) {
    const a = (k + 0.5) / 64 * 2 * PI;
    const da = Math.abs(((a - doorA + 3 * PI) % (2 * PI)) - PI); if (da < doorW + 0.04) continue;
    const x = SH.x + Math.sin(a) * SH.R, z = SH.z + Math.cos(a) * SH.R;
    W.col(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, Hw + 0.3, { kind: 'yurt' });
  }
  // төр (есіктің қарсысы): сандықтар, жүк (жиналған көрпе-жастық), тұскиіздер
  const torA = PI / 2, tx = SH.x + Math.sin(torA) * (SH.R - 0.55), tz = SH.z;
  const chestTex = G.canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#7a2a12'; g.fillRect(0, 0, w, h); g.strokeStyle = GOLD; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); oyu(g, w / 2, h / 2, 34, GOLD); oyu(g, w / 4 - 6, h / 2, 16, GOLD); oyu(g, w * 3 / 4 + 6, h / 2, 16, GOLD); });
  const chestM = new THREE.MeshLambertMaterial({ map: chestTex, roughness: 0.45 });
  for (const dz of [-0.8, 0.8]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 1.0), chestM); c.position.set(tx, 0.32, tz + dz); c.castShadow = true; G.scene.add(c); }
  W.col(tx - 0.3, tx + 0.3, tz - 1.35, tz + 1.35, 0, 1.4, { kind: 'furn' });
  const blanketCols = ['#1f3d7a', '#c0392b', '#e9b949', '#2e8b57', '#8e44ad', '#c0392b', '#1f3d7a'];
  blanketCols.forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 2.0 - i * 0.04), new THREE.MeshLambertMaterial({ color: c, normalMap: null, roughness: 0.95 }));
    b.position.set(tx, 0.64 + i * 0.1, tz); b.castShadow = true; G.scene.add(b);
  });
  for (const dz of [-0.6, 0, 0.6]) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshLambertMaterial({ color: '#f3e2b3', roughness: 0.95 })); p.scale.set(0.9, 0.55, 1.2); p.position.set(tx, 1.43, tz + dz); G.scene.add(p); }
  const tusTex = G.canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#14254f'; g.fillRect(0, 0, w, h); g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = RED; g.fillRect(20, 20, w - 40, 18); g.fillRect(20, h - 38, w - 40, 18);
    oyu(g, w / 2, h / 2, 44, '#f3e2b3'); oyu(g, w / 2 - 80, h / 2, 22, GOLD); oyu(g, w / 2 + 80, h / 2, 22, GOLD);
  });
  for (const a of [PI / 2 - 0.62, PI / 2 + 0.62, PI / 2 - 1.5, PI / 2 + 1.5]) {
    const r = SH.R - 0.12, m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), new THREE.MeshLambertMaterial({ map: tusTex, roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(SH.x + Math.sin(a) * r, 1.2, SH.z + Math.cos(a) * r); m.rotation.y = a + PI; G.scene.add(m);
  }
  // дастарқан: аласа дөңгелек үстел, шәйнек, кесе, бауырсақ
  const tbl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.08, 40), M('#5a3215', { roughness: 0.4 })); tbl.position.set(SH.x, 0.34, SH.z); tbl.castShadow = true; G.scene.add(tbl);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 2 * PI + PI / 4, lg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 10), M('#4a280f')); lg.position.set(SH.x + Math.cos(a) * 0.75, 0.15, SH.z + Math.sin(a) * 0.75); G.scene.add(lg); }
  const cloth = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshLambertMaterial({ map: G.canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h); g.strokeStyle = RED; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h / 2, 116, 0, 7); g.stroke(); for (let k = 0; k < 8; k++) { const a = k / 8 * 2 * PI; oyu(g, w / 2 + Math.cos(a) * 92, h / 2 + Math.sin(a) * 92, 10, RED); } }) }));
  cloth.rotation.x = -PI / 2; cloth.position.set(SH.x, 0.385, SH.z); G.scene.add(cloth);
  W.col(SH.x - 0.9, SH.x + 0.9, SH.z - 0.9, SH.z + 0.9, 0, 0.4, { kind: 'furn' });
  const potM = M('#1f5fbf', { roughness: 0.25, metalness: 0.1 });
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), potM); pot.scale.y = 0.8; pot.position.set(SH.x, 0.5, SH.z); G.scene.add(pot);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), potM); lid.position.set(SH.x, 0.63, SH.z); G.scene.add(lid);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.18, 10), potM); spout.position.set(SH.x + 0.17, 0.53, SH.z); spout.rotation.z = -0.9; G.scene.add(spout);
  const bauM = M('#d38b3a', { roughness: 0.7 });
  for (let k = 0; k < 22; k++) { const a = k * 2.4, r = 0.32 + (k % 3) * 0.07, b = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), bauM); b.scale.set(1, 0.8, 1.2); b.position.set(SH.x + Math.cos(a) * r, 0.42, SH.z + Math.sin(a) * r); G.scene.add(b); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * 2 * PI + 0.3, c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.034, 0.06, 16), M('#ffffff', { roughness: 0.2 })); c.position.set(SH.x + Math.cos(a) * 0.72, 0.42, SH.z + Math.sin(a) * 0.72); G.scene.add(c);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.006, 6, 18), potM); band.rotation.x = PI / 2; band.position.set(c.position.x, 0.44, c.position.z); G.scene.add(band); }
  // көрпешелер мен жастықтар (есіктің алдына және төрге орын қоймаймыз)
  const korpe = M('#b3261e', { roughness: 0.95 }), korpe2 = M('#1f3d7a', { roughness: 0.95 }), pilM = M(GOLD, { roughness: 0.9 });
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * 2 * PI + PI / 12;
    const da = Math.abs(((a - doorA + 3 * PI) % (2 * PI)) - PI); if (da < 0.45) continue;
    const r = 2.1, x = SH.x + Math.sin(a) * r, z = SH.z + Math.cos(a) * r;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.6), k % 2 ? korpe : korpe2); c.position.set(x, 0.09, z); c.rotation.y = a; c.receiveShadow = true; G.scene.add(c);
    const bx = SH.x + Math.sin(a) * (r + 0.55), bz = SH.z + Math.cos(a) * (r + 0.55);
    const pil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), pilM); pil.scale.set(1, 0.65, 0.35); pil.position.set(bx, 0.3, bz); pil.rotation.y = a; G.scene.add(pil);
    yard.shSeats.push({ area: 'sh', id: k, x, z, y: 0.12 - 0.86, f: a, px: SH.x + Math.sin(a) * (r + 0.05), pz: SH.z + Math.cos(a) * (r + 0.05), hold: false, cross: true });
  }
  // ішкі жылы жарық: шаңырақтан ілінген шам
  const lampIn = new THREE.PointLight(0xffc27a, 0.8, 10, 1.5); lampIn.position.set(SH.x, HT - 0.75, SH.z); G.scene.add(lampIn);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), M('#222')); cord.position.set(SH.x, HT - 0.38, SH.z); G.scene.add(cord);
  const lampBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), nightBulb('#ffd27a')); lampBall.position.copy(lampIn.position); G.scene.add(lampBall);
  G.sign(12.2, 9.4, ['Шайхана', 'E — ішке кіріп отыру'], 1);
  G.extras.push({ x: SH.x, z: SH.z, y: 0.04, r: 4.2, label: 'E — Дастарқан басына отыру (чат)', action: () => yard.onSit && yard.onSit('sh') });

  // ---------------- Аула шамдары ----------------
  const pole = M('#2b2f36');
  yard.lights = [];
  for (const [x, z] of [[-3.2, 9], [3.2, 9], [-3.2, 16], [3.2, 16], [-3.2, 23], [3.2, 23], [-7.2, 7.4], [9, 9.6]]) {
    const p = boxR(x - 0.06, x + 0.06, 0, 3.2, z - 0.06, z + 0.06, pole, { col: true }); p.castShadow = true;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), nightBulb('#fff0c8')); b.position.set(x, 3.3, z); G.scene.add(b);
    (yard.posts || (yard.posts = [])).push({ x, z, pole: p, bulb: b });
  }
  for (const [x, z] of [[0, 14], [lcx, lcz], [SH.x - SH.R - 1.5, SH.z]]) {
    const l = new THREE.PointLight(0xffdca0, 0, 16, 1.6); l.position.set(x, 3.4, z); G.scene.add(l); yard.lights.push(l);
  }
})();
