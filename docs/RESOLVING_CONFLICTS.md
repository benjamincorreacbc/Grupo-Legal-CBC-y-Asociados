# Resolver conflictos de fusión en GitHub (paso a paso)

Este instructivo está pensado para cuando GitHub te muestra el banner de "Conflicting files" al intentar mezclar la rama `work` (la rama con todas las mejoras del portal) con `main`. Los ejemplos están basados en los conflictos reales que reportaste en `README.md` y `js/app.js`.

## 1. Abrir el editor de conflictos de GitHub

1. Entra al Pull Request que GitHub te marcó con conflictos.
2. Presiona el botón **Resolve conflicts**. GitHub abrirá un editor de texto donde cada archivo con conflicto aparece con marcas especiales.

Las marcas tienen este aspecto:

```
<<<<<<< HEAD
(código que existe actualmente en la rama que recibirá los cambios, normalmente `main`)
=======
(código que llega desde la rama que quieres fusionar, por ejemplo `work`)
>>>>>>> work
```

- Todo lo que está entre `<<<<<<< HEAD` y `=======` es lo que existe hoy en `main`.
- Lo que está entre `=======` y `>>>>>>> work` corresponde a las mejoras nuevas.

## 2. Decidir qué debe quedar

Para este proyecto la recomendación es **quedarse con el contenido de la rama `work`**, porque es la que contiene la versión completa del portal (backend en Supabase, formularios corregidos, estilos actualizados, etc.). Esto significa que, en cada conflicto, debes:

1. Borrar la sección antigua (`<<<<<<< HEAD ...`),
2. Dejar únicamente la versión nueva (`======= ...`),
3. Eliminar las marcas `<<<<<<<`, `=======`, `>>>>>>>`.

> **Consejo**: Si hay información en `main` que quieras preservar (por ejemplo, un párrafo específico del README), puedes copiarla manualmente y pegarla donde corresponda antes de eliminar las marcas.

## 3. Conflicto concreto en `README.md`

1. Conserva la versión larga que explica la arquitectura en la nube y la guía de despliegue.
2. Elimina el bloque antiguo que solo describía los archivos básicos.
3. Asegúrate de que el archivo final comience con `# Portal Integral GL-CBC — Guía completa (100 % online)` y siga con las secciones numeradas (Configuración de Supabase, Preparar el front-end, etc.).

## 4. Conflictos en `js/app.js`

`js/app.js` es el módulo que inicializa la sesión con Supabase, conecta los formularios del dashboard y expone las funciones globales (`switchModule`, `logout`, `toggleAddCaseForm`, etc.). En cada conflicto:

- Conserva la versión que importa `requireSessionOrRedirect` y la capa de datos desde `./auth.js` y `./data.js`.
- Verifica que se mantengan las funciones auxiliares como `refreshCases`, los listeners de cada formulario y las asignaciones a `window.*`.
- Asegúrate de que al final se invoque `switchModule('home')` y `refreshCases()` tras cargar la página.

Si aparece un bloque reducido que no contiene estas importaciones ni los listeners, elimínalo y deja la versión completa del módulo.

## 5. Guardar y continuar

Cuando hayas resuelto todos los archivos:

1. Haz clic en **Mark as resolved** en la parte superior del editor.
2. Pulsa **Commit merge**. GitHub creará un commit automático con los archivos sin las marcas de conflicto.
3. Vuelve al Pull Request y haz clic en **Re-run jobs** si había acciones fallidas (opcional).
4. Finalmente, presiona **Merge pull request**.

## 6. Si prefieres resolver desde GitHub Desktop o la terminal

1. Descarga los cambios de `main` y de `work` (`git fetch origin`).
2. Cambia a `work` y fusiona `main`: `git checkout work && git merge origin/main`.
3. Abre `README.md` y `js/app.js` en un editor, realiza los pasos de arriba y guarda.
4. Ejecuta `git add README.md js/app.js`.
5. Confirma con `git commit` y sube los cambios: `git push origin work`.

---

Con estos pasos tendrás la rama lista para mezclar sin perder ninguna de las mejoras implementadas.
