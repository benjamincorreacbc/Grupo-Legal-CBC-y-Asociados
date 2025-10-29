# Portal Integral GL-CBC — Guía completa (100 % online)

Esta guía explica **paso a paso** cómo usar el proyecto desde cero, sin depender de un computador personal. Todos los servicios sugeridos tienen planes gratuitos o de muy bajo costo y puedes administrarlos desde una tablet o cualquier navegador.

---

## 1. Archivos principales del repositorio

| Archivo / Carpeta | Descripción |
|-------------------|-------------|
| `index.html` | Sitio público institucional editable por el administrador. |
| `login.html` | Formulario de acceso a la intranet. |
| `register.html` | Formulario de “Solicitar apertura de cuenta”. |
| `dashboard.html` | Portal completo con todos los módulos (socios, abogados, clientes). |
| `set-role.html` | Pantalla para que un usuario logueado ajuste su propio rol. |
| `style.css` | Estilos globales (layout, colores, fuentes). |
| `app.js` | Lógica principal del front-end: autenticación, permisos por rol, formularios, auditoría y sincronización con la nube. |
| `config.example.js` | Plantilla para configurar las variables de Supabase/funciones. Debes copiarla como `config.js` con tus valores reales. |
| `supabase/` | Código listo para desplegar una **Edge Function** que gestiona todo el backend en Supabase y migraciones SQL para crear la tabla de estado. |
| `.github/workflows/` | Automatizaciones de GitHub Actions: creación de ZIP descargable y despliegue automático de la función de Supabase. |
| `.gitignore` | Ignora `config.js` (para que tu clave pública no quede expuesta). |
| *(Descarga ZIP)* | Usa el botón **Code → Download ZIP** o el artefacto automático `glcbc-portal.zip` en GitHub Actions para obtener todos los archivos sin usar Git. |

> Ya no existe la carpeta `server/`. Todo el backend vive en Supabase Functions + PostgreSQL administrado por Supabase.

---

## 2. Configurar Supabase (base de datos + Edge Function)

