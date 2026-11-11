// =====================================================================
//  props.js — дайын 3D модельдер (реквизит): assets/props-data.js + текстуралар
//  Модельдер Sketchfab-тағы жинақтардан алынып, ойынға ықшамдалды (авторлары README-де).
//  Жүктелмесе (мысалы, file:// арқылы ашылса) ойын бұрынғы қарапайым заттармен жұмыс істей береді.
// =====================================================================
(function () {
  const G = window.__game;
  if (!G) return;
  const { THREE, scene, W } = G;
  const PI = Math.PI;
  const BASE = 'assets/';
  const depthFor = (mat) => mat.userData.depth || (mat.userData.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.5 }));

  async function load() {
    // деректер JS файлында (base64): file:// арқылы ашқанда да жүктеледі
    if (!window.__PROPS_DATA) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = BASE + 'props-data.js'; sc.onload = res; sc.onerror = () => rej(new Error('props-data.js')); document.head.appendChild(sc); });
    const js = window.__PROPS_DATA; if (!js) throw new Error('no data');
    const raw = atob(js.bin), u8 = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const bin = u8.buffer; js.bin = null;
    const TL = new THREE.TextureLoader(), texCache = {};
    const tex = (f) => texCache[f] || (texCache[f] = (() => {
      const t = TL.load(BASE + f); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })());
    const mats = js.mats.map(m => {
      const metalName = /metal|chrome|steel|light_shader|lamp/i.test(m.n);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(m.c[0], m.c[1], m.c[2]),            // glTF түстері сызықтық
        roughness: Math.max(0.3, m.r == null ? 0.8 : m.r), metalness: metalName ? Math.min(0.8, m.m || 0) : 0,
        side: m.ds ? THREE.DoubleSide : THREE.FrontSide
      });
      if (m.t) mat.map = tex(m.t);
      if (m.a !== 'OPAQUE') { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; mat.userData.cut = true; }
      return mat;
    });
    const P = {};
    for (const [key, p] of Object.entries(js.props)) {
      P[key] = {
        size: p.size,
        parts: p.parts.map(pt => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, pt.po, pt.v * 3), 3));
          g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, pt.no, pt.v * 4), 4), 3, 0, true));
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, pt.uo, pt.v * 2), 2));
          g.setIndex(new THREE.BufferAttribute(pt.i16 ? new Uint16Array(bin, pt.io, pt.ic) : new Uint32Array(bin, pt.io, pt.ic), 1));
          g.computeBoundingSphere();
          return { g, mat: mats[pt.m] };
        })
      };
    }
    P.__mats = mats; return P;
  }

  // Бірдей заттарды бір сызу шақыруымен (InstancedMesh) салу. list: [{x,y,z,ry,s,sx,sy,sz}]
  function place(P, key, list, opt) {
    const p = P[key]; if (!p || !list.length) return;
    opt = opt || {};
    const o = new THREE.Object3D(), made = [];
    for (const part of p.parts) {
      const im = new THREE.InstancedMesh(part.g, part.mat, list.length);
      list.forEach((t, i) => {
        o.position.set(t.x, t.y || 0, t.z); o.rotation.set(0, t.ry || 0, 0);
        const s = t.s || 1; o.scale.set((t.sx || 1) * s, (t.sy || 1) * s, (t.sz || 1) * s); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      });
      im.castShadow = opt.shadow !== false; im.receiveShadow = true;
      if (part.mat.userData.cut) im.customDepthMaterial = depthFor(part.mat);
      im.frustumCulled = false; // инстанстар кең таралған
      scene.add(im); made.push(im);
    }
    if (opt.col) for (const t of list) {
      const s = t.s || 1, rot = Math.abs(Math.sin(t.ry || 0)) > 0.7;
      const hx = p.size[rot ? 2 : 0] * s * (t.sx || 1) / 2 * (opt.shrink || 0.9), hz = p.size[rot ? 0 : 2] * s * (t.sz || 1) / 2 * (opt.shrink || 0.9);
      W.col(t.x - hx, t.x + hx, t.z - hz, t.z + hz, t.y || 0, (t.y || 0) + p.size[1] * s * (t.sy || 1), { kind: 'furn' });
    }
    return made;
  }
  // Еденде бос па? (қабырға/жиһаз/есік коллайдерлерімен қиылыспасын)
  function freeAt(x, z, y, r) {
    for (const c of W.colliders) {
      if (!c.on || c.kind === 'door') continue;
      if (c.y1 < y + 0.05 || c.y0 > y + 1.2) continue;
      if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return false;
    }
    for (const d of W.doors) if (Math.abs(x - d.x) < 1.0 && Math.abs(z - d.z) < 1.8) return false;
    return true;
  }
  const faceRY = { '+z': 0, '-z': PI, '+x': PI / 2, '-x': -PI / 2 };

  load().then((P) => {
    const mats = P.__mats; delete P.__mats;
    const S = G.slots || [];
    const L = { pc: [], chair: [], board: [], clock: [], plant: [], trash: [], cooler: [], lamp: [], filebox: [], fan: [], printer: [] };
    // --- бөлмелер ішіндегі слоттар ---
    for (const sl of S) {
      const r = sl.room || {};
      if (sl.k === 'sdesk' && r.num === '10') {
        for (const sx of [-0.28, 0.28]) L.pc.push({ x: sl.x + sx, y: sl.y + 0.76, z: sl.z - sl.f * 0.02, ry: sl.f > 0 ? 0 : PI, s: 0.85 });
      }
      if (sl.k === 'board' && !sl.dark) {
        const ry = faceRY[sl.face] || 0, nx = Math.sin(ry), nz = Math.cos(ry);
        L.board.push({ x: sl.x + nx * 0.1, y: sl.y - 0.62, z: sl.z + nz * 0.1, ry, sx: (sl.w + 0.3) / 5.5, sy: 0.86, sz: 0.6 });
        if (r.type === 'classroom') L.clock.push({ x: sl.x + nx * 0.03, y: sl.y + 0.78, z: sl.z + nz * 0.03, ry, s: 1 });
      }
      if (sl.k === 'odesk') {
        const cx = (sl.x0 + sl.x1) / 2, cz = (sl.z0 + sl.z1) / 2, wx = sl.x1 - sl.x0, wz = sl.z1 - sl.z0;
        const rcx = r.x0 != null ? (r.x0 + r.x1) / 2 : cx, rcz = r.z0 != null ? (r.z0 + r.z1) / 2 : cz;
        // орындық үстелдің ұзын жағында, бөлме ортасынан алыс жақта, ортаға қарап отырады
        let chair, face;
        if (wx >= wz) { const sd = cz >= rcz ? 1 : -1; chair = { x: cx, z: cz + sd * (wz / 2 + 0.42) }; face = sd > 0 ? PI : 0; }
        else { const sd = cx >= rcx ? 1 : -1; chair = { x: cx + sd * (wx / 2 + 0.42), z: cz }; face = sd > 0 ? -PI / 2 : PI / 2; }
        const inRoom = r.x0 == null || (chair.x > r.x0 + 0.45 && chair.x < r.x1 - 0.45 && chair.z > Math.min(r.z0, r.z1) + 0.45 && chair.z < Math.max(r.z0, r.z1) - 0.45);
        if (r.type !== 'classroom' && inRoom) { L.chair.push({ x: chair.x, y: sl.y, z: chair.z, ry: face, s: 0.95 }); }
        // үстел үсті: компьютер (кабинеттерде) немесе шам мен папкалар (сыныпта)
        const topY = sl.y + 0.76;
        if (r.type === 'classroom') { L.lamp.push({ x: cx, y: topY, z: cz - wz * 0.25, ry: PI / 2 }); L.filebox.push({ x: cx, y: topY, z: cz + wz * 0.2, ry: 0 }); }
        else if (Math.min(wx, wz) >= 0.6) L.pc.push({ x: cx, y: topY, z: cz, ry: face + PI, s: 0.8 });
        else L.filebox.push({ x: cx, y: topY, z: cz, ry: 0 });
      }
    }
    // --- әр бөлмеге: гүл, қоқыс жәшігі, кейбіріне су құйғыш, желдеткіш ---
    for (const r of W.rooms) {
      if (['wc', 'storage'].includes(r.type)) continue;
      const y = r.base, front = r.side === 'front', inn = front ? 1 : -1;
      const zDoor = front ? r.z0 : r.z1, zOut = front ? r.z1 : r.z0;
      const ix0 = r.x0 + 0.4, ix1 = r.x1 - 0.4;
      const try1 = (list, cands, rad, extra) => { for (const [x, z] of cands) if (freeAt(x, z, y, rad)) { list.push(Object.assign({ x, y, z, ry: Math.random() * PI * 2 }, extra || {})); W.col(x - rad, x + rad, z - rad, z + rad, y, y + 0.9, { kind: 'furn' }); return true; } return false; };
      if (r.type === 'reception') {
        try1(L.plant, [[ix0 + 0.1, zOut - inn * 0.45], [ix0 + 0.1, zOut - inn * 1.2]], 0.25, { s: 1.4 });
        try1(L.plant, [[ix1 - 0.1, zOut - inn * 0.45], [ix1 - 0.1, zOut - inn * 1.2]], 0.25, { s: 1.4 });
        try1(L.cooler, [[ix1 - 0.1, zOut - inn * 2.2], [ix0 + 0.1, zOut - inn * 2.2], [ix1 - 0.1, zOut - inn * 3.0]], 0.22, { ry: front ? -PI / 2 : PI / 2 });
        continue;
      }
      try1(L.plant, [[ix1, zOut - inn * 0.1], [ix0, zOut - inn * 0.1], [ix1, (r.z0 + r.z1) / 2]], 0.24, { s: 1.15 });
      const dx = r.doorX != null ? r.doorX : (r.x0 + r.x1) / 2;
      try1(L.trash, [[dx + 1.05, zDoor + inn * 0.35], [dx - 1.05, zDoor + inn * 0.35], [ix1, zDoor + inn * 0.4]], 0.22);
      if (r.type === 'teachers') try1(L.cooler, [[ix1, zDoor + inn * 0.5], [ix0, zDoor + inn * 0.5]], 0.22, { ry: -PI / 2 });
      if (r.type === 'office' || r.type === 'psychology') try1(L.fan, [[ix0, zOut - inn * 0.2], [ix1, zOut - inn * 0.2]], 0.25);
      if (r.type === 'teachers') try1(L.printer, [[ix0 + 0.2, zOut - inn * 0.45]], 0.42, { ry: front ? PI : 0 });
    }
    place(P, 'pc', L.pc); place(P, 'chair', L.chair, { col: true, shrink: 0.6 }); place(P, 'board', L.board, { shadow: false });
    place(P, 'clock', L.clock, { shadow: false }); place(P, 'plant', L.plant); place(P, 'trash', L.trash); place(P, 'cooler', L.cooler);
    place(P, 'lamp', L.lamp); place(P, 'filebox', L.filebox); place(P, 'fan', L.fan); place(P, 'printer', L.printer);

    // --- аула: нақты ағаштар (конус/шар орнына) ---
    const trees = S.filter(t => t.k === 'tree');
    if (trees.length && P.treeA) {
      if (G.procTrees) G.procTrees.visible = false;
      const A = [], B = [];
      trees.forEach((t, i) => (i % 3 === 2 ? B : A).push({ x: t.x, y: 0, z: t.z, ry: (t.x * 13 + t.z * 7) % (2 * PI), s: (i % 3 === 2 ? 0.95 : 0.85) * t.s }));
      G.treeMeshes = place(P, 'treeA', A).concat(place(P, 'treeB', B));
    }
    // шөп шоқтары — аула жиегінде, жолдан тыс
    if (P.grass) {
      const gl = []; let sd = 11;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      for (let i = 0; i < 260 && gl.length < 140; i++) {
        const x = -34 + rnd() * 68, z = 4.5 + rnd() * 26;
        if (Math.abs(x) < 4.2) continue;                                     // орталық жол
        if (x > -29 && x < -7 && z > 7 && z < 23) continue;                   // кітапхана
        if (Math.hypot(x - 18, z - 15) < 6) continue;                         // киіз үй
        gl.push({ x, y: 0, z, ry: rnd() * 6.28, s: 0.22 + rnd() * 0.12 });
      }
      G.grassTufts = place(P, 'grass', gl, { shadow: false });
    }
    // орындықтар мен қоқыс жәшіктері (жол бойында)
    if (P.bench) {
      (G.oldBenches || []).forEach(m => { m.visible = false; });
      const bl = [], tl = [];
      for (const [x, z, ry] of [[-5.2, 11.8, PI / 2], [5.2, 11.8, -PI / 2], [-5.2, 19.6, PI / 2], [5.2, 19.6, -PI / 2]]) {
        bl.push({ x, y: 0, z, ry, s: 0.85 }); tl.push({ x, y: 0, z: z + 1.9, ry: 0, s: 0.7 });
      }
      place(P, 'bench', bl, { col: true, shrink: 0.8 }); place(P, 'trashc', tl, { col: true, shrink: 0.7 });
      // әр орындықта 3 отыратын орын: E — отыру (online.js: area 'bench')
      const Y = G.yard || (G.yard = {}); Y.benchSeats = [];
      bl.forEach((b, bi) => {
        const dx = Math.sin(b.ry), dz = Math.cos(b.ry), ax = Math.cos(b.ry), az = -Math.sin(b.ry);   // қарау бағыты және орындық бойы
        for (const off of [-0.75, 0, 0.75]) {
          const x = b.x + ax * off - dx * 0.08, z = b.z + az * off - dz * 0.08;
          Y.benchSeats.push({ area: 'bench', id: bi * 3 + (off < 0 ? 0 : off > 0 ? 2 : 1), x, z, y: 0.47 - 0.86, f: b.ry + PI, px: x + dx * 0.85, pz: z + dz * 0.85, hold: false });
        }
        G.extras.push({ x: b.x + dx * 0.7, z: b.z + dz * 0.7, y: 0, r: 1.9, label: 'E — Орындыққа отыру', action: () => Y.onSit && Y.onSit('bench', b) });
      });
    }
    // аула шамдары: қара металл бағаналы шамдар
    if (P.streetlight && G.yard && G.yard.posts) {
      const sl = [];
      for (const p of G.yard.posts) { p.pole.visible = false; p.bulb.position.y = 3.7; p.bulb.scale.setScalar(0.6); sl.push({ x: p.x, y: 0, z: p.z, ry: 0, s: 0.95 }); }
      place(P, 'streetlight', sl);
    }
    G.propMats = mats; G.propLists = L; G.propsReady = true; dispatchEvent(new Event('jas:props'));
  }).catch((e) => { console.warn('3D реквизит жүктелмеді:', e && e.message); });
})();
