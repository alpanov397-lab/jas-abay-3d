// =====================================================================
//  mobile.js — телефон нұсқасы: көлденең 16:9 экран, сол жақта
//  джойстик, оң жақта қарау, әрекет батырмалары, толық экран.
// =====================================================================
(function () {
  const G = window.__game;
  if (!G || !G.isTouch) return;
  const $ = (id) => document.getElementById(id);
  const ui = $('touch-ui'); ui.style.display = 'block';

  // Сол жақ: джойстик
  const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
  let joyId = null, ox = 0, oy = 0;
  const R = 56;
  zone.addEventListener('touchstart', (e) => {
    if (joyId !== null) return; const t = e.changedTouches[0]; joyId = t.identifier;
    ox = t.clientX; oy = t.clientY; base.style.left = (ox - 60) + 'px'; base.style.top = (oy - 60) + 'px'; base.classList.add('on');
    e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) {
      let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      G.touch.x = dx / R; G.touch.y = dy / R; G.touch.active = true;
    }
    e.preventDefault();
  }, { passive: false });
  const endJoy = (e) => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; G.touch.active = false; G.touch.x = G.touch.y = 0; knob.style.transform = ''; base.classList.remove('on'); } };
  zone.addEventListener('touchend', endJoy); zone.addEventListener('touchcancel', endJoy);

  // Оң жақ: саусақпен жан-жаққа қарау
  const look = $('look-zone'); let lookId = null, lx = 0, ly = 0;
  look.addEventListener('touchstart', (e) => { if (lookId !== null) return; const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) {
      if (!G.paused) G.look((t.clientX - lx) * 0.006 * (G.sens || 1), (t.clientY - ly) * 0.005 * (G.sens || 1));
      lx = t.clientX; ly = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  look.addEventListener('touchend', endLook); look.addEventListener('touchcancel', endLook);

  // Батырмалар
  const tap = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
  tap('tb-act', () => G.interact && G.interact());
  tap('tb-run', () => { G.run = !G.run; $('tb-run').classList.toggle('on', G.run); });
  tap('tb-cam', () => G.toggleCam());
  tap('tb-people', () => $('online-btn').click());
  tap('tb-full', () => {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen() : null;
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => G.toast('Толық экран бұл жерде ашылмайды — телефонды көлденең ұста'));
    else G.toast('Толық экран бұл жерде ашылмайды');
  });
  // Әрекет батырмасы тек бір нәрсе жанында жанады
  G.frameHooks.push(() => { $('tb-act').classList.toggle('ready', $('prompt').classList.contains('show')); });

  // Тік ұстағанда ескерту
  const checkRot = () => $('rotate').classList.toggle('show', innerHeight > innerWidth * 1.05);
  addEventListener('resize', checkRot); checkRot();
})();
