/**
 * Aviso diario a las 21:00 (Europe/Madrid): "Prepara mañana".
 * Manda por Telegram lo que hay mañana: eventos, entreno, FMVA y tareas (fecha de mañana + foco).
 *
 * Se llama desde avCheck() (cada 5 min). Guarda la fecha enviada en Script Properties
 * para no repetir el aviso el mismo día.
 *
 * Telegram: usa TG_TOKEN / TG_CHAT si existen como constantes en Avisos;
 * si no, los lee de Script Properties con esos mismos nombres.
 */
var PM_SHEET_ID = '1Gxh4cDXTrsF71Jbu1yz-ItpEZFtZYJAICVC_uXl5WfI';
var PM_TZ = 'Europe/Madrid';
var PM_HORA = '21:00';
var PM_APP = 'https://pabloblb.github.io/bitacora/';

function avPrepararManana() {
  var now = new Date();
  var hm = Utilities.formatDate(now, PM_TZ, 'HH:mm');
  var hoy = Utilities.formatDate(now, PM_TZ, 'yyyy-MM-dd');
  var props = PropertiesService.getScriptProperties();
  if (hm < PM_HORA || hm >= '23:00') return;          // ventana 21:00-22:59 por si falla un ciclo
  if (props.getProperty('PM_ENVIADO') === hoy) return;
  pmEnviar_(pmTexto_(hoy));
  props.setProperty('PM_ENVIADO', hoy);
}

/** Para probarlo a mano desde el editor (envía ya, sin mirar la hora). */
function avPrepararMananaPrueba() {
  pmEnviar_(pmTexto_(Utilities.formatDate(new Date(), PM_TZ, 'yyyy-MM-dd')));
}

function pmTexto_(hoy) {
  var d = new Date(hoy + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  var man = Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), dowMan = d.getUTCDay();
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  var items = pmLeer_('items').filter(function (i) { return i.estado !== 'eliminado'; });
  var eventos = items.filter(function (i) {
    if (i.tipo !== 'evento') return false;
    if (i.repite === 'semanal') return (typeof i.diaSemana === 'number' ? i.diaSemana : 1) === dowMan && !(i.hechoEn || {})[man];
    return i.fecha === man && i.estado !== 'hecho';
  }).sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); });
  var tareas = items.filter(function (i) { return i.tipo === 'tarea' && i.estado !== 'hecho' && (i.fecha === man || i.foco); });
  var atrasadas = items.filter(function (i) { return i.tipo === 'tarea' && i.estado !== 'hecho' && i.fecha && i.fecha <= hoy && !i.foco; });
  var gym = pmLeer_('gym').filter(function (s) { return s.fecha === man && !s.hecho; })
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
  var fmva = pmLeer_('fmva').filter(function (f) { return f.fecha === man && !f.hecho; });

  var L = ['🌙 <b>Prepara mañana</b> · ' + DIAS[dowMan] + ' ' + d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]];
  L.push('', '<b>Agenda</b>');
  if (eventos.length) eventos.forEach(function (e) { L.push('• ' + (e.hora ? e.hora + ' ' : '') + pmEsc_(e.texto)); });
  else L.push('• Sin eventos');
  if (gym.length) { L.push('', '<b>Entreno</b>'); gym.forEach(function (s) { L.push('• ' + (s.hora ? s.hora + ' ' : '') + pmEsc_(s.titulo) + (s.km ? ' · ' + String(s.km).replace('.', ',') + ' km' : '')); }); }
  if (fmva.length) { L.push('', '<b>FMVA</b>'); fmva.forEach(function (f) { L.push('• ' + (f.hora ? f.hora + ' ' : '') + 'Día ' + f.dia + ' · ' + pmEsc_(f.curso) + (f.horas ? ' · ' + String(f.horas).replace('.', ',') + ' h' : '')); }); }
  if (tareas.length) { L.push('', '<b>Tareas</b>'); tareas.forEach(function (t) { L.push('• ' + (t.foco ? '☆ ' : '') + pmEsc_(t.texto)); }); }
  if (atrasadas.length) L.push('', '⚠️ ' + atrasadas.length + (atrasadas.length === 1 ? ' tarea atrasada' : ' tareas atrasadas'));
  L.push('', 'Primera tarea de la tarde a las 16:30. Revisa y ajusta: ' + PM_APP);
  return L.join('\n');
}

function pmLeer_(pestana) {
  var sh = SpreadsheetApp.openById(PM_SHEET_ID).getSheetByName(pestana);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().map(function (r) {
    try { var o = JSON.parse(r[1]); o.id = String(r[0]); return o; } catch (e) { return null; }
  }).filter(Boolean);
}

function pmEnviar_(texto) {
  var p = PropertiesService.getScriptProperties();
  var token = (typeof TG_TOKEN !== 'undefined' && TG_TOKEN) || p.getProperty('TG_TOKEN');
  var chat = (typeof TG_CHAT !== 'undefined' && TG_CHAT) || p.getProperty('TG_CHAT');
  if (!token || !chat) throw new Error('Faltan TG_TOKEN / TG_CHAT');
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true })
  });
}

function pmEsc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
