# Bitácora Pablo

App web personal de Pablo Blanco (PWA) con agenda/tareas, gym + running, FMVA, horas de CODE/IA y tracker de candidaturas.
Pablo pide los cambios en lenguaje natural; se implementan aquí y se publican con push a `main`.

## Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| App (front) | `bitacora-app/` → GitHub Pages: https://pabloblb.github.io/bitacora/ (el `index.html` raíz redirige) |
| Datos | Google Sheet **"Bitácora Pablo · datos"** `1Gxh4cDXTrsF71Jbu1yz-ItpEZFtZYJAICVC_uXl5WfI` |
| API + avisos | Apps Script **"Bitacora API"** `1i68hUvndYPJe4MY0ujsTTF-cWIxTkWylhlKFFyu5iQPmwqymVt7v7EoW` (código en `apps-script/`, ver abajo) |
| Notificaciones | Bot de Telegram `bitacorablb_pablo_bot`, enviadas desde `Avisos` del Apps Script |

**Obsoletos, no tocar:** los artifacts de claude.ai "Bitácora Pablo" y "Plan Gym + Running" (dejaron de usarse el 12/11/2026). Sus datos están congelados en ciclo 2.

## Datos (Google Sheet)

Una pestaña por colección: `items`, `gym`, `apps`, `fmva`, `refuerzos`, `code`.
Columnas: `id | data (JSON) | updatedAt (ISO)`. Todo en formato texto.

- `items`: `{texto, tipo: 'evento'|'tarea', categoria: 'personal'|'candidaturas', fecha 'YYYY-MM-DD'|'', hora 'HH:MM'|'', estado: 'pendiente'|'hecho'|'eliminado', foco?, repite?: 'semanal', diaSemana?, hechoEn?}`
- `gym`: sesiones del plan. `{ciclo, semana, etapa, fecha, orden, tipo: 'fuerza'|'running'|'natacion'|'futbol'|'otro', titulo, foco, hecho, hora?, nota, contenido[], extra?}`
  - fuerza: `ejercicios[{n, obj: '4×10 · 85kg', sets, u?: 'kg'|'reps'|'s', series[{kg, reps, rir}]}]`, `calentamiento[]?`, `cal_hecho[]?`
  - running: `km`, `km_real?`, `tiempo?` (segundos), `series_tot?`, `series_hechas?`, `aj_obj?` (objetivo ajustado con el que se hizo)
  - id fijo `reto-flexiones`: reto semanal de 100 flexiones (`registros[{semana, fecha, reps}]`)
  - ids de plan: `c{ciclo}s{semana}{a|b|c|d}` → a = Superior A (empuje, lunes), b = Series (miércoles), c = Superior B (tracción, jueves/viernes), d = Tirada (sábado)
- `apps`: candidaturas `{empresa, puesto, fase, proximoPaso, proximaFecha, notas}`. Fases: aplicado, screening, entrevista1, entrevista2, superday, oferta, rechazado.

Para editar datos a mano (registrar una sesión, mover fecha) basta con escribir la fila en la hoja: la app la lee en ≤30 s.
Mantén el JSON completo de la fila; la API sustituye la celda entera.

## Front (`bitacora-app/`)

- `db.js`: imita la API de base de datos de los artifacts (`collection/doc/set/update/onSnapshot`) sobre el Apps Script. Caché local + cola offline.
- `gym.js`: módulo Gym (Hoy, Calendario, Plan, Progreso, reto, timer de isométricos, calentamiento).
- `index.html`: resto de la Bitácora (Hoy, Agenda, FMVA, Candidaturas). Monta `gym.js`.
- `sw.js`: service worker. **Sube `CACHE` (bitacora-vN) en cada cambio** de JS/CSS/HTML para que el móvil coja la versión nueva.
- JS en ES5 (sin build, sin dependencias). Español de España en toda la UI.

### Ajuste automático de objetivos (gym.js, `ajuste()`)

El objetivo de cada sesión sale de lo último hecho del mismo tipo (series↔series, tirada↔tirada, Superior A↔Superior A), no del calendario:
1. 11-17 días sin ese tipo → repite la última hecha.
2. ≥18 días → baja un escalón: running −20 % (km y repeticiones), gym −10 % kg.
3. Última sesión < 80 % (series completadas o sets registrados) → repite su objetivo.
4. Gym por ejercicio: reps conseguidas con RIR ≥ 2 → +2,5 kg (+1 kg si < 20 kg); RIR 0-1 o sin RIR → mismo peso; reps no conseguidas → −5 %.
Las salidas extra de running cuentan como última tirada/series. El plan original no se toca; el ajuste se calcula al pintar.

## Apps Script (`apps-script/`)

- `Código`: API web (`doGet` lee todo, `doPost` aplica ops `set|update|delete`). Token en Script Properties.
- `Avisos`: `avCheck` cada 5 min → resumen del día a las 08:00, aviso 30 min antes de cada evento/sesión con `hora`, recordatorio del reto los domingos a las 19:00.

Se sincroniza con `clasp` (ver `apps-script/README.md`). Tras cambiar `Código` hay que crear nueva versión del despliegue web; `Avisos` no lo necesita.

## Preferencias de Pablo

- Respuestas cortas, al grano, datos antes que adjetivos. Español de España.
- Entrenos por la mañana o hacia la noche; la primera tarea de la tarde siempre a las 16:30.
- RIR obligatorio en cada serie.
- Hombro izquierdo delicado: no subir carga en press inclinado ni press hombro si molesta.

## Antes de hacer push

1. `npm test` (carga la app en jsdom con datos de ejemplo y falla si hay errores de JS).
2. Subir `CACHE` en `sw.js`.
3. Commit en español y push a `main` (GitHub Pages publica en 1-2 min).
