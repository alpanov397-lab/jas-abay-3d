// =====================================================================
//  fb.js — Firebase адаптері. Claude платформасы жоқ жерде (өз сайтың)
//  ойынның db / room / user интерфейстерін Firebase арқылы береді:
//    db   → Cloud Firestore (профильдер, чат, достар, статистика, баптаулар)
//    room → Realtime Database (кім онлайн, қай жерде тұр)
//    user → Firebase Authentication (әр құрылғыға жасырын аккаунт, әкімші — email/құпия сөз)
//  Әкімші ретінде кіру: сайт сілтемесінің соңына #admin қосып аш.
// =====================================================================
(function () {
  const C = window.JAS_CONFIG || {};
  if (window.claude || !C.firebase || /claude/i.test(location.hostname)) return;   // claude.ai ішінде немесе Firebase бапталмаған
  const V = '10.12.2', base = `https://www.gstatic.com/firebasejs/${V}/`;
  const load = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const isAdmin = async (u) => !!(u && u.email && C.adminEmailHash && (await sha(u.email.trim().toLowerCase())) === C.adminEmailHash);
  const ready = (async () => {
    await load(base + 'firebase-app-compat.js');
    await Promise.all(['auth', 'firestore', 'database'].map(n => load(base + `firebase-${n}-compat.js`)));
    firebase.initializeApp(C.firebase);
    const auth = firebase.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    await new Promise(r => { const un = auth.onAuthStateChanged(u => { un(); r(u); }); });
    if (!auth.currentUser) await auth.signInAnonymously();
    return { auth, fs: firebase.firestore(), rt: firebase.database() };
  })();
  ready.catch(e => console.warn('Firebase қосылмады:', e && e.message));

  const api = {
    async user() {
      const { auth } = await ready;
      return { id: async () => auth.currentUser.uid, canEdit: () => isAdmin(auth.currentUser), can: async () => true, email: () => auth.currentUser.email || '' };
    },
    async db() { const { fs } = await ready; return fs; },
    async room() {
      const { auth, rt } = await ready;
      const uid = auth.currentUser.uid, key = uid + '_' + Math.random().toString(36).slice(2, 8);
      const myRef = rt.ref('room/' + key); myRef.onDisconnect().remove();
      const peers = new Map(), subs = [], conSubs = [];
      const fire = () => subs.forEach(f => { try { f(); } catch (e) {} });
      const roomRef = rt.ref('room');
      roomRef.on('child_added', s => { peers.set(s.key, s.val()); fire(); });
      roomRef.on('child_changed', s => { peers.set(s.key, s.val()); fire(); });
      roomRef.on('child_removed', s => { peers.delete(s.key); fire(); });
      rt.ref('.info/connected').on('value', s => { const c = !!s.val(); if (c) myRef.onDisconnect().remove(); conSubs.forEach(f => { try { f(c); } catch (e) {} }); });
      // жиілікті шектеу: секундына 5 реттен артық жібермейді (тегін лимитті үнемдеу)
      let last = 0, pending = null, timer = null;
      const flush = () => { if (!pending) return Promise.resolve(); const d = Object.assign({}, pending, { _u: uid }); pending = null; last = Date.now(); return myRef.set(d); };
      return {
        presence(p) {
          pending = p; const wait = 200 - (Date.now() - last);
          if (wait <= 0) return flush();
          if (!timer) timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, wait);
          return Promise.resolve();
        },
        peers() { return [...peers].map(([k, v]) => ({ peer: k, by: v && v._u, kind: 'viewer', presence: v || {}, sameTab: k === key, guest: false })); },
        onPeers(cb) { subs.push(cb); setTimeout(cb, 0); return () => {}; },
        onConnection(cb) { conSubs.push(cb); return () => {}; }
      };
    }
  };
  window.claude = { use: (n) => api[n] ? api[n]().catch(() => null) : Promise.resolve(null) };
  window.JAS_FB = { ready, isAdmin };

  // ---- Әкімші кіруі: сайт/#admin → Google арқылы ----
  function adminLogin() {
    const ov = document.createElement('div'); ov.className = 'overlay show'; ov.style.zIndex = 30;
    ov.innerHTML = `<div class="card"><div class="bar"></div><h1>🔑 Әкімші кіруі</h1>
      <p>Әкімші Google аккаунтымен кір. Басқа аккаунтпен кірсең, әкімші бөлімі ашылмайды.</p>
      <div id="al-err" style="color:#c0392b;font-size:13px;min-height:18px"></div>
      <button class="btn" id="al-go">G — Google арқылы кіру</button> <button class="btn" id="al-out" style="background:#e8ecf4;color:#13254f;margin-top:8px">Шығу / жабу</button></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#al-go').onclick = async () => {
      try {
        const { auth } = await ready; await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        if (!(await isAdmin(auth.currentUser))) { ov.querySelector('#al-err').textContent = 'Бұл аккаунт әкімші емес'; await auth.signOut(); return; }
        location.hash = ''; location.reload();
      } catch (e) { ov.querySelector('#al-err').textContent = 'Кіру сәтсіз: ' + (e && e.code || ''); }
    };
    ov.querySelector('#al-out').onclick = async () => { try { const { auth } = await ready; if (auth.currentUser && auth.currentUser.email) { await auth.signOut(); location.hash = ''; location.reload(); return; } } catch (e) {} ov.remove(); location.hash = ''; };
  }
  const check = () => { if (location.hash === '#admin') adminLogin(); };
  addEventListener('hashchange', check);
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', check); else check();
})();
