/* Copia del bloque añadido a Avisos.gs (Apps Script "Bitacora API") el 26/11/2026.
   En avCheck(): // 4) Preparar mañana -> si n.min está entre AV_CFG.PREP ('21:00') y +60 min y no hay log 'prep:'+fecha, envía avManana_(n).
   Usa los helpers de Avisos: avHoy_, avRows_, avSend_, avNow_. */
/* ---------- preparar mañana (21:00) ---------- */
function avManana_(n) {
  var p = n.iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
  var m = { iso: Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), dow: d.getUTCDay(), date: d };
  var h = avHoy_(m), L = [];
  L.push(h.lista.length ? h.lista.map(function (x) { return (x.hora || '—') + '  ' + x.txt; }).join('\n') : 'Agenda libre.');
  var fm = avRows_('fmva').filter(function (f) { return f.fecha === m.iso && !f.hecho; });
  fm.forEach(function (f) { L.push('FMVA · Día ' + f.dia + ' · ' + f.curso + (f.horas ? ' · ' + String(f.horas).replace('.', ',') + ' h' : '')); });
  var items = avRows_('items').filter(function (i) { return i.estado !== 'eliminado' && i.estado !== 'hecho' && i.tipo === 'tarea'; });
  var tar = items.filter(function (i) { return i.fecha === m.iso || i.foco; });
  var atr = items.filter(function (i) { return i.fecha && i.fecha <= n.iso && !i.foco; });
  if (tar.length) L.push('\nTareas:\n' + tar.map(function (i) { return (i.foco ? '☆ ' : '• ') + i.texto; }).join('\n'));
  if (atr.length) L.push('\n⚠️ ' + atr.length + (atr.length === 1 ? ' tarea atrasada' : ' tareas atrasadas'));
  L.push('\nRevisa, mueve lo que no cuadre y deja fijada la primera tarea de la tarde (16:30).');
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return { titulo: 'Prepara mañana · ' + DIAS[m.dow] + ' ' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1), msg: L.join('\n') };
}
function avPrepTest() { var r = avManana_(avNow_()); avSend_(r.titulo, r.msg, { tags: ['calendar'] }); }
