// =====================================================================
//  env.js — аспан, күн мен түн (нақты уақыт бойынша), бұлттар, жұлдыздар,
//  сапа баптаулары (Төмен / Орта / Жоғары) және ойын ішіндегі нұсқаулық.
// =====================================================================
(function () {
  const G = window.__game;
  if (!G) return;
  const { THREE, scene, renderer, sun, hemi, amb } = G;
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jasabay.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jasabay.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const isTouch = G.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const cfg = Object.assign({ quality: 'auto', time: 'day', sens: 1, season: 'auto' }, LS.get('settings', {}));
  G.sens = cfg.sens;

  // ---------------- Аспан күмбезі ----------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#4a8fd8') }, bottom: { value: new THREE.Color('#d6ebf8') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff2d0') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP;
      void main(){ float h = clamp(vP.y * 1.15 + 0.08, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7));
        float s = max(dot(vP, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat); scene.add(sky);
  scene.background = null;
  // Жұлдыздар
  const starGeo = new THREE.BufferGeometry(), pts = [];
  for (let i = 0; i < 700; i++) { const u = Math.random() * 2 * PI, v = Math.random() * 0.9 + 0.08; const r = 190; pts.push(Math.cos(u) * Math.cos(v * PI / 2) * r, Math.sin(v * PI / 2) * r, Math.sin(u) * Math.cos(v * PI / 2) * r); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
  // Бұлттар
  const cloudTex = G.canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 9; i++) {
      const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 22 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    const a = Math.random() * 2 * PI, d = 90 + Math.random() * 70;
    m.position.set(Math.cos(a) * d, 45 + Math.random() * 35, Math.sin(a) * d); const s = 30 + Math.random() * 30; m.scale.set(s, s / 2, 1);
    m.userData.speed = 0.4 + Math.random() * 0.6; scene.add(m); clouds.push(m);
  }

  // ---------------- Тәулік уақыты ----------------
  const C = (h) => new THREE.Color(h);
  const PAL = {                       // [аспан төбесі, көкжиек, күн түсі]
    night: [C('#071027'), C('#1a2a4f'), C('#9fb4ff')],
    dawn: [C('#3d5f9c'), C('#f2a35e'), C('#ffb36b')],
    day: [C('#3f86d6'), C('#d4ecfa'), C('#fff4dc')]
  };
  const TIMES = { real: null, morning: 8, day: 13, evening: 18.6, night: 22.5 };
  function hourNow() {
    if (TIMES[cfg.time] != null) return TIMES[cfg.time];
    const d = new Date(); return d.getHours() + d.getMinutes() / 60;
  }
  const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpC = new THREE.Color();
  let lastHourKey = '';
  function applyTime(force) {
    const h = hourNow(), key = h.toFixed(2);
    if (!force && key === lastHourKey) return; lastHourKey = key;
    const el = Math.sin((h - 6) / 12 * PI);                     // -1..1, 6:00 мен 18:00-де 0
    const az = (h - 12) / 12 * PI;
    const dir = new THREE.Vector3(Math.sin(az) * 0.8, Math.max(el, -0.3), -Math.cos(az) * 0.5 + 0.6).normalize();
    // палитра араластыру
    const day = Math.max(0, Math.min(1, (el - 0.05) / 0.35)), dusk = Math.max(0, 1 - Math.abs(el - 0.02) / 0.22), night = Math.max(0, Math.min(1, -el / 0.15));
    const mix = (i) => { tmpA.copy(PAL.day[i]).multiplyScalar(day); tmpB.copy(PAL.dawn[i]).multiplyScalar(dusk * (1 - day)); tmpC.copy(PAL.night[i]).multiplyScalar(night); const s = day + dusk * (1 - day) + night || 1; return tmpA.clone().add(tmpB).add(tmpC).multiplyScalar(1 / s); };
    const grey = WX.grey || 0, GR = C('#9aa8b8');
    skyMat.uniforms.top.value.copy(mix(0)).lerp(GR, grey); skyMat.uniforms.bottom.value.copy(mix(1)).lerp(C('#d5dde6'), grey * 0.8); skyMat.uniforms.sunCol.value.copy(mix(2));
    skyMat.uniforms.sunDir.value.copy(el > -0.1 ? dir : new THREE.Vector3(-dir.x, 0.6, -dir.z));
    scene.fog.color.copy(mix(1)).convertSRGBToLinear();
    // жарықтар (ғимарат іші тым қараңғы болмауы үшін hemi/ambient аз ғана өзгереді)
    sunDir.copy(el > 0 ? dir : new THREE.Vector3(-0.4, 0.8, 0.3).normalize());   // түнде — ай жарығы
    sun.color.copy(mix(2)).convertSRGBToLinear(); sun.intensity = (el > 0 ? 0.35 + 1.25 * Math.min(1, el * 1.8) : 0.12) * (1 - grey * 0.45);
    hemi.intensity = 0.3 + 0.18 * day + 0.1 * night; hemi.color.copy(night > 0.5 ? C('#aab8e6') : C('#ffffff')).convertSRGBToLinear();
    hemi.groundColor.setSRGB(night > 0.5 ? '#2a2d3a' : '#8a8270');
    amb.intensity = 0.14 + 0.04 * day + 0.08 * night;
    renderer.toneMappingExposure = 1.05 + 0.2 * night;
    G.envDirty = true;
    stars.material.opacity = night * 0.9;
    for (const c of clouds) c.material.opacity = Math.min(1, 0.25 + 0.65 * day + grey * 0.4);
    scene.fog.near = 60 - grey * 35; scene.fog.far = 160 - grey * 70;
    // түнгі шамдар мен терезелер
    const lit = el < 0.08;
    if (G.yard) { for (const n of G.yard.night) n.mat.color.setSRGB(lit ? n.night : n.day); for (const l of G.yard.lights) l.intensity = lit ? 0.9 : 0; }
    // әйнек: күндіз айнадай шағылысады, түнде іштен жылы жарық
    for (const gm of [G.glassOut, G.winGlassOut]) if (gm && gm.emissive) { gm.emissive.setSRGB(lit ? '#d9a95c' : '#000000'); gm.emissiveIntensity = lit ? 0.85 : 0; gm.metalness = lit ? 0.3 : 0.9; }
    G.isNight = lit;
    $('clock') && ($('clock').textContent = (cfg.time === 'real' ? '🕒 ' : '⏸ ') + String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0') + (lit ? ' 🌙' : ' ☀️') + (WX.label ? ' · ' + WX.label : ''));
  }
  // ---------------- Шағылыс ортасы (PMREM): аспаннан әйнек/металл шағылысы ----------------
  const sunDir = new THREE.Vector3(0, 1, 0);
  const envSky = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: skyMat.uniforms, vertexShader: skyMat.vertexShader,
    fragmentShader: skyMat.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);', 'gl_FragColor = linearToOutputTexel(vec4(pow(c, vec3(2.2)), 1.0));') });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envSky));
  const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(49, 24), new THREE.MeshBasicMaterial({ color: '#6f7a5a' })); groundEnv.rotation.x = -PI / 2; groundEnv.position.y = -3; envScene.add(groundEnv);
  let pmrem = null, envRT = null;
  function rebuildEnv() {
    G.envDirty = false;
    if (!THREE.PMREMGenerator) return;
    try {
      pmrem = pmrem || new THREE.PMREMGenerator(renderer);
      groundEnv.material.color.setSRGB(G.isNight ? '#15171d' : '#6f7a5a');
      const rt = pmrem.fromScene(envScene, 0.02);
      if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture;
    } catch (e) { console.warn('env', e); }
  }
  // ---------------- Жыл мезгілдері мен ауа райы ----------------
  // Нақты айға қарай (немесе баптаудан): қыс — қар, ақ жер, жапырақсыз ағаштар; көктем — жасыл, кейде жаңбыр;
  // жаз — ашық күн; күз — сары-қызғылт жапырақтар, жапырақ түседі.
  const WX = { season: 'summer', kind: null, grey: 0 };
  function seasonNow() {
    if (cfg.season && cfg.season !== 'auto') return cfg.season;
    const m = new Date().getMonth();
    return m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
  }
  const daySeed = () => { const d = new Date(); return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % 7; };
  const snowTex = G.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f7fb'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const v = 215 + Math.random() * 40; g.fillStyle = `rgba(${v - 10},${v},${v + 15},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
  snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping; snowTex.repeat.set(70, 70);
  const flake = (draw) => G.canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); draw(g, w, h); });
  const TEXP = {
    snow: flake((g, w, h) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 28); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
    rain: flake((g, w, h) => { g.strokeStyle = 'rgba(200,215,235,0.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.stroke(); }),
    leaf: flake((g, w, h) => { g.fillStyle = '#e07a1f'; g.beginPath(); g.ellipse(32, 32, 26, 12, 0.6, 0, 7); g.fill(); g.strokeStyle = '#8a3d10'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 46); g.lineTo(54, 18); g.stroke(); })
  };
  const NP = 1600, pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.12, map: TEXP.snow, transparent: true, depthWrite: false, alphaTest: 0.02 });
  const parts = new THREE.Points(pGeo, pMat); parts.frustumCulled = false; parts.visible = false; scene.add(parts);
  const BOX = 22;
  for (let i = 0; i < NP; i++) { pPos[i * 3] = (Math.random() - 0.5) * BOX * 2; pPos[i * 3 + 1] = Math.random() * 16; pPos[i * 3 + 2] = (Math.random() - 0.5) * BOX * 2; pVel[i] = 0.6 + Math.random() * 0.8; }
  const tint = (m, c) => { if (m && m.color) m.color.setSRGB(c); };
  let grassMap0 = null, grassN0 = null;
  function applySeason(force) {
    const se = seasonNow(), ds = daySeed();
    const kind = se === 'winter' ? 'snow' : se === 'autumn' ? (ds % 3 === 0 ? 'rain' : 'leaf') : se === 'spring' ? (ds % 3 === 0 ? 'rain' : null) : null;
    if (!force && se === WX.season && kind === WX.kind) return;
    WX.season = se; WX.kind = kind; WX.grey = kind === 'rain' ? 0.6 : se === 'winter' ? 0.35 : se === 'autumn' ? 0.15 : 0;
    // жер
    const gm = G.grassMesh && G.grassMesh.material;
    if (gm) {
      if (!grassMap0) { grassMap0 = gm.map; grassN0 = gm.normalMap; }
      if (se === 'winter') { gm.map = snowTex; gm.normalMap = null; tint(gm, '#ffffff'); }
      else { gm.map = grassMap0; gm.normalMap = grassN0; tint(gm, se === 'autumn' ? '#d9c27a' : se === 'summer' ? '#f4f6d8' : '#ffffff'); }
      gm.needsUpdate = true;
    }
    // ағаштар, бұталар, туялар
    const leafTint = { winter: '#ffffff', spring: '#d6f7a8', summer: '#ffffff', autumn: '#ff9a3c' }[se];
    for (const m of (G.propMats || [])) if (/leaves/i.test(m.name || '')) { m.visible = se !== 'winter'; tint(m, leafTint); }
    if (G.LEAF) { tint(G.LEAF.bush, se === 'winter' ? '#dfe9ef' : se === 'autumn' ? '#e0a050' : '#ffffff'); tint(G.LEAF.thuja, se === 'winter' ? '#cfdfe2' : '#ffffff'); tint(G.LEAF.tree, leafTint); tint(G.LEAF.tree2, leafTint); }
    (G.grassTufts || []).forEach(m => { m.visible = se !== 'winter'; });
    // жауын-шашын
    parts.visible = !!kind; if (kind) { pMat.map = TEXP[kind]; pMat.size = kind === 'leaf' ? 0.22 : kind === 'rain' ? 0.35 : 0.12; pMat.needsUpdate = true; }
    G.weather = { season: se, kind };
    const lbl = { winter: '❄️ Қыс', spring: '🌱 Көктем', summer: '☀️ Жаз', autumn: '🍂 Күз' }[se] + (kind === 'rain' ? ' · жаңбыр' : kind === 'snow' ? ' · қар' : '');
    WX.label = lbl; lastHourKey = ''; applyTime(true);
  }
  for (const m of (G.LEAF ? Object.values(G.LEAF) : [])) m.name = m.name || 'leafproc';
  addEventListener('jas:props', () => applySeason(true));
  const B = G.S.building;
  G.frameHooks.push((dt, t) => {
    if (!parts.visible && !WX.kind) return;
    const cp = G.camera.position;
    const inside = (cp.x > B.x0 - 0.5 && cp.x < B.x1 + 0.5 && cp.z > B.z0 - 0.5 && cp.z < B.z1 + 0.5 && cp.y < 9) || (G.yard && G.yard.sh && Math.hypot(cp.x - G.yard.sh.x, cp.z - G.yard.sh.z) < G.yard.sh.R);
    parts.visible = !!WX.kind && !inside;
    if (!parts.visible) return;
    parts.position.set(Math.round(cp.x), 0, Math.round(cp.z));
    const sp = WX.kind === 'rain' ? 14 : WX.kind === 'leaf' ? 1.2 : 1.6;
    for (let i = 0; i < NP; i++) {
      const k = i * 3; pPos[k + 1] -= pVel[i] * sp * dt;
      if (WX.kind !== 'rain') { pPos[k] += Math.sin(t * 0.8 + i) * dt * (WX.kind === 'leaf' ? 0.9 : 0.3); pPos[k + 2] += Math.cos(t * 0.6 + i * 1.3) * dt * 0.3; }
      if (pPos[k + 1] < 0) pPos[k + 1] += 16;
    }
    pGeo.attributes.position.needsUpdate = true;
  });
  if (!sun.target.parent) scene.add(sun.target);
  applySeason(true); rebuildEnv();
  // Көлеңке камерасы ойыншының соңынан жүреді (жақын көлеңкелер анық)
  const SNAP = 2;
  G.frameHooks.push(() => {
    const p = G.av.g.position, tx = Math.round(p.x / SNAP) * SNAP, tz = Math.round(p.z / SNAP) * SNAP;
    sun.target.position.set(tx, 0, tz); sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position);
    if (G.envDirty) rebuildEnv();
  });
  let tAcc = 0;
  G.frameHooks.push((dt, t) => {
    for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 170) c.position.x = -170; }
    sky.position.copy(G.camera.position); stars.position.copy(G.camera.position);
    tAcc += dt; if (tAcc > 5) { tAcc = 0; applyTime(false); }
  });

  // ---------------- Сапа ----------------
  function applyQuality() {
    let q = cfg.quality;
    if (q === 'auto') q = isTouch ? 'low' : 'high';
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) : q === 'mid' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    const sh = q !== 'low';
    renderer.shadowMap.enabled = sh; sun.castShadow = sh;
    if (sh) { const sz = q === 'high' ? 2048 : 1024; if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } }
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
    for (const c of clouds) c.visible = q !== 'low';
    renderer.setSize(innerWidth, innerHeight);
    G.quality = q;
  }
  applyQuality();

  // ---------------- Баптаулар панелі ----------------
  function renderSettings() {
    const opt = (name, val, label) => `<button class="opt${cfg[name] === val ? ' on' : ''}" data-k="${name}" data-v="${val}">${label}</button>`;
    $('set-body').innerHTML = `
      <h4>Графика сапасы</h4><div>${opt('quality', 'auto', 'Авто')}${opt('quality', 'low', 'Төмен')}${opt('quality', 'mid', 'Орта')}${opt('quality', 'high', 'Жоғары')}</div>
      <p class="hint">Телефонда «Төмен» немесе «Орта» жылдамырақ жүреді. «Жоғары» — көлеңкелер мен анық сурет.</p>
      <h4>Тәулік уақыты</h4><div>${opt('time', 'real', 'Нақты уақыт')}${opt('time', 'morning', 'Таң')}${opt('time', 'day', 'Күндіз')}${opt('time', 'evening', 'Кеш')}${opt('time', 'night', 'Түн')}</div>
      <h4>Жыл мезгілі мен ауа райы</h4><div>${opt('season', 'auto', 'Нақты күн')}${opt('season', 'spring', '🌱 Көктем')}${opt('season', 'summer', '☀️ Жаз')}${opt('season', 'autumn', '🍂 Күз')}${opt('season', 'winter', '❄️ Қыс')}</div>
      <p class="hint">«Нақты күн» — бүгінгі айға қарай: қыста қар жауады, күзде жапырақ түседі, көктемде кейде жаңбыр.</p>
      <h4>Камера сезімталдығы</h4><input type="range" id="set-sens" min="0.4" max="2" step="0.1" value="${cfg.sens}"> <span id="set-sens-v">${cfg.sens}×</span>`;
    $('set-sens').oninput = (e) => { cfg.sens = +e.target.value; G.sens = cfg.sens; $('set-sens-v').textContent = cfg.sens + '×'; LS.set('settings', cfg); };
  }
  $('set-body').addEventListener('click', (e) => {
    const b = e.target.closest('button.opt'); if (!b) return;
    cfg[b.dataset.k] = b.dataset.v; LS.set('settings', cfg);
    if (b.dataset.k === 'quality') applyQuality(); else if (b.dataset.k === 'season') applySeason(true); else applyTime(true);
    renderSettings();
  });
  function openPanel(id) {
    for (const p of ['settings', 'guide']) $(p).classList.toggle('show', p === id && !$(p).classList.contains('show'));
    const open = $('settings').classList.contains('show') || $('guide').classList.contains('show');
    G.paused = open; if (open && document.exitPointerLock) document.exitPointerLock();
    if (id === 'settings') renderSettings();
  }
  G.openPanel = openPanel;
  $('btn-settings').onclick = () => openPanel('settings');
  $('btn-help').onclick = () => openPanel('guide');
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => openPanel(b.dataset.close);
  document.body.classList.toggle('touch', isTouch);
})();
