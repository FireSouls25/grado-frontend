# Plan frontend — adoptar backend auth (5 entregas) + backlog

Estado: backend `main` trae (1) perfil (`GET /v1/me` completo, `PUT /v1/me/password`,
`GET/PUT /v1/me/photo`, `GET/PUT /v1/teachers/me/photo`, `PUT /teachers/{id}` con sexo),
(2) revocación por `token_version`, (3) access 15m + refresh rotativo 7d con cookie
HttpOnly, (4) throttle persistente + `TRUSTED_PROXIES`, (5) `POST /v1/recover/request|reset`
y `PUT /v1/users/{id}/active`. El frontend (`main` = ex-`dev/perfil`) solo consume (1).

## Fase A — Sesión con refresh (backend #3a) [grande, primero]
- [x] A1 `client.ts`: guardar refresh (`grado.refresh`), `credentials: 'include'`,
      `refresh()` a `POST /v1/refresh` (cookie preferida, JSON fallback), single-flight.
- [x] A2 `session.ts`: `login(access, refresh)`, `logout()` → `POST /v1/logout` best-effort
      + limpiar ambos tokens. `SettingsPanel`/logout actual solo limpia local.
- [x] A3 auto-refresh: proactivo (~80% TTL) + reactivo (401 → 1 refresh → reintento;
      401/revocado → `/login`). Integrar en `guarded()` (`lib/nav.ts`).
- [x] A4 `Login.svelte`: guardar par, estado 429 dedicado (ver C1).
- [x] A5 `es.ts`: claves sesión expirada/revocada, reintento.
- Nota: flujo JSON funciona hoy cross-origin sin cambios; cookie estricta
  (`Allow-Credentials` backend + `credentials:include`) como endurecimiento posterior.

## Fase B — Recuperación real + cuentas (backend #5)
- [x] B1 `Recover.svelte`: `POST /v1/recover/request` real, quitar mock `setTimeout` y
      `demoNote`; éxito genérico (sin enumerar) + estado 429.
- [x] B2 nueva ruta `/recuperar/:token` (formulario token + clave) →
      `POST /v1/recover/reset`; débil → 400 inline, inválido/vencido → pedir nuevo;
      éxito → `/login`.
- [x] B3 `es.ts`: actualizar `recovery.*` (quitar "demostración visual").
- [x] B4 admin (cuenta en ficha: `GET /v1/teachers/{id}/account`, toggle `PUT /v1/users/{id}/active`; alta enlaza `teacherID`): toggle cuenta `PUT /v1/users/{id}/active` en docentes (o sección Cuentas):
      estado del login, confirmación, feedback. (Hoy solo retirar perfil, no login.)

## Fase C — Respuesta a throttle (backend #4) [chico]
- [x] C1 login/recover/reset: 429 con mensaje del backend + botón deshabilitado con
      cuenta regresiva (helper `cooldown.ts`, ventana 1 min).
- [x] C2 `es.ts`: `rateLimited` + `retryIn(s)`; recover/reset reutilizan login.

## Fase D — Verificación perfil/revocación (backend #1/#2) [chico]
- [ ] D1 re-verificar `ProfilePanel`/`profile.ts` (password/foto) contra backend `main`
      real; tras cambio de clave avisar "las demás sesiones se cerraron".
- [ ] D2 al caer a `/login` por 401 distinguir "sesión vencida/revocada" (flag o store).

## Backlog — faltante frontend (con nota de backend)
- [ ] HU033–037 años/festivos/salones/matrícula/promoción: backend parcial
      (`groupsByYear/createClassGroup`; sin years/enrollments/promociones por HTTP)
      → **primero backend**, luego UI año→salón→nómina→promover/repetir/graduar.
- [ ] HU039 estudiante ve su historial: backend listo (`view-own-history`) →
      falta vista dedicada (hoy `EmptyState`).
- [ ] HU038 WhatsApp acudiente: pendiente en ambos; solo campana local hoy.
- [ ] HU003 recuperación por correo/enlace: B1–B3 cubren flujo por token; envío real
      (mail/WhatsApp) pendiente de integración.
- [ ] RNF016 E2E automatizada: hoy solo scripts manuales; cubrir login→refresh→
      recover→throttle 429.
