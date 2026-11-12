// =====================================================================
//  school.js — Құндыз апай (ресепшндегі көмекші), әкімші бөлімі,
//  хабарландыру жолағы және ортақ мақсат баптауы.
//  Деректер: config/kundyz {greeting, facts}, config/news {text, ts}, config/goal {title, target}
//  (оқу — барлығы, жазу — тек әкімші/иесі).
// =====================================================================
(function () {
  const G = window.__game;
  if (!G) return;
  const { THREE, S } = G;
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;
  const LS = { get(k, d) { try { const v = localStorage.getItem('jasabay.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('jasabay.' + k, JSON.stringify(v)); } catch (e) {} } };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t) => G.toast && G.toast(t);
  const stopKeys = (el) => el.addEventListener('keydown', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) e.stopPropagation(); });
  const pause = () => { G.paused = true; document.exitPointerLock && document.exitPointerLock(); };
  const resume = () => { G.paused = false; G.lockMouse && G.lockMouse(); };

  // ---------------- Мәліметтер (әдепкі) ----------------
  const floorRooms = (f) => S.rooms.filter(r => r.floor === f && r.type !== 'reception').map(r => r.name).join(', ');
  const DEFAULT = {
    greeting: 'Сәлеметсің! Мен — Құндыз апаймын, Jas Abay мектебінің ресепшніндемін. Мектеп туралы не білгің келеді?',
    facts: [
      'Jas Abay — Семей қаласындағы мектеп.',
      `1-қабаттағы бөлмелер: ${floorRooms(1)}.`,
      `2-қабаттағы бөлмелер: ${floorRooms(2)}.`,
      'Кіреберістен кейін орталық баспалдақ арқылы 2-қабатқа көтерілесің. 1-қабат дәлізі — қызғылт сары, 2-қабат дәлізі — көк.',
      'Аулада 50 орындық ашық кітапхана бар: E басып отырып, қандай кітап оқып отырғаныңды жазасың. Оқыған минутың деңгейіңді көтереді.',
      'Кітапхана жанында ТОП-10 оқырман тақтасы тұр.',
      'Оң жақтағы киіз үй — шайхана: дастарқан басына отырып, басқа ойыншылармен чатта сөйлесуге болады.'
    ].join('\n')
  };
  let K = Object.assign({}, DEFAULT);

  // ---------------- Құндыз апай: 3D кейіпкер ----------------
  const RY = S.levels.reception;
  const npc = G.makeAvatar('#7a1f5c', 'girl');
  npc.g.position.set(3.3, RY, -2.4); npc.g.rotation.y = PI / 2; G.scene.add(npc.g);
  npc.pose(0, false, false, false);
  let tag = null;
  G.extras.push({ x: 2.0, z: -2.4, y: RY, r: 2.2, label: 'E — Құндыз апайдан сұрау', action: openK });
  G.frameHooks.push((dt, t) => {
    if (!tag && G.net && G.net.makeTag) { tag = G.net.makeTag(); npc.g.add(tag.sp); }
    if (tag) G.net.drawTag(tag, { nm: 'Құндыз апай', npc: 'Ресепшн · көмекші', st: '' });
    // ойыншы жақын келсе, басын соған бұрады
    const p = G.av.g.position, vx = p.x - 3.3, vz = p.z + 2.4;
    const near = Math.hypot(vx, vz) < 6;
    const want = near ? Math.max(-0.9, Math.min(0.9, Math.atan2(-vx, -vz) - PI / 2)) : Math.sin(t * 0.4) * 0.2;
    npc.head.rotation.y += (((want + 3 * PI) % (2 * PI)) - PI - npc.head.rotation.y) * Math.min(1, dt * 3);
    npc.spine.rotation.x = Math.sin(t * 1.3) * 0.015;
  });

  // ---------------- Құндыз апай: сөйлесу терезесі ----------------
  const kp = document.createElement('div'); kp.id = 'kundyz'; kp.className = 'side';
  kp.innerHTML = `<header><h2>👩‍🏫 Құндыз апай</h2><div><button id="k-voice" title="Дауыспен оқу" style="display:none">🔇</button> <button id="k-close">Жабу ✕</button></div></header>
    <div id="k-list" style="flex:1;overflow:auto;padding:14px;background:#f6f8fc"></div>
    <div id="k-quick" style="padding:6px 12px;display:flex;gap:6px;flex-wrap:wrap"></div>
    <footer style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e6e9f0"><input id="k-in" maxlength="300" placeholder="Сұрағыңды жаз..." style="flex:1;font-size:16px;padding:10px 12px;border:2px solid #d5dbe8;border-radius:12px"><button id="k-send" class="btn" style="width:auto;padding:10px 16px;margin:0">➤</button></footer>`;
  document.body.appendChild(kp); stopKeys(kp);
  const QUICK = ['Мектеп қайда орналасқан?', 'Химия кабинеті қайда?', 'Кітапхана қалай жұмыс істейді?', 'Шайхана деген не?'];
  $('k-quick').innerHTML = QUICK.map(q => `<button data-q="${esc(q)}" style="border:1px solid #c9d3e6;background:#fff;border-radius:16px;padding:6px 10px;font-size:13px;cursor:pointer;color:#13254f">${esc(q)}</button>`).join('');
  $('k-quick').onclick = (e) => { const b = e.target.closest('button'); if (b) ask(b.dataset.q); };
  const hist = [];
  function bubble(who, text) {
    const d = document.createElement('div');
    d.style.cssText = `max-width:85%;margin:6px 0;padding:10px 13px;border-radius:14px;line-height:1.45;font-size:15px;white-space:pre-wrap;${who === 'me' ? 'margin-left:auto;background:#13254f;color:#fff' : 'background:#fff;color:#13254f;box-shadow:0 1px 3px rgba(0,0,0,.08)'}`;
    d.textContent = text; $('k-list').appendChild(d); $('k-list').scrollTop = 1e9; return d;
  }
  function openK() {
    pause(); kp.classList.add('show');
    if (!$('k-list').children.length) bubble('k', K.greeting);
    setTimeout(() => $('k-in').focus(), 50);
  }
  $('k-close').onclick = () => { kp.classList.remove('show'); if (tts) try { tts.stop(); } catch (e) {} resume(); };
  $('k-send').onclick = () => ask($('k-in').value);
  $('k-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('k-in').value); if (e.key === 'Escape') $('k-close').click(); });

  // Жасанды интеллект жоқ болса: кілт сөздер бойынша ең жақын мәліметті табу
  const stem = (w) => w.toLowerCase().replace(/[^a-zа-яәіңғүұқөһё0-9]/gi, '').slice(0, 5);
  function localAnswer(q) {
    const qs = new Set(q.split(/\s+/).map(stem).filter(w => w.length >= 3));
    const lines = K.facts.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const scored = lines.map(l => ({ l, sc: l.split(/\s+/).map(stem).filter(w => qs.has(w)).length })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc);
    return scored.length ? scored.slice(0, 2).map(x => x.l).join('\n') : 'Кешір, бұл туралы менде әзірге мәлімет жоқ. Мектеп әкімшілігінен сұрап көр 🙂';
  }
  let sample = null, tts = null, voiceOn = LS.get('kvoice', false), busy = false;
  const PROMPT = (facts) => `Сен — «Құндыз апай», Jas Abay мектебінің ресепшніндегі мейірімді әкімшісің (виртуалды 3D мектептегі көмекші кейіпкер).
Тек ҚАЗАҚ тілінде, жылы әрі қысқа (2–4 сөйлем) жауап бер. Тек төмендегі МӘЛІМЕТТЕРГЕ сүйен; онда жоқ нәрсені ойдан шығарма —
білмесең, «бұл туралы мәлімет жоқ, мектеп әкімшілігінен сұра» де. Бөлме қайда деп сұраса, қабатын айт.
Саясат, жеке деректер немесе мектепке қатысы жоқ тақырыптарда сыпайы түрде мектеп тақырыбына қайтар.

МӘЛІМЕТТЕР:
${facts}`;
  async function ask(q) {
    q = String(q || '').trim().slice(0, 300); if (!q || busy) return;
    $('k-in').value = ''; bubble('me', q); busy = true;
    const out = bubble('k', '…');
    let answer = '';
    if (sample) {
      const msgs = [];
      hist.slice(-6).forEach((m, i) => msgs.push({ role: m.role, content: i === 0 && m.role === 'user' ? PROMPT(K.facts) + '\n\nСҰРАҚ: ' + m.content : m.content }));
      msgs.push({ role: 'user', content: (msgs.length ? '' : PROMPT(K.facts) + '\n\nСҰРАҚ: ') + q });
      if (msgs[0].role !== 'user') msgs.shift();
      try {
        const r = await sample(msgs, { modelTier: 'quick', cache: false, onText: ({ text }) => { out.textContent = text; $('k-list').scrollTop = 1e9; } });
        answer = (r && r.text || '').trim();
      } catch (e) {
        if (e && e.code === 'not_granted') sample = null;
        if (e && e.code === 'rate_limited') answer = 'Сәл күте тұр, қазір көп сұрақ келіп жатыр 🙂';
      }
    }
    if (!answer) answer = localAnswer(q);
    out.textContent = answer; $('k-list').scrollTop = 1e9;
    hist.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
    if (tts && voiceOn) tts.speak(answer, { voice: 'airy' }).catch(() => {});
    busy = false;
  }
  $('k-voice').onclick = () => { voiceOn = !voiceOn; LS.set('kvoice', voiceOn); $('k-voice').textContent = voiceOn ? '🔊' : '🔇'; if (!voiceOn && tts) try { tts.stop(); } catch (e) {} };

  // ---------------- Хабарландыру жолағы ----------------
  const nb = document.createElement('div'); nb.id = 'newsbar';
  nb.style.cssText = 'position:fixed;top:62px;left:50%;transform:translateX(-50%);z-index:7;background:#f0a01e;color:#13254f;font-weight:800;border-radius:14px;padding:9px 14px;max-width:min(640px,86vw);display:none;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.2)';
  nb.innerHTML = '<span>📢</span><span id="nb-text" style="flex:1"></span><button id="nb-x" style="border:0;background:rgba(0,0,0,.12);border-radius:8px;padding:4px 8px;cursor:pointer;font-weight:800">✕</button>';
  document.body.appendChild(nb);
  let news = { text: '', ts: 0 };
  function showNews() { const off = LS.get('newsSeen', 0); $('nb-text').textContent = news.text || ''; nb.style.display = news.text && news.ts !== off ? 'flex' : 'none'; }
  $('nb-x').onclick = () => { LS.set('newsSeen', news.ts); showNews(); };

  // ---------------- Әкімші бөлімі ----------------
  const ap = document.createElement('div'); ap.id = 'adminp'; ap.className = 'side'; ap.style.width = 'min(620px,100vw)';
  ap.innerHTML = `<header><h2>🛠 Әкімші бөлімі</h2><button id="ad-close">Жабу ✕</button></header>
    <div id="ad-tabs" style="display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap;border-bottom:1px solid #e6e9f0">
      <button data-t="stat" class="chip on" style="--c:#13254f">📊 Статистика</button><button data-t="k" class="chip" style="--c:#7a1f5c">👩‍🏫 Құндыз апай</button>
      <button data-t="news" class="chip" style="--c:#c77d00">📢 Хабарландыру</button><button data-t="goal" class="chip" style="--c:#2e8b57">🎯 Мақсат</button><button data-t="rep" class="chip" style="--c:#c0392b">🚩 Шағымдар <span id="ad-repn"></span></button></div>
    <div id="ad-body" style="flex:1;overflow:auto;padding:14px 16px"></div>`;
  document.body.appendChild(ap); stopKeys(ap);
  let tab = 'stat', phones = new Map(), reports = [];
  $('ad-tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; $('ad-tabs').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); renderAdmin(); };
  $('ad-close').onclick = () => { ap.classList.remove('show'); resume(); };
  const ta = 'width:100%;font-size:15px;padding:10px;border:2px solid #d5dbe8;border-radius:12px;margin:4px 0 12px;font-family:inherit';
  function renderAdmin() {
    const N = G.net, body = $('ad-body'); if (!N) return;
    if (tab === 'stat') {
      const list = [...N.people().entries()].map(([id, p]) => Object.assign({ id }, p)).filter(p => p.nm).sort((a, b) => (b.jt || 0) - (a.jt || 0));
      const totalMin = list.reduce((a, p) => a + (Number(p.rm) || 0), 0);
      const today = new Date().toDateString(), newToday = list.filter(p => p.jt && new Date(p.jt).toDateString() === today).length;
      const byRole = {}; list.forEach(p => { byRole[p.rl] = (byRole[p.rl] || 0) + 1; });
      const card = (n, t) => `<div style="flex:1;min-width:120px;background:#f6f8fc;border-radius:14px;padding:12px"><div style="font-size:26px;font-weight:800;color:#13254f">${n}</div><div style="font-size:13px;color:#6b7690">${t}</div></div>`;
      body.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${card(list.length, 'тіркелген адам')}${card(N.onlineCount(), 'қазір онлайн')}${card(newToday, 'бүгін тіркелді')}${card(N.fmtMin(totalMin * 60000), 'жалпы оқу уақыты')}</div>
        <div style="font-size:13px;color:#6b7690;margin-bottom:8px">${Object.entries(byRole).map(([r, n]) => `${esc((N.ROLES[r] || {}).name || r)}: <b>${n}</b>`).join(' · ')}</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="text-align:left;color:#6b7690"><th>Аты-жөні</th><th>Рөлі</th><th>Деңгей</th><th>Оқыды</th><th>Телефон</th><th>Тіркелді</th></tr>
        ${list.map(p => `<tr style="border-top:1px solid #eef0f5"><td style="padding:7px 4px"><b>${esc(N.clean(p.nm, 40))}</b></td><td>${esc(p.rl === 'alumni' && p.gy ? 'Түлек ' + p.gy : N.roleName(p.rl, p.id))}</td><td>${N.level(Number(p.rm) || 0)}</td><td>${N.fmtMin((Number(p.rm) || 0) * 60000)}</td><td>${phones.get(p.id) ? `<a href="tel:${esc(phones.get(p.id).replace(/\s/g, ''))}">${esc(phones.get(p.id))}</a>` : '—'}</td><td>${p.jt ? new Date(p.jt).toLocaleDateString('kk-KZ') : '—'}</td></tr>`).join('') || '<tr><td colspan="6">Әзірге ешкім тіркелмеген</td></tr>'}</table>
        <p style="font-size:12px;color:#6b7690;margin-top:10px">Телефон нөмірлерін тек әкімші көреді. <button id="ad-csv" style="border:1px solid #c9d3e6;background:#fff;border-radius:10px;padding:5px 10px;cursor:pointer">⬇ Тізімді CSV етіп көшіру</button></p>`;
      $('ad-csv').onclick = () => {
        const rows = [['Аты-жөні', 'Рөлі', 'Телефон', 'Оқыды (мин)', 'Тіркелді']].concat(list.map(p => [N.clean(p.nm, 40), p.rl === 'alumni' && p.gy ? 'Түлек ' + p.gy : N.roleName(p.rl, p.id), phones.get(p.id) || '', Number(p.rm) || 0, p.jt ? new Date(p.jt).toLocaleDateString('kk-KZ') : '']));
        const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
        (navigator.clipboard ? navigator.clipboard.writeText(csv) : Promise.reject()).then(() => toast('Тізім көшірілді — Excel-ге қой (Ctrl+V)'), () => toast('Көшіру мүмкін болмады'));
      };
    } else if (tab === 'k') {
      body.innerHTML = `<label style="font-weight:700">Сәлемдесу сөзі</label><textarea id="ad-kg" rows="2" style="${ta}">${esc(K.greeting)}</textarea>
        <label style="font-weight:700">Jas Abay туралы мәліметтер (әр жолға бір дерек)</label>
        <textarea id="ad-kf" rows="14" style="${ta}" placeholder="Мысалы: Мектеп директоры — ...&#10;Сабақ 8:30-да басталады.&#10;Мектепке қабылдау — ...">${esc(K.facts)}</textarea>
        <p style="font-size:12px;color:#6b7690;margin:-6px 0 10px">Құндыз апай тек осы мәліметтерге сүйеніп жауап береді.</p>
        <button class="btn" id="ad-ksave">Сақтау</button> <button class="btn" id="ad-kreset" style="background:#e8ecf4;color:#13254f;margin-top:8px">Әдепкі мәтінді қайтару</button>`;
      $('ad-ksave').onclick = () => save('config/kundyz', { greeting: $('ad-kg').value.trim().slice(0, 400) || DEFAULT.greeting, facts: $('ad-kf').value.trim().slice(0, 12000), ts: Date.now() });
      $('ad-kreset').onclick = () => { $('ad-kg').value = DEFAULT.greeting; $('ad-kf').value = DEFAULT.facts; };
    } else if (tab === 'news') {
      body.innerHTML = `<label style="font-weight:700">Барлық ойыншыларға көрінетін хабарландыру</label><textarea id="ad-nt" rows="3" maxlength="200" style="${ta}">${esc(news.text)}</textarea>
        <button class="btn" id="ad-nsave">Жариялау</button> <button class="btn" id="ad-nclear" style="background:#e8ecf4;color:#13254f;margin-top:8px">Хабарландыруды алып тастау</button>`;
      $('ad-nsave').onclick = () => save('config/news', { text: $('ad-nt').value.trim().slice(0, 200), ts: Date.now() });
      $('ad-nclear').onclick = () => save('config/news', { text: '', ts: Date.now() });
    } else if (tab === 'rep') {
      if (!window.JAS_FB) { body.innerHTML = '<p>Шағымдар тізімі сайт нұсқасында (jas-abay.web.app) көрінеді.</p>'; return; }
      const nm = (id) => { const p = N.people().get(id); return p && p.nm ? N.clean(p.nm, 40) : 'белгісіз'; };
      body.innerHTML = reports.length ? reports.map((r, i) => `<div style="border:1px solid #eef0f5;border-radius:12px;padding:10px 12px;margin-bottom:8px">
          <div style="font-size:12px;color:#6b7690">${r.ts ? new Date(r.ts).toLocaleString('kk-KZ') : ''} · шағым берген: <b>${esc(nm(r.by))}</b></div>
          <div style="margin:6px 0"><b>${esc(N.clean(r.nm || nm(r.u), 40))}:</b> ${esc(N.clean(r.text, 300))}</div>
          <button data-i="${i}" data-a="delmsg" style="border:0;background:#c0392b;color:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;font-weight:700">Хабарламаны жою</button>
          <button data-i="${i}" data-a="ok" style="border:1px solid #c9d3e6;background:#fff;border-radius:9px;padding:6px 10px;cursor:pointer;font-weight:700">Шағымды жабу</button></div>`).join('')
        : '<p>Шағым жоқ 👍</p>';
      body.onclick = async (e) => {
        const b = e.target.closest('button[data-a]'); if (!b) return; const r = reports[+b.dataset.i]; if (!r) return;
        try {
          if (b.dataset.a === 'delmsg' && r.msg) await N.db.doc('chat/' + r.msg).delete().catch(() => {});
          await r.ref.delete(); toast(b.dataset.a === 'delmsg' ? 'Хабарлама жойылды ✓' : 'Шағым жабылды ✓');
        } catch (er) { toast('Орындалмады'); }
      };
    } else if (tab === 'goal') {
      body.innerHTML = `<label style="font-weight:700">Ортақ мақсаттың атауы</label><input id="ad-gt" maxlength="60" style="${ta}" value="${esc((S.goal && S.goal.title) || '')}">
        <label style="font-weight:700">Мақсат саны</label><input id="ad-gn" type="number" min="1" max="10000" style="${ta}" value="${(S.goal && S.goal.target) || 20}">
        <button class="btn" id="ad-gsave">Сақтау</button>`;
      $('ad-gsave').onclick = () => save('config/goal', { title: $('ad-gt').value.trim().slice(0, 60) || 'Ортақ мақсат', target: Math.max(1, Math.min(10000, parseInt($('ad-gn').value, 10) || 20)) });
    }
  }
  async function save(path, data) {
    const N = G.net; if (!N || !N.db) { toast('Онлайн режимде ғана сақталады'); return; }
    try { await N.db.doc(path).set(data); toast('Сақталды ✓'); } catch (e) { toast('Сақталмады: құқық жоқ немесе байланыс үзілді'); }
  }

  // ---------------- Желіге қосылғанда ----------------
  addEventListener('jas:net', async () => {
    const N = G.net;
    const use = (n) => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
    [sample, tts] = await Promise.all([use('sample'), use('tts')]);
    if (tts) { $('k-voice').style.display = ''; $('k-voice').textContent = voiceOn ? '🔊' : '🔇'; }
    if (N.db) {
      N.db.doc('config/kundyz').onSnapshot((s) => { if (s.exists) { const d = s.data(); K = { greeting: d.greeting || DEFAULT.greeting, facts: d.facts || DEFAULT.facts }; } }, () => {});
      N.db.doc('config/news').onSnapshot((s) => { news = s.exists ? Object.assign({ text: '', ts: 0 }, s.data()) : { text: '', ts: 0 }; showNews(); }, () => {});
      N.db.doc('config/goal').onSnapshot((s) => { if (s.exists) { const d = s.data(); S.goal = { title: d.title || 'Ортақ мақсат', target: Number(d.target) || 20 }; N.renderHud(); } }, () => {});
    }
    if (N.isAdmin) {
      const b = document.createElement('button'); b.id = 'btn-admin'; b.title = 'Әкімші бөлімі'; b.textContent = '🛠';
      $('topbtns').insertBefore(b, $('topbtns').firstChild);
      b.onclick = () => { pause(); ap.classList.add('show'); renderAdmin(); };
      setInterval(() => { if (ap.classList.contains('show') && tab === 'stat') renderAdmin(); }, 10000);
      if (N.db && window.JAS_FB && N.db.collectionGroup) N.db.collectionGroup('items').limit(300).onSnapshot((s) => {
        reports = s.docs.map(d => Object.assign({ ref: d.ref }, d.data())).sort((a, b) => (b.ts || 0) - (a.ts || 0));
        $('ad-repn').textContent = reports.length ? '(' + reports.length + ')' : '';
        if (ap.classList.contains('show') && tab === 'rep') renderAdmin();
      }, () => {});
      if (N.db) N.db.collection('phones').onSnapshot((s) => { phones = new Map(s.docs.map(d => [d.id, (d.data() || {}).ph || ''])); if (ap.classList.contains('show') && tab === 'stat') renderAdmin(); }, () => {});
    }
  });
})();
