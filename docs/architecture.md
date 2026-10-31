# Frontend architecture

SPA + Tauri (web, escritorio y APK desde el mismo código), Vite + Svelte 5,
TypeScript estricto. Mobile-first y responsive desde el principio.

## Stack y por qué

| Pieza | Elección | Motivo |
|---|---|---|
| Build | Vite 7 | Rápido, `tauri dev/build` lo espera en el puerto 1420 |
| UI | Svelte 5 | Ligero para APK, sin runtime pesado |
| Router | `svelte-spa-router` (hash) | Sin fallback de servidor: funciona en `file://`, dev y webviews de Tauri |
| Gráficas | `echarts` | Bien mantenida; se usará en el panel admin (fase siguiente) |
| Estado | stores de Svelte | Sin dependencias extra |
| Shell nativo | Tauri 2 (`@tauri-apps/cli`) | Un binario para escritorio + APK con `tauri android` |

## Estructura domain-based (`src/`)

```
src/
  main.ts, App.svelte, routes.ts
  styles/global.css        # tokens de tema; única fuente de color
  lib/
    theme/                 # store light/dark/auto + <meta theme-color>
    i18n/                  # es.ts central + store t (listo para más locales)
    api/                   # client.ts (fetch), types.ts (formas del backend)
    ui/                    # Icon, TopBar, TopActions, Tabs, Sheet (portal),
                           # EmptyState, Skeleton, palette, cssvar
    shell/                 # SettingsPanel, HelpPanel (+ Pages)
    nav.ts                 # path reactivo, guarded(), backOrHome()
  domains/
    auth/                  # Login, Recover (mockup), session, accounts (dev)
    teacher/               # Home, ClassDetail, ScheduleTab, ClassCard, api.ts
    admin/                 # Overview, Teachers, TeacherDetail, Students,
                           # ScheduleBoard, api.ts (lazy: echarts fuera del
                           # bundle docente)
```

Reglas: los dominios no se importan entre sí; lo compartido vive en
`lib/`. Nada de datos falsos: estados vacíos honestos + skeletons.
Colores solo vía `var(--*)` (global.css); textos UI solo vía `t` (es.ts).

## API desde el principio

Base en `VITE_API_URL` (`.env`, sensible fuera del repo; `.env.example`
documenta las claves). El cliente envía `Authorization: Bearer <token>`
desde la sesión (login real contra `POST /v1/login`) y traduce errores al
contrato del backend: 401 → rotación y, si muere, popup global de sesión
vencida + login; 403 → atrás o home del rol, salvo `forbidden` propio
(como la lista ajena, que vuelve a la agenda del docente) (`lib/nav.ts`).

Permisos reutilizables: `GET /v1/me` trae `permissions` y `lib/access.ts`
(`hasPermission` + `can*`) solo lee esa lista, con respaldo a la matriz
por rol si el backend aún no la envía. Añadir un permiso es tocar el mapa
de roles del backend y usar `hasPermission` aquí.

Día lectivo del servidor: `GET /v1/today` (fecha de Bogotá, nunca UTC
crudo) vía `lib/schoolDay.ts`; la lista, la agenda y el historial
consultan y rotulan con ese día, no con el reloj del equipo.

Carga resiliente: `lib/sessionReady.ts` (`loadWhenReady`) recarga cada
pantalla cuando la sesión vuelve a estar lista; los shells reintentan el
perfil con pausa si falló. Contratos viva: e2e del backend
(`backend/src/tests/e2e/teacher_flow_test.go`,
`group_scope_test.go`) con los cuerpos exactos del SPA, más
`scripts/backend-contract.test.mjs` (`npm run test:contract`, en CI) que
empaqueta los módulos reales de API y exige URLs/cuerpos compatibles.

URLs opacas: `/clase/:slug`, `/admin/estudiantes/:slug[/resumen]`,
`/admin/docentes/:slug`. `lib/slug.ts` (`resolveId`) traduce una vez
(con caché) al UUID interno; los enlaces usan `Slug || UUID`.
Uniforme: checkbox por estudiante en la lista (marcado por defecto);
solo viajan los cambios (`POST .../uniform`). Se muestra en resumen
(chip + conteo), ficha e historial de la llamada.
Descargos: defensa escrita ante una falta (`POST .../defenses`,
permiso `record-defenses`: admin + secretaría). Popup con motivo
obligatorio junto al botón de permiso; se muestra junto a la falta.

## Orden construido y siguiente

1. ✅ Entorno, deps, Tauri, `.env`, `.gitignore` (incluye `reference/`)
2. ✅ Fundación: tokens, tema, i18n, API, iconos, login, shell
3. ✅ Login profesional (Observador Estudiantil): correo o usuario
   (`nombre.apellido`, creado por admins; colisiones con letras del
   segundo apellido), contraseña con mostrar/ocultar, mockup de
   recuperación, layout dividido en escritorio. Cuentas dev en
   `accounts.ts`; el rol lo determina `/v1/me` → home
3. ✅ Dominio docente: home (hoy/próxima/vacío), detalle de clase
   (lista alfabética, marcas, llamado multiselección), tab horario
4. ✅ Dominio admin (drafts honestos): Resumen con ECharts (donut +
   barras, overlay vacío), Docentes + ficha (lista diaria, calendario
   de asistencia, materias y salones leídos del horario),
   Estudiantes por año/salón, tablero semanal estilo `reference/` con
   overlay de edición y catálogo de materias integrado (arrastrar al
   horario). Docentes como lista única con ficha completa (foto,
   calendario de asistencia y deltas); lista diaria en pantalla propia
   con esperados del horario y nada preseleccionado; historial de
   listas por día con tarjetas expandibles. Login enruta por rol
   (`/v1/me` → home).
5. ✅ Login profesional (Observador Estudiantil): correo o usuario
   (`nombre.apellido`, creado por admins), contraseña con mostrar/ocultar,
   mockup de recuperación, layout dividido en escritorio. Cuentas dev en
   `accounts.ts`; el rol lo determina `/v1/me` → home.
6. ✅ Ajustes y Ayuda como páginas (`/ajustes`, `/ayuda`); `Sheet` usa
   portal al `body` (inmune a ancestros que rompen `position:fixed`) con
   scroll interno contenido. Login endurecido: borrador persistido (solo
   identificador), espacio de error reservado, `100svh` estable ante el
   teclado móvil, centrado vertical.
7. ➡️ Endpoints backend pendientes + login real por roles (ver
   `docs/api-client.md`)