1. **Crear un proyecto** en [https://supabase.com/](https://supabase.com/) (plan gratuito). Anota:
   - URL del proyecto (ejemplo `https://xxxx.supabase.co`).
   - `anon public key` y `service role key` (se encuentran en `Project Settings → API`).

2. **Crear la tabla de estado**:
   - En el panel de Supabase abre `SQL Editor`.
   - Copia el contenido de `supabase/migrations/20240214000000_create_glcbc_state.sql` y ejecútalo.
   - Esto crea la tabla `glcbc_state` con Row Level Security habilitado para usuarios autenticados.

3. **Desplegar la función Edge** (sin instalar nada local):
   - Desde Supabase Studio ve a `Edge Functions` y crea una función llamada `portal`.
   - Copia el contenido de `supabase/functions/portal/index.ts`, `actions.ts`, `state.ts`, `stateStore.ts` y `utils.ts` dentro del editor de la función (puedes subirlos desde el explorador o copiarlos manualmente).
   - En la pestaña de configuración de la función agrega las variables de entorno:
     - `SUPABASE_URL` → URL del proyecto.
     - `SUPABASE_SERVICE_ROLE_KEY` → service role key.
     - `GLCBC_ORG_SLUG` → `glcbc` (o el identificador que quieras usar).
   - Activa “JWT Verification” (la plantilla ya lo asume).
   - Guarda y despliega.

4. **Anotar la URL de la función**: quedará como `https://<project-ref>.functions.supabase.co/portal`.

5. **(Opcional pero recomendado)**: en `Authentication → Providers → Email` puedes desactivar la confirmación por correo si prefieres aprobar manualmente desde la intranet.

> Todo este flujo se puede completar desde una tablet copiando y pegando los archivos.

---

## 3. Preparar el front-end

1. Copia `config.example.js` como `config.js` y reemplaza:
   - `window.__GLCBC_SUPABASE_URL__` → URL del proyecto.
   - `window.__GLCBC_SUPABASE_ANON_KEY__` → anon public key.
   - `window.__GLCBC_API_BASE__` → URL de la Edge Function (`https://…/portal`).
   - `window.__GLCBC_ORG_SLUG__` → normalmente `glcbc`.

2. Sube todos los archivos del repositorio a un hosting estático (recomendado **Cloudflare Pages**, plan gratuito):
   - Conecta tu repositorio de GitHub.
   - Build command: `None`.
   - Output directory: `.` (el directorio raíz).
   - Publica. Obtendrás una URL tipo `https://glcbc.pages.dev`.

3. En Supabase (`Authentication → URL Configuration`) agrega:
   - `Site URL`: `https://glcbc.pages.dev` (ajusta al dominio real).
   - `Redirect URLs`: agrega la URL anterior y `https://glcbc.pages.dev/*` (también puedes incluir `http://localhost:4173/*` si alguna vez pruebas desde escritorio).

Con esto el portal se conectará directamente a Supabase desde cualquier dispositivo.

### Ejemplo real con Cloudflare Pages

Si ya cuentas con un proyecto activo en Cloudflare Pages como `grupo-legal-cbc-y-asociados.pages.dev` (dominio principal y
subdominios automáticos), sigue estos pasos específicos:

1. Copia `config.example.js` como `config.js` y reemplaza:
   - `window.__GLCBC_SUPABASE_URL__` → `https://focxelshnrrvanlnusqf.supabase.co`.
   - `window.__GLCBC_SUPABASE_ANON_KEY__` → tu **anon public key** (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`).
   - `window.__GLCBC_API_BASE__` → `https://focxelshnrrvanlnusqf.functions.supabase.co/portal`.
2. Sube todos los archivos a Cloudflare Pages desde el navegador (botón **Upload assets**) o deja habilitado el despliegue
   automático conectado a GitHub.
3. En Supabase añade todas las URLs que entrega Cloudflare en `Authentication → URL Configuration`, por ejemplo:
   - `https://grupo-legal-cbc-y-asociados.pages.dev`
   - `https://*.grupo-legal-cbc-y-asociados.pages.dev/*`

> Importante: **no** coloques la `service_role key` en `config.js` ni en ningún archivo público. Esa clave debe mantenerse como
> secreto de Supabase o GitHub Actions. Para el navegador solo utiliza la `anon public key`.

---

## 4. Automatizar desde GitHub (opcional, sin usar consola)

### 4.1. ZIP descargable en cada push

- El workflow `.github/workflows/package.yml` genera un archivo `glcbc-portal.zip` automáticamente y lo deja disponible como artefacto en la pestaña **Actions**.
- Alternativamente, en la pestaña **Code** de GitHub puedes usar el botón **Download ZIP** para bajar todo el repositorio sin utilizar la línea de comandos.

### 4.2. Fusión de ramas desde GitHub (sin usar consola)

- El workflow `.github/workflows/merge-branches.yml` te permite fusionar la rama `work` (o cualquier otra) en `main` directamente desde la pestaña **Actions**.
- Pulsa **Run workflow**, elige las ramas si deseas cambiar los valores por defecto y espera a que finalice. Si alguna rama no existe, el flujo se detendrá de forma segura y dejará un mensaje en el resumen.

### 4.3. Despliegue automático de la Edge Function

1. En tu repositorio de GitHub abre `Settings → Secrets and variables → Actions` y crea dos secretos:
   - `SUPABASE_ACCESS_TOKEN`: lo obtienes en Supabase (`Account Settings → Access Tokens`).
   - `SUPABASE_PROJECT_REF`: el identificador de tu proyecto (ejemplo `abcd1234`).

2. A partir de ahora, cada vez que actualices cualquier archivo dentro de `supabase/`, el workflow `deploy-supabase.yml` intentará desplegar la función `portal` automáticamente. Si los secretos no están configurados, verás un mensaje de “Supabase deployment skipped…” y la ejecución finalizará en verde; en cuanto agregues ambos secretos, el despliegue se realizará con normalidad. También puedes ejecutarlo manualmente con el botón “Run workflow”.

Todo el ciclo (editar archivos, subir a GitHub, desplegar en Supabase y Cloudflare Pages) se puede hacer desde el navegador.

---

## 5. Uso diario del portal

1. **Registro**: comparte `register.html`. Cada solicitud queda en la sección “Solicitudes” del dashboard.
2. **Primer administrador**: el primer usuario que apruebes se convierte en Admin. También puedes usar `set-role.html` para forzar tu rol a `Admin` (requiere iniciar sesión).
3. **Roles y permisos**: la lógica de `app.js` respeta toda la matriz solicitada (socios, asociados, cliente, etc.).
4. **Auditoría y bitácora**: todas las acciones pasan por la función Edge y quedan registradas en el estado central (`glcbc_state`).
5. **Documentos en la nube**: los archivos se guardan en Supabase como parte del JSON (en base64, límite 25 MB). Todos los miembros ven la misma información desde cualquier ubicación.
6. **Notificaciones / aprobaciones**: siguen operando como en la especificación (colas y mensajes dentro del portal). Puedes implementar integraciones externas (correo, WhatsApp) llamando a la función Edge desde otros servicios si lo deseas.

---

## 6. Tips importantes

- **Respaldo**: desde Supabase puedes exportar la tabla `glcbc_state` (CSV o JSON) en cualquier momento como copia de seguridad.
- **Privacidad**: la política de RLS sólo permite que usuarios autenticados accedan/actualicen datos. La Edge Function controla los permisos finos.
- **Personalización**: modifica textos, imágenes y estilos directamente en los archivos HTML/CSS. El portal lee contenido editable desde el estado central para módulos como “Quiénes somos” o “Servicios”.
- **Escalabilidad**: si necesitas separar estados por oficina o sucursal, crea varias filas en `glcbc_state` con distintos `slug` y cambia `window.__GLCBC_ORG_SLUG__` según corresponda.

---

## 7. ¿Necesitas ayuda?

- Si un flujo falla, revisa la consola del navegador y el registro de la Edge Function (en Supabase → Edge Functions → Logs) para obtener el error exacto.
- Para soporte adicional puedes abrir un Issue en el repositorio o compartir el mensaje de error.
- Si GitHub muestra conflictos al fusionar la rama `work` con `main`, sigue la guía detallada en [`docs/RESOLVING_CONFLICTS.md`](docs/RESOLVING_CONFLICTS.md) para conservar todas las mejoras del portal.

Con estos pasos tienes una plataforma **100 % en la nube**, gratuita (Supabase + Cloudflare Pages) y administrable desde cualquier dispositivo con navegador.
