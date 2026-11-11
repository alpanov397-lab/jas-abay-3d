// =====================================================================
//  world.js — мектептің "қаңқасы": едендер, баспалдақ, қабырғалар,
//  есіктер және ойыншының қозғалыс физикасы. Мұнда графика жоқ,
//  сондықтан бұл файлды браузерсіз де тексеруге болады.
// =====================================================================
(function (root) {
  const T = 0.2;            // қабырға қалыңдығы
  const DOOR_W = 1.0, DOOR_H = 2.2;
  const STEP_UP = 0.5;      // бір қадамда көтерілетін биіктік
  const SNAP_DOWN = 0.6;    // төмен түскенде еденге "жабысу"
  const RADIUS = 0.3;       // ойыншының ені (радиус)
  const BODY_H = 1.75;

  function buildWorld(S) {
    const L = S.levels, B = S.building, C = S.corridor, H = S.hall, ST = S.stairs;
    const W = { S, surfaces: [], colliders: [], walls: [], doors: [], rooms: [], regions: [] };

    const surf = (x0, x1, z0, z1, y, tag) => W.surfaces.push({ x0, x1, z0, z1, y, tag });
    const ramp = (x0, x1, z0, z1, zA, yA, zB, yB, tag) =>
      W.surfaces.push({ x0, x1, z0, z1, ramp: { zA, yA, zB, yB }, tag });
    const col = (x0, x1, z0, z1, y0, y1, extra) => {
      const c = Object.assign({ x0, x1, z0, z1, y0, y1, on: true }, extra || {});
      W.colliders.push(c); return c;
    };
    W.col = col;

    // Қабырға сызығы: axis 'x' — x бойымен созылған (z = c), 'z' — z бойымен (x = c).
    // gaps: [{c, w, top}] — есік ойықтары (top — ойықтың абсолют биіктігі).
    function wallLine(axis, c, a, b, y0, y1, gaps, style) {
      gaps = (gaps || []).filter(g => g.c > a && g.c < b).sort((p, q) => p.c - q.c);
      let cur = a;
      const seg = (s, e, ya, yb) => {
        if (e - s < 0.01 || yb - ya < 0.01) return;
        const box = axis === 'x'
          ? { x0: s, x1: e, z0: c - T / 2, z1: c + T / 2, y0: ya, y1: yb }
          : { x0: c - T / 2, x1: c + T / 2, z0: s, z1: e, y0: ya, y1: yb };
        box.style = style || 'int'; box.axis = axis;
        W.walls.push(box);
        col(box.x0, box.x1, box.z0, box.z1, ya, yb, { kind: 'wall' });
      };
      for (const g of gaps) {
        const g0 = g.c - g.w / 2, g1 = g.c + g.w / 2;
        seg(cur, g0, y0, y1);
        seg(g0, g1, g.top, y1);           // есік үстіндегі бөлік
        cur = g1;
      }
      seg(cur, b, y0, y1);
    }

    // ---------------- Бөлмелер мен есіктер ----------------
    S.rooms.forEach((r, i) => {
      const base = r.floor === 1 ? (r.type === 'reception' ? L.reception : L.floor1) : L.floor2;
      const z0 = r.side === 'front' ? C.z1 : B.z0;
      const z1 = r.side === 'front' ? B.z1 : C.z0;
      const room = Object.assign({ id: 'r' + i, base, z0, z1 }, r);
      W.rooms.push(room);
      if (r.type === 'reception') return;
      const dz = r.side === 'front' ? C.z1 : C.z0;
      const intoRoom = r.side === 'front' ? 1 : -1;      // бөлме қай z бағытында
      W.doors.push({
        id: 'd' + i, room, floor: r.floor, x: r.doorX, z: dz, w: DOOR_W, h: DOOR_H, y: base,
        intoRoom, open: !!r.open, locked: !!r.locked, angle: r.open ? 1 : 0, collider: null
      });
    });

    // ---------------- Әр қабаттың қабырғалары ----------------
    for (const f of [1, 2]) {
      const y0 = f === 1 ? 0 : L.ceil1, y1 = f === 1 ? L.ceil1 : L.ceil2;
      const base = f === 1 ? L.floor1 : L.floor2;
      const dTop = base + DOOR_H;
      const doors = W.doors.filter(d => d.floor === f);
      // Сыртқы қабырғалар
      const front = f === 1 ? [{ c: 0, w: 1.8, top: L.reception + 2.5 }] : [];
      wallLine('x', B.z1, B.x0, B.x1, y0, y1, front, 'ext+z');
      wallLine('x', B.z0, B.x0, B.x1, y0, y1, [], 'ext-z');
      wallLine('z', B.x0, B.z0, B.z1, y0, y1, [], 'ext-x');
      wallLine('z', B.x1, B.z0, B.z1, y0, y1, [], 'ext+x');
      // Дәліздің алдыңғы қабырғасы (z = -7)
      const fg = doors.filter(d => d.z === C.z1).map(d => ({ c: d.x, w: d.w, top: dTop }));
      if (f === 1) fg.push({ c: 0, w: 1.6, top: L.floor1 + 2.4 });  // кіреберістен холлға өтетін ойық
      wallLine('x', C.z1, B.x0, B.x1, y0, y1, fg);
      // Дәліздің артқы қабырғасы (z = -9), холл тұсы ашық
      const bg = doors.filter(d => d.z === C.z0).map(d => ({ c: d.x, w: d.w, top: dTop }));
      wallLine('x', C.z0, B.x0, H.x0, y0, y1, bg);
      wallLine('x', C.z0, H.x1, B.x1, y0, y1, bg);
      // Бөлмелер арасындағы қабырғалар
      for (const side of ['front', 'back']) {
        const xs = new Set();
        W.rooms.filter(r => r.floor === f && r.side === side).forEach(r => { xs.add(r.x0); xs.add(r.x1); });
        const za = side === 'front' ? C.z1 : B.z0, zb = side === 'front' ? B.z1 : C.z0;
        [...xs].filter(x => x > B.x0 && x < B.x1).forEach(x => wallLine('z', x, za, zb, y0, y1, []));
      }
    }

    // ---------------- Едендер ----------------
    surf(-400, 400, -400, 400, 0, 'yard');
    // кіреберіс алдындағы баспалдақ (сыртта)
    surf(-2.5, 2.5, 0, 2.0, L.reception, 'porch');
    ramp(-2.5, 2.5, 2.0, 2.9, 2.9, 0, 2.0, L.reception, 'porch-steps');
    // 1-қабат
    surf(B.x0, H.x0, B.z0, B.z1, L.floor1, 'f1');
    surf(H.x1, B.x1, B.z0, B.z1, L.floor1, 'f1');
    surf(H.x0, H.x1, B.z0, C.z1, L.floor1, 'f1');
    surf(H.x0, H.x1, C.z1, B.z1, L.reception, 'reception');
    ramp(-1.5, 1.5, C.z1, C.z1 + 0.7, C.z1 + 0.7, L.reception, C.z1, L.floor1, 'low-steps');
    // Баспалдақ
    ramp(ST.mid, ST.x1, ST.zLanding, ST.zBottom, ST.zBottom, L.floor1, ST.zLanding, L.landing, 'flight1');
    surf(ST.x0, ST.x1, ST.zBack, ST.zLanding, L.landing, 'landing');
    ramp(ST.x0, ST.mid, ST.zLanding, ST.zBottom, ST.zLanding, L.landing, ST.zBottom, L.floor2, 'flight2');
    // 2-қабат (баспалдақ ойығынан басқа)
    surf(B.x0, ST.x0, B.z0, B.z1, L.floor2, 'f2');
    surf(ST.x0, ST.x1, ST.zBottom, B.z1, L.floor2, 'f2');
    surf(ST.x1, B.x1, B.z0, B.z1, L.floor2, 'f2');

    // ---------------- Баспалдақ қоршаулары ----------------
    col(ST.x0 - 0.05, ST.x0 + 0.05, ST.zBack, ST.zBottom, L.floor1, L.floor2 + 1.1, { kind: 'rail' }); // сол жақ (2-саты мен алаң)
    col(ST.mid - 0.04, ST.mid + 0.04, ST.zLanding, ST.zBottom, L.floor1, L.floor2 + 1.1, { kind: 'rail' }); // екі сатының арасы
    col(ST.x0, ST.mid, ST.zBottom - 0.05, ST.zBottom + 0.05, L.floor1, L.floor2 - 0.2, { kind: 'closet' }); // 2-саты астындағы бөлме
    col(ST.mid, ST.x1, ST.zBottom - 0.05, ST.zBottom + 0.05, L.floor2, L.floor2 + 1.1, { kind: 'rail' }); // 2-қабаттағы қоршау
    // Турникет (аласа сатының жоғарғы жағында)
    col(-0.95, -0.65, C.z1 + 0.05, C.z1 + 0.45, L.reception, L.reception + 1.1, { kind: 'turnstile' });
    col(0.65, 0.95, C.z1 + 0.05, C.z1 + 0.45, L.reception, L.reception + 1.1, { kind: 'turnstile' });

    // Кіреберіс портигі (фасадтан алға шығып тұрған бөлік, есігі алдыңғы жақта)
    const PZ = S.portico || { x: 2.6, z: 1.4, door: 1.7 };
    W.portico = PZ;
    wallLine('x', PZ.z, -PZ.x, PZ.x, 0, L.ceil1 - 0.3, [{ c: 0, w: PZ.door, top: L.reception + 2.45 }], 'ext+z');
    wallLine('z', -PZ.x, B.z1, PZ.z + 0.1, 0, L.ceil1 - 0.3, [], 'ext-x');
    wallLine('z', PZ.x, B.z1, PZ.z + 0.1, 0, L.ceil1 - 0.3, [], 'ext+x');

    // ---------------- Жабық есіктердің коллайдері ----------------
    for (const d of W.doors) {
      d.collider = col(d.x - d.w / 2, d.x + d.w / 2, d.z - 0.06, d.z + 0.06, d.y, d.y + d.h, { kind: 'door', on: !d.open });
    }
    return W;
  }

  // ---------------- Физика ----------------
  function inRect(s, x, z) { return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1; }
  function surfY(s, x, z) {
    if (!s.ramp) return s.y;
    const r = s.ramp, t = Math.min(1, Math.max(0, (z - r.zA) / (r.zB - r.zA)));
    return r.yA + (r.yB - r.yA) * t;
  }
  function groundAt(W, x, z, feet) {
    let best = -1e9;
    for (const s of W.surfaces) {
      if (!inRect(s, x, z)) continue;
      const y = surfY(s, x, z);
      if (y <= feet + STEP_UP && y > best) best = y;
    }
    return best;
  }
  function blocks(c, feet) { return c.on && c.y1 > feet + 0.4 && c.y0 < feet + BODY_H; }
  function resolve(W, st) {
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const c of W.colliders) {
        if (!blocks(c, st.y)) continue;
        const px = Math.max(c.x0, Math.min(st.x, c.x1)), pz = Math.max(c.z0, Math.min(st.z, c.z1));
        let dx = st.x - px, dz = st.z - pz; const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), k = (RADIUS - d) / d; st.x += dx * k; st.z += dz * k;
        } else { // орталығы ішінде — ең жақын шетке шығару
          const opts = [[c.x0 - RADIUS - st.x, 0], [c.x1 + RADIUS - st.x, 0], [0, c.z0 - RADIUS - st.z], [0, c.z1 + RADIUS - st.z]];
          opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          st.x += opts[0][0]; st.z += opts[0][1];
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
  // st: {x, y, z, vy, grounded}. mx, mz — осы кадрдағы көлденең жылжу.
  function step(W, st, mx, mz, dt) {
    const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.08));
    for (let i = 0; i < n; i++) {
      st.x += mx / n; st.z += mz / n;
      resolve(W, st);
      const g = groundAt(W, st.x, st.z, st.y);
      if (g >= st.y) { st.y = g; st.vy = 0; st.grounded = true; }
      else if (st.grounded && st.y - g <= SNAP_DOWN) { st.y = g; }
      else st.grounded = false;
    }
    if (!st.grounded) {
      st.vy -= 18 * dt; st.y += st.vy * dt;
      const g = groundAt(W, st.x, st.z, st.y + 0.3);
      if (st.y <= g) { st.y = g; st.vy = 0; st.grounded = true; }
    }
    return st;
  }

  // Ойыншы қай жерде тұр (HUD үшін)
  function whereAmI(W, x, y, z) {
    const S = W.S, B = S.building;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return { floor: 0, name: 'Аула' };
    const floor = y > S.levels.floor2 - 0.6 ? 2 : 1;
    if (y > S.levels.floor1 + 0.6 && y < S.levels.floor2 - 0.6) return { floor: 1.5, name: 'Баспалдақ' };
    for (const r of W.rooms) if (r.floor === floor && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return { floor, name: r.name };
    if (x >= S.hall.x0 && x <= S.hall.x1) return { floor, name: floor === 1 ? 'Орталық холл' : 'Баспалдақ алаңы' };
    return { floor, name: 'Дәліз' };
  }

  const api = { buildWorld, groundAt, step, whereAmI, RADIUS, BODY_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SchoolWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
