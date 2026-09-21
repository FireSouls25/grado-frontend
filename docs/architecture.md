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
    ui/                    # Icon, TopBar, TopActions, Tabs, Sheet, EmptyState, Skeleton, palette
    shell/                 # SettingsPanel, HelpPanel
    nav.ts                 # path reactivo, guarded(), backOrHome()
  domains/
    auth/                  # Login, session (subject id persistido)
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
documenta las claves). El cliente envía `X-Subject-ID` desde la sesión
(`VITE_DEV_SUBJECT_ID` solo como conveniencia dev) y traduce errores al
contrato del backend: 401 → login, 403 → atrás o home del rol
(`lib/nav.ts`). Endpoints usados hoy: `GET /v1/me`. Los de horario,
lista, apertura de sesión y lote de llamados aún no existen en el
backend (`domains/teacher/api.ts`, marcados `@pending-backend`): fallan
suave a vacíos y se encienden solos cuando el backend los exponga.

## Orden construido y siguiente

1. ✅ Entorno, deps, Tauri, `.env`, `.gitignore` (incluye `reference/`)
2. ✅ Fundación: tokens, tema, i18n, API, iconos, login, shell
3. ✅ Dominio docente: home (hoy/próxima/vacío), detalle de clase
   (lista alfabética, marcas, llamado multiselección), tab horario
4. ✅ Dominio admin (drafts honestos): Resumen con ECharts (donut +
   barras, overlay vacío), Docentes + ficha (materias, salones, asignar),
   Estudiantes por año/salón, tablero semanal estilo `reference/` con
   overlay de edición. Login enruta por rol (`/v1/me` → home).
5. ➡️ Endpoints backend pendientes + login real por roles (ver
   `docs/api-client.md`)
