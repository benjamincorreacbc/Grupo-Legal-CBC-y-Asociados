# Portal GL-CBC — Cloudflare Pages + Supabase

Esta versión del portal deja todo listo para operar 100 % en la nube con **Supabase** como backend y **Cloudflare Pages** para el hosting estático. Solo necesitas copiar los archivos desde una tablet o navegador, configurar las llaves indicadas y ya podrás trabajar con el equipo completo.

---

## 1. Estructura del proyecto

| Ruta | Descripción |
|------|-------------|
| `index.html` | Sitio público institucional. |
| `login.html` | Acceso a la intranet con Supabase Auth. |
| `register.html` | Formulario de solicitud de cuenta. |
| `dashboard.html` | Panel interno con los módulos de gestión. |
| `set-role.html` | Página para que un usuario cambie su propio rol. |
| `style.css` | Estilos compartidos. |
| `config.js` | Variables globales (URL de Supabase, anon key, etc.). |
| `js/auth.js` | Cliente de Supabase y utilidades de autenticación. |
| `js/data.js` | Capa mínima de datos (causas, documentos, reuniones, contactos, oficinas). |
| `js/app.js` | Listeners y lógica de UI para el dashboard. |
| `js/landing.js` | Script ligero para la página pública. |
| `supabase/functions/portal/` | Edge Function que actualiza el rol en la tabla `profiles`. |
| `supabase/migrations/20240214000000_create_glcbc_state.sql` | Migración base para el estado compartido (puedes ejecutarla desde el SQL Editor). |
| `.github/workflows/deploy-supabase.yml` | Workflow que despliega la Edge Function cuando se empuja a `main`. |

> `config.js` **no** debe versionarse con claves privadas. En el repositorio solo verás `config.example.js`; crea `config.js` con tus valores reales.

---

## 2. Variables obligatorias (usar estos valores)

```js
window.__GLCBC_SUPABASE_URL__ = 'https://focxelshnrrvanlnusqf.supabase.co';
window.__GLCBC_SUPABASE_ANON_KEY__ = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTAyNDAsImV4cCI6MjA3Njg4NjI0MH0.VNFpA5hESELQpjKbhZPMPOIGJiX0mV5bJVg5FbtqH1s';
window.__GLCBC_API_BASE__ = 'https://focxelshnrrvanlnusqf.supabase.co/functions/v1/portal';
window.__GLCBC_ORG_SLUG__ = 'glcbc';
```

El archivo `config.js` ya trae estas líneas para que no tengas que editarlas a mano. Solo asegúrate de incluirlo antes de cualquier script que use las variables.

---

## 3. Configurar Supabase

1. **Proyecto**: utiliza el proyecto `focxelshnrrvanlnusqf` (ya creado). Si necesitas reproducirlo desde cero, crea uno nuevo y copia los valores anteriores.
2. **Migración**: en `SQL Editor` ejecuta `supabase/migrations/20240214000000_create_glcbc_state.sql`. Esto crea la tabla `glcbc_state` con Row Level Security activado.
3. **Buckets y tablas**: asegúrate de tener los buckets/tablas mencionadas en `js/data.js` (`profiles`, `cases`, `documents`, `meetings`, `meeting_participants`, `contacts`, `offices` y el bucket de storage `documents`). Crea políticas RLS según tus necesidades.
4. **Edge Function**:
   - Ve a `Edge Functions` y crea una función llamada `portal`.
   - Copia `supabase/functions/portal/index.ts` y `deno.json` en el editor.
   - En `Settings → Environment variables` agrega:
     - `SUPABASE_URL = https://focxelshnrrvanlnusqf.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTMxMDI0MCwiZXhwIjoyMDc2ODg2MjQwfQ.tZSaT3jRQQ3JDIMxa-ucJiZrE05szAbzRp0pscfcEIc`
     - `GLCBC_ORG_SLUG = glcbc`
   - Activa **JWT Verification** y despliega.
