/* Prueba de humo: carga la Bitácora en jsdom con datos de ejemplo y falla si hay errores de JS. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'bitacora-app') + '/';
const errores = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errores.push(e.message + (e.detail && e.detail.stack ? '\n' + e.detail.stack : '')));
const html = fs.readFileSync(dir + 'index.html', 'utf8')
  .replace(/<script src="(\w+\.js)"><\/script>/g, (m, f) => '<script>' + fs.readFileSync(dir + f, 'utf8') + '</script>')
  .replace(/<link[^>]*>/g, '');
const hoy = new Date(), iso = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const gym = {
  a1: { ciclo: 1, semana: 1, fecha: iso(-9), orden: 1, tipo: 'fuerza', titulo: 'Superior A (Empuje)', hecho: true, ejercicios: [{ n: 'Press pecho máquina', obj: '4×10 · 85kg', sets: 4, series: [{ kg: 85, reps: 10, rir: '2' }] }] },
  a2: { ciclo: 1, semana: 2, fecha: iso(1), orden: 5, tipo: 'fuerza', titulo: 'Superior A (Empuje)', hecho: false, calentamiento: ['Círculos de brazos'], ejercicios: [{ n: 'Press pecho máquina', obj: '4×10 · 87,5kg', sets: 4, series: [] }, { n: 'Plancha', obj: '3×60s', sets: 3, u: 's', series: [] }] },
  b1: { ciclo: 1, semana: 2, fecha: iso(0), orden: 6, tipo: 'running', titulo: 'Series', foco: 'Intervalos', km: 7, contenido: ['Calentamiento 10min', '6×600m fuerte / 2min trotando'], hecho: true, km_real: 5.2, tiempo: 1816, series_tot: 6, series_hechas: 2.5 },
  d1: { ciclo: 1, semana: 2, fecha: iso(3), orden: 8, tipo: 'running', titulo: 'Tirada continua', foco: 'Z2', km: 8, contenido: ['8km ~6:15/km'], hecho: false },
  x1: { ciclo: 1, semana: 1, fecha: iso(-20), orden: 2.5, tipo: 'running', extra: true, titulo: 'Running libre', foco: 'Tirada continua', km_real: 9.2, hecho: true }
};
const cache = { items: { i1: { texto: 'Prueba', tipo: 'tarea', categoria: 'personal', fecha: iso(0), hora: '', estado: 'pendiente' } }, gym, apps: {}, fmva: {}, refuerzos: {}, code: {} };
const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, url: 'https://pabloblb.github.io/bitacora/bitacora-app/',
  beforeParse(w) { w.localStorage.setItem('bit.cache', JSON.stringify(cache)); w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => new Promise(() => {}); } });
const w = dom.window, $ = s => w.document.querySelector(s);
const esperar = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await esperar(400);
  const comprobar = (cond, msg) => { if (!cond) errores.push(msg); };
  comprobar(/Esta semana/.test($('#v-hoy').textContent), 'Hoy no se pinta');
  for (const t of ['agenda', 'fmva', 'cand', 'gym']) { $('[data-tab="' + t + '"]').click(); await esperar(150); }
  for (const t of ['hoy', 'cal', 'plan', 'prog']) { const b = $('[data-gtab="' + t + '"]'); if (b) { b.click(); await esperar(150); } }
  $('[data-gtab="plan"]').click(); await esperar(150);
  comprobar(/ajustada|repite/.test($('#gym-root').textContent), 'El ajuste automático no aparece en Plan');
  if (errores.length) { console.error('FALLO\n' + errores.join('\n')); process.exit(1); }
  console.log('OK: la app carga sin errores en todas las pestañas'); process.exit(0);
})();
