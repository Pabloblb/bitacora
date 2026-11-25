# Apps Script "Bitacora API"

Código del backend (API sobre Google Sheets + avisos por Telegram), sincronizado con [clasp](https://github.com/google/clasp).

## Puesta en marcha (una vez, en tu ordenador)

```bash
npm i -g @google/clasp
clasp login                      # abre el navegador con tu cuenta de Google
cd apps-script
clasp pull                       # baja Código.js y Avisos.js a esta carpeta
git add . && git commit -m "Apps Script: código inicial" && git push
```

Activa también la API de Apps Script en https://script.google.com/home/usersettings (si no, `clasp` da error 403).

## Día a día

```bash
cd apps-script
clasp push        # sube los cambios al proyecto
```

- Cambios en `Avisos.js`: basta con `clasp push` (los dispara el activador de cada 5 min).
- Cambios en `Código.js` (la API web): `clasp push` y después `clasp deploy -i <ID del despliegue>` para actualizar la URL `/exec` sin cambiarla.

**No subas el token del bot de Telegram a un repo público.** Si el repo es público, mueve `TG_TOKEN` a Script Properties antes del primer commit del código.