5. **Auth → URL Configuration**: agrega los dominios de Cloudflare Pages (`https://grupo-legal-cbc-y-asociados.pages.dev` y cualquier subdominio automático) en `Site URL`, `Additional Redirect URLs` y `Allowed Origins`.

---

## 4. Publicar con Cloudflare Pages

1. En Cloudflare Pages crea un proyecto nuevo apuntando a este repositorio o sube los archivos manualmente.
2. Configuración recomendada:
   - **Build command**: vacío (es un sitio estático).
   - **Output directory**: `.`
3. Cada vez que despliegues, Cloudflare generará un subdominio secundario además del principal. Agrega ambos en Supabase (ver punto anterior) para evitar errores de CORS.

---

## 5. Funcionamiento del front-end

- `login.html` y `register.html` importan `js/auth.js` como módulo ES y llaman directamente a Supabase Auth.
- `dashboard.html` importa `js/app.js`, que:
  - exige sesión activa (`requireSessionOrRedirect`),
  - conecta los botones/formularios clave (`addCaseForm`, `addDocumentForm`, `addEventForm`, `addDirectoryForm`, `addOfficeForm`, etc.),
  - usa la capa de datos (`js/data.js`) para ejecutar acciones reales sobre Supabase,
  - expone funciones globales (`switchModule`, `logout`, `toggleAddCaseForm`, etc.) utilizadas en el HTML.
- `set-role.html` utiliza la Edge Function `portal` para persistir el rol en la tabla `profiles` además de actualizar los metadatos del usuario.

Para servir el proyecto localmente bastará con un servidor de archivos estático (por ejemplo `npx serve .` o `python -m http.server`).

---

## 6. Automatización con GitHub Actions

- El workflow `.github/workflows/deploy-supabase.yml` despliega la función `portal` al hacer push en `main`. Debes definir los secretos del repositorio:
  - `SUPABASE_ACCESS_TOKEN`: créalo en tu cuenta de Supabase.
  - `SUPABASE_PROJECT_REF`: usa `focxelshnrrvanlnusqf`.
- Si los secretos no están presentes, el job se detiene mostrando el mensaje “SUPABASE secrets missing. Skipping deploy.” sin marcar error.

---

## 7. QA mínimo sugerido

1. **Login**: ingresar con credenciales válidas → redirige a `dashboard.html`.
2. **Protección del panel**: abrir `dashboard.html` sin sesión → redirige a `login.html`.
3. **Cambio de rol**: visitar `set-role.html`, seleccionar un nuevo rol → ver respuesta `✅ Rol actualizado` y revisar que el registro se refleje en `profiles`.
4. **Causas**: crear una causa desde el formulario → aparece en la lista.
5. **Documentos**: subir un archivo a una causa → se crea registro en la tabla `documents` y el archivo queda en el bucket `documents`.
6. **Eventos/Reuniones**: crear un evento desde el calendario → inserción correcta en `meetings`.
7. **Contactos/Oficinas**: crear registros para confirmar que los formularios llaman a Supabase.
8. **Cerrar sesión**: botón “Cerrar sesión” → vuelve a `login.html`.

Puedes ejecutar todas estas pruebas desde un navegador móvil/tablet.

---

## 8. Limpieza

- Se eliminó cualquier referencia a Netlify o archivos de Wrangler (no se usan Workers).
- Todo el flujo está pensado para Supabase + Cloudflare Pages.

---

## 9. Soporte

Si algo falla, revisa:
- **Consola del navegador** para errores de CORS o permisos.
- **Logs de la función** en Supabase (`Edge Functions → portal → Logs`).
- Las políticas de cada tabla/bucket en Supabase para confirmar que el rol autenticado tiene permisos.

¡Listo! Con estos pasos tienes el portal GL-CBC funcionando en línea, gratis y administrable desde tu tablet.
