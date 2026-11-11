global.window = {};
require(require('path').join(__dirname,'../layout.js'));
const SW = require(require('path').join(__dirname,'../world.js'));
const S = window.SCHOOL, W = SW.buildWorld(S);
const st = { x: S.start.x, y: 0, z: S.start.z, vy: 0, grounded: true };
function walkTo(tx, tz, label) {
  for (let i = 0; i < 4000; i++) {
    const dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz);
    if (d < 0.05) break;
    const s = Math.min(d, 3.5 / 60);
    SW.step(W, st, dx / d * s, dz / d * s, 1 / 60);
  }
  const ok = Math.hypot(tx - st.x, tz - st.z) < 0.15;
  const w = SW.whereAmI(W, st.x, st.y, st.z);
  console.log((ok ? 'OK  ' : 'FAIL') + ` ${label.padEnd(28)} -> (${st.x.toFixed(2)}, y=${st.y.toFixed(2)}, ${st.z.toFixed(2)}) ${w.floor}: ${w.name}`);
  return ok;
}
let all = true;
const route = [
  [0, 3.5, 'аула, баспалдақ алды'], [0, -1, 'кіреберіс залы'], [0, -6.0, 'аласа саты алды'],
  [0, -8.0, 'турникеттен өтіп холл'], [3.75, -9.2, '1-саты басы'], [3.75, -13.3, 'аралық алаң'],
  [2.25, -13.3, 'алаңда солға'], [2.25, -9.3, '2-саты, жоғары'], [2.25, -7.6, '2-қабат дәліз'],
  [2.25, -4.0, 'мұғалімдер бөлмесі'],
  // қайту
  [2.25, -8.0, 'дәлізге шығу'], [2.25, -9.6, '2-саты төбесі'], [2.25, -13.3, 'алаңға түсу'],
  [3.75, -13.3, 'оңға'], [3.75, -9.0, '1-қабатқа түсу'], [0, -8.0, 'холл'], [0, -3, 'кіреберіс'], [0, 6, 'аула'],
];
for (const [x, z, l] of route) all = walkTo(x, z, l) && all;
// Негативті тесттер: қабырға мен қоршаудан өтпеу
function blocked(from, to, label) {
  Object.assign(st, from, { vy: 0, grounded: true });
  st.y = SW.groundAt(W, st.x, st.z, st.y);
  const ok = !walkTo(to[0], to[1], 'тыйым: ' + label);
  console.log(ok ? '  -> дұрыс, өте алмады' : '  -> ҚАТЕ: өтіп кетті'); return ok;
}
all = blocked({ x: -10, z: -8, y: 0.75 }, [-10, -11], 'асхана қабырғасы (есіксіз)') && all;
all = blocked({ x: 2.25, z: -8, y: 4.15 }, [3.75, -11], '2-қабаттан ойыққа') && all;
all = blocked({ x: 0, z: -12, y: 4.15 }, [2.4, -12], '2-қабат сол қоршау') && all;
all = blocked({ x: 12.8, z: -8, y: 0.75 }, [12.8, -4], 'жабық есік (мед.)') && all;
console.log(all ? '\nБАРЛЫҒЫ ӨТТІ' : '\nҚАТЕ БАР'); process.exit(all ? 0 : 1);
