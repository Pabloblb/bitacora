/* Capa de datos de la Bitácora: imita la API de base de datos del artifact
   (collection/doc/get/set/update/delete/add/onSnapshot) sobre la API de Apps Script.
   - Lee todo con un GET y refresca cada 30 s y al volver a la app.
   - Escribe al momento en local y envía los cambios en cola; si no hay red, los guarda y reintenta. */
(function () {
  var LS_URL = 'bit.apiUrl', LS_TOKEN = 'bit.token', LS_QUEUE = 'bit.queue', LS_CACHE = 'bit.cache';
  var COLS = ['items', 'gym', 'apps', 'fmva', 'refuerzos', 'code'];
  var POLL_MS = 30000;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var cache = {}, loaded = false, listeners = {}, queue = [], flushing = false, pendingIds = {};
  COLS.forEach(function (c) { cache[c] = {}; listeners[c] = []; });

  // Arranque rápido: última copia local mientras llega la del servidor
  try { var cc = JSON.parse(lsGet(LS_CACHE) || 'null'); if (cc) { COLS.forEach(function (c) { if (cc[c]) cache[c] = cc[c]; }); loaded = true; } } catch (e) {}
  try { queue = JSON.parse(lsGet(LS_QUEUE) || '[]'); } catch (e) { queue = []; }
  queue.forEach(function (o) { pendingIds[o.col + '/' + o.id] = (pendingIds[o.col + '/' + o.id] || 0) + 1; });

  function cfg() { return { url: lsGet(LS_URL), token: lsGet(LS_TOKEN) }; }
  function saveCache() { lsSet(LS_CACHE, JSON.stringify(cache)); }
  function saveQueue() { lsSet(LS_QUEUE, JSON.stringify(queue)); }

  function snapOf(c) {
    var docs = Object.keys(cache[c]).map(function (id) {
      var d = cache[c][id];
      return { id: id, exists: true, data: function () { return JSON.parse(JSON.stringify(d)); } };
    });
    return { docs: docs, size: docs.length, empty: !docs.length };
  }
  function notify(c) { listeners[c].forEach(function (l) { try { l.cb(snapOf(c)); } catch (e) { console.error(e); } }); }
  function notifyAll() { COLS.forEach(notify); }

  function setStatus(t) { window.dispatchEvent(new CustomEvent('bitdb-status', { detail: t })); }

  /* ---------- lectura ---------- */
  var fetching = null;
  function refresh() {
    var c = cfg();
    if (!c.url || !c.token) return Promise.resolve();
    if (fetching) return fetching;
    fetching = fetch(c.url + '?action=all&token=' + encodeURIComponent(c.token), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'Error de la API');
        COLS.forEach(function (col) {
          var fresh = {};
          (res.data[col] || []).forEach(function (d) { var id = d.id; delete d.id; fresh[id] = d; });
          // no pisar documentos con cambios aún sin confirmar
          Object.keys(cache[col]).forEach(function (id) { if (pendingIds[col + '/' + id]) fresh[id] = cache[col][id]; });
          Object.keys(fresh).forEach(function (id) { if (pendingIds[col + '/' + id] && !(id in cache[col])) delete fresh[id]; });
          cache[col] = fresh;
        });
        loaded = true; saveCache(); notifyAll();
        setStatus(queue.length ? 'Pendiente de sincronizar: ' + queue.length : 'Sincronizado ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
      })
      .catch(function (e) { console.error(e); setStatus(navigator.onLine ? 'Error al leer: ' + e.message : 'Sin conexión: usando copia local'); if (loaded) notifyAll(); })
      .then(function () { fetching = null; });
    return fetching;
  }

  /* ---------- escritura ---------- */
  function enqueue(op) {
    queue.push(op); saveQueue();
    var k = op.col + '/' + op.id; pendingIds[k] = (pendingIds[k] || 0) + 1;
    return flush().then(function () {
      if (op._err) { var e = new Error(op._err); e.code = 'api'; throw e; }
    });
  }
  function flush() {
    if (flushing) return flushing;
    var c = cfg();
    if (!queue.length || !c.url) return Promise.resolve();
    var batch = queue.slice(0, 40);
    setStatus('Guardando…');
    flushing = fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: c.token, ops: batch.map(function (o) { return { op: o.op, col: o.col, id: o.id, data: o.data }; }) }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) {
          // error de la API (no de red): descartamos el lote para no bloquear la cola
          batch.forEach(function (o) { o._err = res.error; });
          setStatus('Error al guardar: ' + res.error);
        } else {
          setStatus('Guardado ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
        }
        queue = queue.slice(batch.length); saveQueue();
        batch.forEach(function (o) { var k = o.col + '/' + o.id; pendingIds[k]--; if (pendingIds[k] <= 0) delete pendingIds[k]; });
        flushing = null;
        if (queue.length) return flush();
      }, function (e) {
        flushing = null;
        setStatus('Sin conexión: ' + queue.length + ' cambios pendientes');
        // red caída: se reintenta al volver la conexión; la promesa no falla para no molestar
      });
    return flushing;
  }

  function clean(obj) { var o = {}; Object.keys(obj || {}).forEach(function (k) { if (k !== 'id' && obj[k] !== undefined) o[k] = obj[k]; }); return JSON.parse(JSON.stringify(o)); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2); }

  function docRef(col, id) {
    return {
      id: id,
      get: function () {
        var d = cache[col][id];
        return Promise.resolve({ id: id, exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; } });
      },
      set: function (data) {
        var d = clean(data); cache[col][id] = d; saveCache(); notify(col);
        return enqueue({ op: 'set', col: col, id: id, data: d });
      },
      update: function (patch) {
        var p = clean(patch), cur = cache[col][id] || {};
        Object.keys(p).forEach(function (k) { if (p[k] && p[k].__delete__ === true) delete cur[k]; else cur[k] = p[k]; });
        cache[col][id] = cur; saveCache(); notify(col);
        return enqueue({ op: 'update', col: col, id: id, data: p });
      },
      delete: function () {
        delete cache[col][id]; saveCache(); notify(col);
        return enqueue({ op: 'delete', col: col, id: id });
      }
    };
  }

  var db = {
    collection: function (col) {
      if (!cache[col]) { cache[col] = {}; listeners[col] = []; }
      return {
        doc: function (id) { return docRef(col, id || uid()); },
        add: function (data) { var id = uid(); return docRef(col, id).set(data).then(function () { return { id: id }; }); },
        onSnapshot: function (cb, err) {
          var l = { cb: cb, err: err }; listeners[col].push(l);
          if (loaded) setTimeout(function () { cb(snapOf(col)); }, 0);
          return function () { listeners[col] = listeners[col].filter(function (x) { return x !== l; }); };
        }
      };
    },
    refresh: refresh,
    configured: function () { var c = cfg(); return !!(c.url && c.token); },
    configure: function (url, token) { lsSet(LS_URL, url.trim()); lsSet(LS_TOKEN, token.trim()); return refresh(); }
  };

  // La Bitácora y el módulo de gym piden la base de datos con window.claude.use('db')
  window.BitDB = db;
  window.claude = window.claude || {};
  window.claude.use = function (name) { return Promise.resolve(name === 'db' ? db : null); };

  if (db.configured()) { refresh().then(flush); }
  setInterval(function () { if (document.visibilityState === 'visible') refresh().then(flush); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh().then(flush); });
  window.addEventListener('online', function () { flush().then(refresh); });
})();
