// =====================================================================
//  online.js — 2–4 кезеңдер: тіркелу, онлайн кейіпкерлер, достар,
//  ауладағы кітапхана (оқу + бетбелгі), шайхана (чат + модерация),
//  деңгей мен ортақ мақсат.
//  claude.ai бетінде "room" (кім қазір онлайн) және "db" (сақталатын
//  деректер) арқылы жұмыс істейді. Файлды жай ашқанда — жалғыз ойыншы
//  режимі, деректер браузерде сақталады.
// =====================================================================
(function () {
  const G = window.__game;
  if (!G) return;
  const { THREE, S } = G;
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;

  const ROLES = {
    student: { name: 'Оқушы', color: '#d42a2a' },
    teacher: { name: 'Мұғалім', color: '#1f3a7a' },
    alumni: { name: 'Түлек', color: '#2e8b57' },
    business: { name: 'Кәсіпкер', color: '#3b4048' }
  };
  const ACH = {
    first_book: 'Алғашқы кітап табылды', all_books: 'Бес кітаптың бәрі', reader: 'Оқырман: 30 минут оқыды',
    first_msg: 'Шайханада алғаш сөйледі', supporter: 'Мектепті қолдады', friend: 'Алғашқы дос'
  };
  const STATUS = { reading: '📖 Кітап оқып отыр', chat: '💬 Шайханада', bench: '🪑 Демалып отыр', '': '' };
  const fmtMin = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} сағ ${m % 60} мин`; };

  // ---------------- Жергілікті сақтау ----------------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('jasabay.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('jasabay.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const blank = { name: '', phone: '', gradYear: '', photo: '', role: 'student', gender: 'boy', xp: 0, readLog: [], lastBook: null, ach: [], muted: [], blocked: [] };
  let me = Object.assign({}, blank, LS.get('profile', {}));

  let room = null, db = null, user = null, myId = null, isAdmin = false, canWrite = true;
  let teachers = [], chatMsgs = [], supportDocs = [], friends = new Map(), people = new Map();
  let status = '', online = false;
  let rdBook = null, readStart = 0, readMs = 0, readTick = 0, nextCheck = 0, afkAt = 0;
  const CHECK_MS = 10 * 60000, AFK_MS = 90000, MAX_READ = 180 * 60000;   // 10 мин сайын тексеру, 90 с күту, бір отырыста ең көбі 3 сағ

  // ---------------- Көмекшілер ----------------
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, n);
  const LV_MIN = 30;                                            // әр 30 минут оқу — жаңа деңгей
  const level = (min) => 1 + Math.floor((min || 0) / LV_MIN);
  const roleName = (rl, id) => rl === 'teacher' && !teachers.includes(id) ? 'Мұғалім (расталмаған)' : (ROLES[rl] || ROLES.student).name;
  const toast = (t) => G.toast && G.toast(t);
  // Бір құжатқа бір уақытта бір жазу: соңғы мәнді кезекте ұстап тұрады
  const writers = {};
  function write(path, data) {
    if (!db || !myId || !canWrite) return;
    const w = writers[path] || (writers[path] = { busy: false, next: null });
    w.next = data;
    if (w.busy) return;
    (async function run() {
      while (w.next) {
        const d = w.next; w.next = null; w.busy = true;
        try { await db.doc(path).set(d); }
        catch (e) { if (e && e.code === 'invalid_argument') { canWrite = false; toast('Бұл бетте деректер жазуға құқығың жоқ — тек көресің'); } }
        w.busy = false;
      }
    })();
  }
  function saveMe() {
    LS.set('profile', me);
    if (myId) {
      write(`data/users/${myId}/profile`, JSON.parse(JSON.stringify(me)));
      const pub = { nm: me.name, rl: me.role, lv: level(totalMin()), ach: me.ach.length, gy: me.role === 'alumni' ? me.gradYear : '', ph: me.photo || '', rm: readMin(), rc: (me.readLog || []).length, jt: me.joined || (me.joined = Date.now()) };   // телефон мұнда ЖОҚ — ол тек жеке профильде
      if (JSON.stringify(pub) !== saveMe.lastPub) {
        saveMe.lastPub = JSON.stringify(pub);
        // Firebase: оқу минуты тек өткен уақытқа сай өсе алады (ереже rmAt сервер уақытымен тексереді)
        if (window.JAS_FB && window.firebase && firebase.firestore && firebase.firestore.FieldValue) {
          const mine = people.get(myId) || {}, FV = firebase.firestore.FieldValue;
          pub.rmAt = (pub.rm > (Number(mine.rm) || 0) || !mine.rmAt) ? FV.serverTimestamp() : mine.rmAt;
        }
        write(`people/${myId}`, pub);
      }
      // телефон: тек әкімші оқи алатын бөлек жерге (phones/<id>)
      const ph = { nm: me.name, ph: me.phone || '', ts: Date.now() };
      if (me.phone && me.phone + me.name !== saveMe.lastPh) { saveMe.lastPh = me.phone + me.name; write(`phones/${myId}`, ph); }
    }
    renderHud();
  }
  function readMin() { return (me.readLog || []).reduce((a, r) => a + (r.min || 0), 0); }
  // жалпы оқу минуты (қазір оқып отырған уақытты қоса)
  function totalMin() { return readMin() + Math.floor(readMs / 60000); }
  function addXP(n) { me.xp = (me.xp || 0) + n; saveMe(); }   // деңгей енді тек оқу минутынан есептеледі
  let lastLv = 0;
  function checkLevel() { const lv = level(totalMin()); if (lastLv && lv > lastLv) toast(`Жаңа деңгей: ${lv}! 🎉 (${totalMin()} мин оқыдың)`); lastLv = lv; }
  function achieve(k) {
    if (me.ach.includes(k)) return;
    me.ach.push(k); toast('Жетістік: ' + ACH[k]); addXP(10);
  }

  // ---------------- HUD ----------------
  function renderHud() {
    $('lvl').textContent = level(totalMin());
    const tm = totalMin();
    $('xpbar').style.width = ((tm % LV_MIN) / LV_MIN * 100) + '%';
    $('xptext').textContent = `${fmtMin(tm * 60000)} оқыдың · келесіге ${LV_MIN - tm % LV_MIN} мин`;
    checkLevel();
    $('me-name').textContent = me.name ? `${me.name} · ${me.role === 'alumni' && me.gradYear ? 'Түлек ' + me.gradYear : roleName(me.role, myId)}` : '';
    const total = supportDocs.reduce((a, d) => a + (Number(d.pts) || 0), 0), tgt = (S.goal && S.goal.target) || 20;
    $('goal-title').textContent = (S.goal && S.goal.title) || 'Ортақ мақсат';
    $('goal-num').textContent = `${Math.min(total, tgt)} / ${tgt}`;
    $('goal-bar').style.width = Math.min(100, total / tgt * 100) + '%';
    newShelf.visible = total >= tgt;
    if (total >= tgt && !renderHud.done) { renderHud.done = true; if (renderHud.seen) toast('Мақсат орындалды! Кітапханада жаңа сөре ашылды 📚'); }
    renderHud.seen = true;
    const n = remote.size + 1;
    $('online-btn').textContent = online ? `👥 ${n} онлайн` : '👤 Жалғыз режим';
  }

  // ---------------- Профиль (тіркелу) ----------------
  // Аты-жөні, телефон (жеке сақталады), рөл (түлек болса — бітірген жылы), жынысы, профиль фотосы.
  const normPhone = (t) => {
    let d = String(t || '').replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = d.slice(1);
    if (d.length !== 10) return null;
    return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  };
  // Фотоны 96×96 өлшемге кесіп, JPEG етіп кішірейтеді (≈5 КБ)
  function shrinkPhoto(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 96; const s = Math.min(im.width, im.height);
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 96, 96);
        res(c.toDataURL('image/jpeg', 0.78)); }; im.onerror = rej; im.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  const okPhoto = (p) => typeof p === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p) && p.length < 20000;
  function showProfile(done) {
    G.paused = true; document.exitPointerLock && document.exitPointerLock();
    const ov = $('profile'); ov.classList.add('show'); $('start').classList.remove('show');
    $('pf-name').value = me.name || ''; $('pf-phone').value = me.phone || ''; $('pf-year').value = me.gradYear || ''; $('pf-err').textContent = '';
    let role = me.role || 'student', gender = me.gender || 'boy', photo = me.photo || '';
    const img = $('pf-photo-img'); img.src = photo || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; 
    $('pf-photo-btn').onclick = () => $('pf-photo').click();
    $('pf-photo').onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try { photo = await shrinkPhoto(f); img.src = photo; } catch (err) { $('pf-err').textContent = 'Фотоны ашу мүмкін болмады, басқасын таңда'; }
      e.target.value = '';
    };
    const gch = $('pf-gender');
    gch.innerHTML = [['boy', '👦 Ұл'], ['girl', '👧 Қыз']].map(([k, n]) => `<button data-g="${k}" class="chip${k === gender ? ' on' : ''}" style="--c:#13254f">${n}</button>`).join('');
    gch.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; gender = b.dataset.g; gch.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); G.av.setGender(gender); };
    const chips = $('pf-roles');
    const showGrad = () => { $('pf-grad').style.display = role === 'alumni' ? 'block' : 'none'; $('pf-phone-l').textContent = role === 'student' ? 'Телефон нөмірің (міндетті емес)' : 'Телефон нөмірің'; };
    $('pf-consent').checked = !!me.consent; $('pf-delete').style.display = me.name ? 'block' : 'none';
    chips.innerHTML = Object.entries(ROLES).map(([k, r]) => `<button data-r="${k}" class="chip${k === role ? ' on' : ''}" style="--c:${r.color}">${r.name}</button>`).join('');
    chips.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; role = b.dataset.r; chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); showGrad(); };
    showGrad();
    $('pf-save').onclick = () => {
      const nm = clean($('pf-name').value, 40).replace(/\s+/g, ' ');
      if (nm.split(' ').filter(w => w.length >= 2).length < 2) { $('pf-err').textContent = 'Аты-жөніңді толық жаз (аты және тегі)'; return; }
      const rawPh = $('pf-phone').value.trim(), ph = normPhone(rawPh);
      if (!ph && (role !== 'student' || rawPh)) { $('pf-err').textContent = 'Телефон нөмірін дұрыс жаз: +7 7XX XXX XX XX'; return; }
      if (!$('pf-consent').checked) { $('pf-err').textContent = 'Тіркелу үшін деректерді өңдеуге келісім бер'; return; }
      const yr = parseInt($('pf-year').value, 10), now = new Date().getFullYear();
      if (role === 'alumni' && !(yr >= 1990 && yr <= now)) { $('pf-err').textContent = 'Мектепті бітірген жылыңды жаз'; return; }
      me.name = nm; me.phone = ph || ''; me.consent = me.consent || Date.now(); me.gradYear = role === 'alumni' ? String(yr) : ''; me.photo = okPhoto(photo) ? photo : '';
      me.role = role; me.gender = gender; G.av.setJacket(ROLES[role].color); G.av.setGender(gender);
      ov.classList.remove('show'); G.paused = false; saveMe(); sendPresence(true); myTag.key = '';
      if (done) done();
    };
  }
  for (const id of ['pf-phone', 'pf-year', 'rd-book', 'rd-author']) $(id).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') (id.startsWith('rd') ? $('rd-sit') : $('pf-save')).click(); });
  // Бұрын тек атпен тіркелгендер жаңа өрістерді (телефон) бір рет толтырады
  const needsProfile = () => !me.name || !me.consent || (!me.phone && me.role !== 'student');
  $('pf-privacy').onclick = (e) => { e.preventDefault(); $('privacy').classList.add('show'); };
  $('pv-close').onclick = () => $('privacy').classList.remove('show');
  // Дербес деректерді толық жою (профиль, телефон, ортақ тізімдегі жазба)
  $('pf-delete').onclick = async () => {
    if (!confirm('Барлық деректерің (профиль, телефон, оқу тарихы) біржола өшіріледі. Жалғастырасың ба?')) return;
    try { if (db && myId) await Promise.all([`people/${myId}`, `phones/${myId}`, `data/users/${myId}/profile`].map(p => db.doc(p).delete().catch(() => {}))); } catch (e) {}
    try { Object.keys(localStorage).filter(k => k.startsWith('jasabay.')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.reload();
  };
  G.beforeStart = (go) => { if (!needsProfile()) go(); else showProfile(go); };
  $('me-edit').onclick = () => showProfile(() => G.lockMouse());
  G.av.setJacket((ROLES[me.role] || ROLES.student).color); G.av.setGender(me.gender || 'boy');

  // ---------------- Аула: кітапхана (50 орын) мен шайхана ----------------
  const Y = G.yard || { libSeats: [], shSeats: [] };
  const newShelf = Y.newShelf || new THREE.Group();
  let mySeat = null;
  function takenSeats() {
    const set = new Set();
    if (room) for (const p of room.peers()) { const pr = p.presence || {}; if (!p.sameTab && pr.sa) set.add(pr.sa + ':' + pr.si); }
    return set;
  }
  Y.onSit = (area, near) => {
    const seats = area === 'lib' ? Y.libSeats : area === 'sh' ? Y.shSeats : (Y.benchSeats || []), taken = takenSeats();
    let best = null, bd = 1e9;
    for (const s of seats) { if (taken.has(area + ':' + s.id)) continue; const d = Math.hypot(s.x - G.st.x, s.z - G.st.z); if (d < bd) { bd = d; best = s; } }
    if (!best) { toast(area === 'lib' ? 'Кітапханада бос орын жоқ' : area === 'sh' ? 'Шайханада бос орын жоқ' : 'Орындықта бос орын жоқ'); return; }
    mySeat = best;
    if (area === 'lib') openReader();
    else if (area === 'sh') openChat();
    else { sit(best); setStatus('bench'); $('rb-text').textContent = '🪑 Орындықта демалып отырсың'; $('readbar').classList.add('show'); }
  };
  function sit(seat) {
    G.paused = true; document.exitPointerLock && document.exitPointerLock();
    G.sitting = seat; G.teleport(seat.px, seat.pz, 1);
  }
  function stand() { if (mySeat) G.teleport(mySeat.px, mySeat.pz, 1); G.paused = false; G.sitting = null; mySeat = null; G.setHeld(G.av, null); setStatus(''); }
  function setStatus(s) { status = s; sendPresence(true); }

  // ---------------- Кітапханада оқу ----------------
  // Отырар алдында: қандай кітап (атауы, авторы). Отырған соң бас үстінде аты, кітабы және оқу уақыты.
  const BOOK_COLORS = ['#2b6cb0', '#c0392b', '#2e8b57', '#8e44ad', '#d35400', '#16a085'];
  function openReader() {
    if (!mySeat) mySeat = Y.libSeats[0];
    G.paused = true; document.exitPointerLock && document.exitPointerLock();
    const lb = me.lastBook || {};
    $('rd-book').value = lb.title || ''; $('rd-author').value = lb.author || ''; $('rd-err').textContent = '';
    $('reader').classList.add('show'); setTimeout(() => $('rd-book').focus(), 50);
  }
  $('rd-sit').onclick = () => {
    const title = clean($('rd-book').value, 60), author = clean($('rd-author').value, 40);
    if (title.length < 2) { $('rd-err').textContent = 'Кітап атауын жаз'; return; }
    let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    rdBook = { title, author, color: BOOK_COLORS[h % BOOK_COLORS.length] };
    me.lastBook = { title, author };
    $('reader').classList.remove('show');
    sit(mySeat); readStart = readTick = Date.now(); readMs = 0; nextCheck = readStart + CHECK_MS; afkAt = 0;
    G.setHeld(G.av, 'book', title, rdBook.color);
    setStatus('reading'); updateBar(); $('readbar').classList.add('show');
    saveMe();
  };
  $('rd-cancel').onclick = () => { $('reader').classList.remove('show'); mySeat = null; G.paused = false; G.lockMouse(); };
  function updateBar() { if (rdBook) $('rb-text').textContent = `📖 «${rdBook.title}» · ${fmtMin(readMs)}`; }
  // Тек белсенді уақыт есептеледі: бет ашық тұрғанда және «Әлі оқып отырсың ба?» сұрағына жауап бергенде
  setInterval(() => {
    if (status !== 'reading' || !readStart) return;
    const now = Date.now(), dt = Math.min(5000, now - readTick); readTick = now;
    if (!document.hidden && !afkAt) readMs += dt;
    if (readMs >= MAX_READ) { toast('3 сағат оқыдың — демалып ал 🙂'); $('rd-close').click(); return; }
    if (!afkAt && now >= nextCheck) { afkAt = now; $('afk').classList.add('show'); document.exitPointerLock && document.exitPointerLock(); }
    if (afkAt) {
      const left = Math.max(0, Math.ceil((AFK_MS - (now - afkAt)) / 1000)); $('afk-left').textContent = left;
      if (!left) { $('afk').classList.remove('show'); afkAt = 0; toast('Жауап болмады — оқу тоқтатылды'); $('rd-close').click(); }
    }
  }, 1000);
  $('afk-yes').onclick = () => { $('afk').classList.remove('show'); afkAt = 0; readTick = Date.now(); nextCheck = Date.now() + CHECK_MS; };
  setInterval(() => { if (status === 'reading') { updateBar(); sendPresence(true); renderHud(); } }, 15000);
  $('rd-close').onclick = () => {
    if (rdBook && readStart) {
      const mins = Math.floor(readMs / 60000);
      me.readLog = (me.readLog || []).concat([{ title: rdBook.title, author: rdBook.author, at: readStart, min: mins }]).slice(-100);
      const total = me.readLog.reduce((a, r) => a + (r.min || 0), 0);
      saveMe();
      if (total >= 30) achieve('reader');
      toast(`Оқу уақыты: ${fmtMin(readMs)} 📚`);
    }
    rdBook = null; readStart = 0; readMs = 0; afkAt = 0; $('afk').classList.remove('show'); $('readbar').classList.remove('show'); stand(); G.lockMouse(); drawStats();
  };

  // ---------------- Шайхана: чат ----------------
  function openChat() {
    if (!mySeat) mySeat = Y.shSeats[0];
    sit(mySeat); G.setHeld(G.av, 'cup');
    setStatus('chat'); $('chat').classList.add('show'); renderChat();
    $('ch-unread').textContent = ''; setTimeout(() => $('ch-input').focus(), 50);
    $('ch-support').style.display = (me.role === 'alumni' || me.role === 'business' || isAdmin) ? '' : 'none';
  }
  $('ch-close').onclick = () => { $('chat').classList.remove('show'); stand(); G.lockMouse(); };
  function hidden(m) { return me.blocked.includes(m.u || m.nm) || me.muted.includes(m.u || m.nm); }
  function renderChat() {
    const list = $('ch-list');
    const msgs = chatMsgs.slice().sort((a, b) => a.ts - b.ts).filter(m => !hidden(m));
    const mod = isAdmin || (me.role === 'teacher' && teachers.includes(myId));
    list.innerHTML = msgs.length ? msgs.map(m => {
      const mine = (m.u && m.u === myId) || (!myId && m.nm === me.name);
      const t = new Date(m.ts || 0), hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      const btns = mine ? '' : `<span class="mb"><button data-a="mute" title="Дыбысын өшіру">🔇</button><button data-a="block" title="Бұғаттау">⛔</button><button data-a="report" title="Шағымдану">⚑</button>${mod && db ? '<button data-a="del" title="Жою (модерация)">🗑</button>' : ''}</span>`;
      return `<div class="msg${mine ? ' mine' : ''}" data-id="${esc(m.id || '')}"><div class="mh"><b style="color:${(ROLES[m.rl] || ROLES.student).color}">${esc(m.nm)}</b> <i>${esc(roleName(m.rl, m.u))}</i> <small>${hh}</small>${btns}</div><div class="mt">${esc(m.text)}</div></div>`;
    }).join('') : '<p class="empty">Әзірге хабарлама жоқ. Бірінші болып сәлем айт!</p>';
    list.scrollTop = list.scrollHeight;
  }
  $('ch-list').onclick = async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const el = b.closest('.msg'), m = chatMsgs.find(x => (x.id || '') === el.dataset.id); if (!m) return;
    const key = m.u || m.nm;
    if (b.dataset.a === 'mute') { me.muted.push(key); toast(`${m.nm} — дыбысы өшірілді`); }
    if (b.dataset.a === 'block') { me.blocked.push(key); toast(`${m.nm} бұғатталды`); syncPeers(); }
    if (b.dataset.a === 'report') {
      if (db && canWrite) { try { await db.collection(`reports/${myId}/items`).add({ msg: m.id || '', text: m.text, u: m.u || '', nm: m.nm, by: myId || '', ts: Date.now() }); toast('Шағым мұғалімдерге жіберілді'); } catch (er) { toast('Шағым жіберілмеді'); } }
      else toast('Шағым тек онлайн режимде жіберіледі');
    }
    if (b.dataset.a === 'del' && db && m.id) { try { await db.doc('chat/' + m.id).delete(); } catch (er) { toast('Жою мүмкін болмады'); } }
    saveMe(); renderChat();
  };
  async function sendChat() {
    const text = clean($('ch-input').value, 300); if (!text) return;
    $('ch-input').value = '';
    const msg = { u: myId || '', nm: me.name, rl: me.role, text, ts: Date.now() };
    if (db && canWrite) {
      try { await db.collection('chat').add(msg); } catch (e) { toast('Хабарлама жіберілмеді'); return; }
    } else { msg.id = 'local' + msg.ts; chatMsgs.push(msg); LS.set('chat', chatMsgs.slice(-60)); renderChat(); }
    achieve('first_msg');
  }
  $('ch-send').onclick = sendChat;
  $('ch-input').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') $('ch-close').click(); });
  $('pf-name').addEventListener('keydown', (e) => e.stopPropagation());
  $('ch-ptt').onclick = () => toast('Дауыстық байланыс келесі кезеңде қосылады (жеке сервер керек)');
  $('ch-support').onclick = () => {
    const mine = supportDocs.find(d => d.id === myId);
    const pts = (mine ? Number(mine.pts) || 0 : 0) + 1;
    if (db && myId && canWrite) write(`support/${myId}`, { pts, nm: me.name, rl: me.role, ts: Date.now() });
    else { const d = supportDocs.find(x => x.id === 'me') || (supportDocs.push({ id: 'me', pts: 0 }), supportDocs[supportDocs.length - 1]); d.pts = pts; LS.set('support', pts); }
    if (!(db && myId)) renderHud();
    achieve('supporter'); toast('Рахмет! Мақсатқа +1 кітап (сынақ ұпайы)');
  };

  // ---------------- Кітапхана статистикасы: ТОП-10 оқырман ----------------
  // Ортақ «people» тізіміндегі rm (жалпы оқу минуты) бойынша. Қазір оқып отырғандар 📖 белгісімен.
  function topReaders() {
    const map = new Map();
    for (const [id, p] of people) if (p && p.nm) map.set(id, { id, nm: p.nm, rl: p.rl, gy: p.gy, rm: Number(p.rm) || 0, rc: Number(p.rc) || 0 });
    const mineId = myId || 'me';
    map.set(mineId, { id: mineId, nm: me.name || 'Сен', rl: me.role, gy: me.gradYear, rm: readMin(), rc: (me.readLog || []).length, me: true });
    const live = new Set(); for (const r of remote.values()) if (r.data && r.data.st === 'reading') live.add(r.data.u);
    if (status === 'reading') live.add(mineId);
    return [...map.values()].filter(x => x.rm > 0 || x.me).sort((a, b) => b.rm - a.rm || b.rc - a.rc).slice(0, 10).map(x => Object.assign(x, { live: live.has(x.id) }));
  }
  const statC = document.createElement('canvas'); statC.width = 1024; statC.height = 760;
  const statTex = new THREE.CanvasTexture(statC);
  {
    const LIB = (G.yard && G.yard.lib) || { x0: -28, x1: -8, z0: 8 };
    const bx = LIB.x1 - 3.2, bz = LIB.z0 - 1.4, BW = 3.4, BH = 2.5;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: statTex, toneMapped: false }));
    board.position.set(bx, 1.05 + BH / 2, bz + 0.07); G.scene.add(board);
    const back = G.boxR(bx - BW / 2 - 0.08, bx + BW / 2 + 0.08, 0.95, 1.15 + BH, bz - 0.06, bz + 0.06, G.M('#13254f', { roughness: 0.5 })); back.castShadow = true;
    for (const sx of [-1, 1]) G.boxR(bx + sx * (BW / 2 - 0.2) - 0.06, bx + sx * (BW / 2 - 0.2) + 0.06, 0, 1.0, bz - 0.06, bz + 0.06, G.M('#2b2f36', { metalness: 0.6, roughness: 0.4 }));
    G.W.col(bx - BW / 2 - 0.1, bx + BW / 2 + 0.1, bz - 0.1, bz + 0.1, 0, 3.7, { kind: 'furn' });
    G.extras.push({ x: bx, z: bz + 1.2, y: 0, r: 2.6, label: 'E — Үздік оқырмандар (ТОП-10)', action: openStats });
  }
  function drawStats() {
    const g = statC.getContext('2d'), w = statC.width, h = statC.height, list = topReaders();
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#13254f'; g.fillRect(0, 0, w, 110);
    g.fillStyle = '#f0a01e'; g.fillRect(0, 110, w, 8);
    g.fillStyle = '#fff'; g.font = `800 50px ${G.FONT}`; g.textAlign = 'center'; g.fillText('📚 Үздік оқырмандар — ТОП 10', w / 2, 72);
    g.textAlign = 'left';
    if (!list.length) { g.fillStyle = '#13254f'; g.font = `600 34px ${G.FONT}`; g.fillText('Әзірге ешкім оқымады — бірінші бол!', 60, 220); }
    list.forEach((x, i) => {
      const y = 150 + i * 60;
      if (i % 2 === 0) { g.fillStyle = 'rgba(19,37,79,0.06)'; g.fillRect(20, y - 8, w - 40, 58); }
      if (x.me) { g.fillStyle = 'rgba(240,160,30,0.18)'; g.fillRect(20, y - 8, w - 40, 58); }
      g.fillStyle = i < 3 ? ['#d4a017', '#9aa3ad', '#b87333'][i] : '#13254f';
      g.font = `800 38px ${G.FONT}`; g.fillText(i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1) + '.', 36, y + 34);
      g.fillStyle = '#13254f'; g.font = `700 34px ${G.FONT}`;
      let nm = clean(x.nm, 40) + (x.live ? ' 📖' : ''); while (nm.length > 2 && g.measureText(nm).width > 560) nm = nm.slice(0, -2) + '…';
      g.fillText(nm, 110, y + 32);
      g.fillStyle = '#6b7690'; g.font = `500 22px ${G.FONT}`;
      g.fillText((x.rl === 'alumni' && x.gy ? 'Түлек ' + clean(x.gy, 4) : roleName(x.rl, x.id)) + ` · ${x.rc} рет`, 110, y + 52 - 0);
      g.fillStyle = '#1f7a3a'; g.font = `800 36px ${G.FONT}`; g.textAlign = 'right'; g.fillText(fmtMin(x.rm * 60000), w - 40, y + 34); g.textAlign = 'left';
    });
    g.fillStyle = '#6b7690'; g.font = `500 22px ${G.FONT}`; g.fillText(online ? 'Онлайн · барлық ойыншылардың жалпы оқу уақыты' : 'Жалғыз режим · тек сенің нәтижең', 36, h - 24);
    statTex.needsUpdate = true;
    if ($('stats') && $('stats').classList.contains('show')) renderStatsPanel(list);
  }
  // HTML терезе (телефонда оқуға ыңғайлы)
  const statsEl = document.createElement('div'); statsEl.id = 'stats'; statsEl.className = 'side';
  statsEl.innerHTML = '<header><h2>📚 Үздік оқырмандар</h2><button id="st-close">Жабу ✕</button></header><div id="st-list" style="padding:12px 16px;overflow:auto"></div>';
  document.body.appendChild(statsEl);
  function renderStatsPanel(list) {
    $('st-list').innerHTML = (list || topReaders()).map((x, i) => `<div class="pr${x.me ? ' me' : ''}" style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid #eef0f5"><b style="width:34px">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1 + '.'}</b><div style="flex:1"><b>${esc(clean(x.nm, 40))}${x.live ? ' 📖' : ''}</b><br><small style="color:#6b7690">${esc(x.rl === 'alumni' && x.gy ? 'Түлек ' + clean(x.gy, 4) : roleName(x.rl, x.id))} · ${x.rc} рет оқыды</small></div><b style="color:#1f7a3a">${fmtMin(x.rm * 60000)}</b></div>`).join('') || '<p>Әзірге ешкім оқымады.</p>';
  }
  function openStats() { G.paused = true; document.exitPointerLock && document.exitPointerLock(); renderStatsPanel(); statsEl.classList.add('show'); }
  statsEl.addEventListener('click', (e) => { if (e.target.id === 'st-close') { statsEl.classList.remove('show'); G.paused = false; G.lockMouse(); } });
  setInterval(drawStats, 20000);

  // ---------------- Басқа ойыншылар ----------------
  const remote = new Map();   // peer -> { av, tag, data, pos }
  // Бас үстіндегі белгі: фото + аты-жөні + рөлі + (оқып отырса) кітап пен уақыт
  const photoCache = new Map();
  function photoImg(src, onload) {
    if (!okPhoto(src)) return null;
    let im = photoCache.get(src);
    if (!im) { im = new Image(); im.onload = onload; im.src = src; photoCache.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function makeTag() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 176;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(2.0, 0.69, 1); sp.position.y = 2.2; sp.renderOrder = 10;
    return { sp, c, tex, key: '' };
  }
  function drawTag(tag, p) {
    const reading = p.st === 'reading' && p.bk;
    const mins = reading && p.rs ? Math.floor((Date.now() - p.rs) / 60000) : -1;
    const ph = p.ph || (people.get(p.u) || {}).ph || '';
    const im = photoImg(ph, () => { tag.key = ''; });
    const key = [p.nm, p.rl, p.lv, p.st, p.bk, mins, p.gy, !!im].join('|'); if (key === tag.key) return; tag.key = key;
    const g = tag.c.getContext('2d'), W2 = 512; g.clearRect(0, 0, W2, 176);
    const h = reading ? 160 : 112, x0 = 8;
    g.fillStyle = 'rgba(19,37,79,0.88)'; g.beginPath(); g.roundRect ? g.roundRect(x0, 8, W2 - 16, h, 22) : g.rect(x0, 8, W2 - 16, h); g.fill();
    // фото (немесе бас әрпі)
    const cx = 64, cy = 8 + 56, r = 40;
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.closePath();
    if (im) { g.clip(); g.drawImage(im, cx - r, cy - r, r * 2, r * 2); }
    else { g.fillStyle = (ROLES[p.rl] || ROLES.student).color; g.fill(); g.fillStyle = '#fff'; g.font = `800 38px ${G.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((clean(p.nm, 2)[0] || '?').toUpperCase(), cx, cy + 2); }
    g.restore(); g.strokeStyle = '#f0a01e'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.stroke();
    const fit = (t, max, font) => { g.font = font; let s = t; while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -1); return s === t ? t : s + '…'; };
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#fff'; g.fillText(fit(clean(p.nm, 40) || 'Қонақ', 380, `700 34px ${G.FONT}`), 120, 56);
    const rl = p.npc ? p.npc : p.rl === 'alumni' && p.gy ? `Түлек ${clean(p.gy, 4)}` : roleName(p.rl, p.u);
    g.fillStyle = '#f0a01e'; g.fillText(fit(p.npc ? rl : `${rl} · ${p.lv || 1}-деңгей`, 380, `600 24px ${G.FONT}`), 120, 92);
    if (reading) {
      g.fillStyle = '#9be29b'; g.fillText(fit(`📖 «${clean(p.bk, 60)}»`, 470, `600 25px ${G.FONT}`), 28, 136);
      g.fillStyle = '#ffffff'; g.font = `500 22px ${G.FONT}`; g.fillText(`оқып отыр: ${fmtMin(Date.now() - p.rs)}`, 28, 160);
    } else if (p.st && STATUS[p.st]) { g.fillStyle = '#9be29b'; g.font = `600 22px ${G.FONT}`; g.fillText(STATUS[p.st], 120, 112); }
    tag.tex.needsUpdate = true;
  }
  function syncPeers() {
    if (!room) return;
    const seen = new Set();
    for (const p of room.peers()) {
      if (p.sameTab || p.kind !== 'viewer') continue;
      const pr = p.presence || {};
      if (typeof pr.x !== 'number') continue;
      const id = p.by || pr.u || '';
      if (me.blocked.includes(id) || me.blocked.includes(pr.nm)) continue;
      seen.add(p.peer);
      let r = remote.get(p.peer);
      if (!r) {
        const av = G.makeAvatar(null, pr.g); const tag = makeTag(); av.g.add(tag.sp); G.scene.add(av.g);
        r = { av, tag, walk: 0, pos: new THREE.Vector3(pr.x, pr.y, pr.z), f: pr.f || 0 };
        remote.set(p.peer, r);
        if (renderHud.seen && pr.nm) toast(`${clean(pr.nm, 20)} мектепке кірді`);
      }
      r.data = Object.assign({}, pr, { u: id }); r.peer = p.peer; r.guest = p.guest;
      r.av.setJacket((ROLES[pr.rl] || ROLES.student).color);
      if (r.av.gender !== (pr.g || 'boy')) r.av.setGender(pr.g || 'boy');
      G.setHeld(r.av, pr.st === 'reading' ? 'book' : pr.st === 'chat' ? 'cup' : null, clean(pr.bk, 40), /^#[0-9a-f]{6}$/i.test(pr.bc || '') ? pr.bc : '#2b6cb0');
      r.tag.sp.position.y = pr.st === 'reading' ? 2.6 : 2.2;
      drawTag(r.tag, r.data);
    }
    for (const [k, r] of remote) if (!seen.has(k)) { G.scene.remove(r.av.g); remote.delete(k); }
    renderHud(); renderStartOnline(); if ($('people').classList.contains('show')) renderPeople();
  }
  G.frameHooks.push((dt, t) => {
    for (const r of remote.values()) {
      const d = r.data; if (!d) continue;
      const tgt = new THREE.Vector3(d.x, d.y, d.z);
      const dist = r.pos.distanceTo(tgt);
      if (dist > 6) r.pos.copy(tgt); else r.pos.lerp(tgt, Math.min(1, dt * 10));
      let df = (d.f || 0) - r.f; while (df > PI) df -= 2 * PI; while (df < -PI) df += 2 * PI; r.f += df * Math.min(1, dt * 10);
      const sitting = d.st === 'reading' || d.st === 'chat' || d.st === 'bench';
      if (d.mv && !sitting) r.walk += dt * 8; else r.walk *= 0.85;
      r.av.pose(r.walk, !!d.mv, sitting, d.st === 'reading');
      r.av.g.position.copy(r.pos); r.av.g.rotation.y = r.f;
      G.animLamp(r.av, t);
    }
    if ((t | 0) !== (G._tagSec | 0)) { G._tagSec = t; for (const r of remote.values()) if (r.data) drawTag(r.tag, r.data); }
    // өз presence-ім: 10 рет/сек, тек өзгергенде
    sendPresence(false);
  });
  let lastSent = '', lastSentAt = 0;
  function sendPresence(force) {
    if (!room || !me.name) return;
    const now = performance.now(); if (!force && now - lastSentAt < 100) return;
    const s = G.sitting, st = G.st;
    const p = {
      u: myId || '', nm: me.name, rl: me.role, g: me.gender || 'boy', lv: level(totalMin()), st: status,
      sa: mySeat ? mySeat.area : null, si: mySeat ? mySeat.id : null,
      bk: status === 'reading' && rdBook ? rdBook.title : null, bc: status === 'reading' && rdBook ? rdBook.color : null, rs: status === 'reading' ? Date.now() - readMs : null, gy: me.role === 'alumni' ? me.gradYear : '',
      x: +(s ? s.x : st.x).toFixed(2), y: +(s ? s.y : st.y).toFixed(2), z: +(s ? s.z : st.z).toFixed(2),
      f: +(s ? s.f : (G.facing || 0)).toFixed(2), mv: !!G.moving
    };
    const key = JSON.stringify(p); if (key === lastSent) return;
    lastSent = key; lastSentAt = now;
    room.presence(p).catch(() => {});
  }

  // Өз атың да басыңның үстінде
  const myTag = makeTag(); G.av.g.add(myTag.sp);
  G.frameHooks.push(() => {
    myTag.sp.visible = !!me.name;
    myTag.sp.position.y = status === 'reading' ? 2.6 : 2.2;
    if (me.name) drawTag(myTag, { nm: me.name, rl: me.role, lv: level(totalMin()), st: status, u: myId, ph: me.photo, gy: me.gradYear, bk: rdBook && rdBook.title, rs: readStart ? Date.now() - readMs : 0 });
  });
  function renderStartOnline() {
    const el = $('start-online'); if (!el) return;
    if (!room) { el.innerHTML = '<span class="dot off"></span> Жалғыз режим. Достарыңмен бірге ойнау үшін бетті claude.ai-да аш және «Поделиться» арқылы бөліс.'; $('play').textContent = 'Бастау'; return; }
    const names = [...remote.values()].map(r => clean(r.data && r.data.nm, 20)).filter(Boolean);
    el.innerHTML = '<span class="dot"></span> ' + (names.length ? `Қазір мектепте: <b>${names.length}</b> адам — ${esc(names.slice(0, 6).join(', '))}${names.length > 6 ? '…' : ''}` : 'Онлайн. Әзірге мектепте ешкім жоқ — бірінші болып кір!');
    $('play').textContent = 'Онлайн кіру';
  }

  // ---------------- Ойыншылар тізімі мен достар ----------------
  function renderPeople() {
    const rows = [];
    rows.push(`<div class="pr me"><b>${esc(me.name)}</b> <i>${esc(roleName(me.role, myId))} · ${level(totalMin())}-деңгей</i><span class="you">сен</span></div>`);
    for (const r of remote.values()) {
      const d = r.data || {}, id = d.u;
      const fr = id && friends.get(id);
      let btn = '';
      if (db && myId && id && id !== myId) {
        if (!fr) btn = `<button data-f="${esc(id)}" data-n="${esc(d.nm)}">+ Дос болу</button>`;
        else if (fr.status === 'accepted') btn = '<span class="ok">✓ Дос</span>';
        else if (fr.to === myId) btn = `<button data-acc="${esc(fr.id)}">Қабылдау</button>`;
        else btn = '<span class="wait">Сұрау жіберілді</span>';
      }
      if (isAdmin && d.rl === 'teacher' && id && !teachers.includes(id)) btn += ` <button data-t="${esc(id)}">Мұғалімді растау</button>`;
      rows.push(`<div class="pr"><b>${esc(clean(d.nm, 40))}</b> <i>${esc(roleName(d.rl, id))} · ${d.lv || 1}-деңгей${r.guest ? ' · қонақ' : ''}</i> <small>${d.st === 'reading' && d.bk ? esc('📖 «' + clean(d.bk, 60) + '»' + (d.rs ? ' · ' + fmtMin(Date.now() - d.rs) : '')) : esc(STATUS[d.st] || '')}</small>${btn}</div>`);
    }
    const incoming = [...friends.values()].filter(f => f.to === myId && f.status === 'pending' && ![...remote.values()].some(r => r.data && r.data.u === f.from));
    for (const f of incoming) rows.push(`<div class="pr"><b>${esc(f.fromNm)}</b> <i>достық сұрауы</i><button data-acc="${esc(f.id)}">Қабылдау</button></div>`);
    const fl = [...friends.values()].filter(f => f.status === 'accepted').map(f => f.from === myId ? f.toNm : f.fromNm);
    $('pp-list').innerHTML = rows.join('');
    $('pp-friends').textContent = fl.length ? 'Достарың: ' + fl.join(', ') : (db ? 'Әзірге досың жоқ' : 'Достар тек онлайн режимде');
    if (isAdmin) {
      const req = [...people.entries()].filter(([id, p]) => p.rl === 'teacher' && !teachers.includes(id));
      $('pp-admin').innerHTML = req.length ? '<b>Растауды күтетін мұғалімдер:</b> ' + req.map(([id, p]) => `${esc(p.nm)} <button data-t="${esc(id)}">Растау</button>`).join(' ') : '';
    }
  }
  $('people').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'pp-close') { $('people').classList.remove('show'); G.paused = false; return; }
    if (!db || !canWrite) return;
    try {
      if (b.dataset.f) { await db.doc(`friends/${myId}_${b.dataset.f}`).set({ from: myId, to: b.dataset.f, fromNm: me.name, toNm: b.dataset.n || '', status: 'pending', ts: Date.now() }); toast('Достық сұрауы жіберілді'); }
      if (b.dataset.acc) { await db.doc('friends/' + b.dataset.acc).update({ status: 'accepted' }); achieve('friend'); toast('Енді сендер доссыңдар!'); }
      if (b.dataset.t) { await db.doc('config/teachers').set({ ids: [...new Set([...teachers, b.dataset.t])] }); toast('Мұғалім расталды'); }
    } catch (er) { toast('Әрекет орындалмады'); }
  };
  function togglePeople() {
    const p = $('people'), on = !p.classList.contains('show');
    p.classList.toggle('show', on); G.paused = on;
    if (on) { document.exitPointerLock && document.exitPointerLock(); renderPeople(); }
  }
  $('online-btn').onclick = togglePeople;
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); if (!$('chat').classList.contains('show') && !$('reader').classList.contains('show') && !$('profile').classList.contains('show')) togglePeople(); }
    if (e.code === 'Escape') { if ($('reader').classList.contains('show')) $('rd-cancel').click(); else if ($('readbar').classList.contains('show')) $('rd-close').click(); if ($('people').classList.contains('show')) togglePeople(); }
  }, true);

  // ---------------- Ойын оқиғалары ----------------
  addEventListener('jas:book', (e) => { addXP(20); achieve('first_book'); if (e.detail.got === e.detail.total) achieve('all_books'); });

  // ---------------- Қосылу (claude.ai беті) ----------------
  chatMsgs = LS.get('chat', []);
  const localSupport = LS.get('support', 0); if (localSupport) supportDocs = [{ id: 'me', pts: localSupport }];
  renderHud(); drawStats();
  const use = (n) => (window.claude && typeof window.claude.use === 'function') ? window.claude.use(n).catch(() => null) : Promise.resolve(null);
  (async function connect() {
    [user, db, room] = await Promise.all([use('user'), use('db'), use('room')]);
    if (user) { try { myId = await user.id(); } catch (e) {} try { isAdmin = !!(await user.canEdit()); } catch (e) {}
      // Claude ішінде: әкімші — тек иесі (config.js → claudeOwners)
      const CO2 = (window.JAS_CONFIG || {}).claudeOwners; if (!window.JAS_FB && isAdmin && CO2 && CO2.length && !CO2.includes(myId)) isAdmin = false; try { const cw = await user.can('data.write'); if (cw === false) canWrite = false; } catch (e) {} }
    if (db && myId) {
      // профиль (қайта кіргенде сақталады)
      try {
        const snap = await db.doc(`data/users/${myId}/profile`).get();
        if (snap.exists) { me = Object.assign({}, blank, snap.data()); LS.set('profile', me); G.av.setJacket((ROLES[me.role] || ROLES.student).color); if (me.phone) saveMe(); }
        else if (me.name) saveMe();
      } catch (e) {}
      chatMsgs = [];
      db.collection('chat').orderBy('ts', 'desc').limit(60).onSnapshot((s) => {
        const before = chatMsgs.length;
        chatMsgs = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
        if ($('chat').classList.contains('show')) renderChat();
        else if (chatMsgs.length > before && before) $('ch-unread').textContent = '•';
      }, () => {});
      db.collection('support').onSnapshot((s) => { supportDocs = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderHud(); }, () => {});
      db.doc('config/teachers').onSnapshot((s) => { teachers = (s.exists && s.data().ids) || []; renderHud(); }, () => {});
      const onFr = (s) => { for (const ch of s.docChanges()) { if (ch.type === 'removed') friends.delete(ch.doc.data().from === myId ? ch.doc.data().to : ch.doc.data().from); else { const d = Object.assign({ id: ch.doc.id }, ch.doc.data()); friends.set(d.from === myId ? d.to : d.from, d); } } if ($('people').classList.contains('show')) renderPeople(); };
      db.collection('friends').where('to', '==', myId).onSnapshot(onFr, () => {});
      db.collection('friends').where('from', '==', myId).onSnapshot(onFr, () => {});
      db.collection('people').onSnapshot((s) => { people = new Map(s.docs.map(d => [d.id, d.data()])); drawStats(); if ($('people').classList.contains('show')) renderPeople(); }, () => {});
    }
    if (room) {
      online = true;
      room.onPeers(() => syncPeers(), () => { online = false; renderHud(); });
      room.onConnection((c) => { online = c || online; renderHud(); }, () => {});
      sendPresence(true);
    }
    renderHud(); renderStartOnline();
    $('mode').textContent = room ? (db ? 'Онлайн режим' : 'Онлайн (сақтаусыз)') : 'Жалғыз режим — деректер осы браузерде';
    // school.js (Құндыз апай, әкімші бөлімі) үшін ортақ интерфейс
    G.net = { db, room, myId, isAdmin, canWrite: () => canWrite, people: () => people, online: () => online, onlineCount: () => remote.size + 1,
      me: () => me, level, totalMin, makeTag, drawTag, esc, clean, fmtMin, roleName, toast, renderHud, ROLES };
    dispatchEvent(new Event('jas:net'));
  })();
})();
