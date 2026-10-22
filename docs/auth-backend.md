# Autenticación: estado real

Documento de referencia del lado frontend. El contrato vive en
`school-backend/docs/api.md`; aquí solo el estado y cómo lo consume el SPA.

## Estado real (login con refresh)

- `POST /v1/login {identifier, password}` → `200 {token, expiresAt,
  refreshToken, refreshExpiresAt, subject, roles, home}` (access 15m,
  refresh rotativo 7d). Identificador desconocido, clave errada y cuenta
  inactiva comparten el 401 `users.err_invalid_credentials`; throttling
  10/min por identificador+IP (429 `http.err_rate_limited`, persistente).
- El cliente guarda el par (`grado.token` + `grado.refresh`, más cookie
  HttpOnly `refresh_token` cuando aplica) y manda
  `Authorization: Bearer`. `session.ts` rota proactivo (~80% TTL,
  single-flight) y `guarded()` reintenta una vez ante 401; si la sesión
  murió, limpia, marca aviso y va a `/login`.
- Revocación por versión: cambio de clave, disable (`PUT
  /v1/users/{id}/active`) y recovery revocan access (versión) + refresh
  (servidor). Tras cambiar la propia clave, el panel cierra todo y pide
  entrar de nuevo.
- `GET /v1/me` trae perfil de cuenta + docente vinculado
  (`username`, `email`, `active`, `teacherID`, `teacher`), y
  `GET/PUT /v1/me/photo`, `GET/PUT /v1/teachers/me/photo` la foto propia.
- Throttle de login/refresh persistente (`login_attempts`,
  `TRUSTED_PROXIES` para IP real tras proxy); intentos auditados.
  Sin bloqueo permanente por diseño: el corte es desactivar la cuenta.
- Recovery: `POST /v1/recover/request` (siempre 204) y
  `POST /v1/recover/reset` (un solo uso, 1h). UI en `/recuperar` y
  `/recuperar/:token`; el envío del token (mail/WhatsApp) pendiente.
- Cuentas: `POST /v1/users` (+ `teacherID` opcional que enlaza),
  `GET /v1/teachers/{id}/account` y `PUT /v1/users/{id}/active`
  (`manage-users`); la ficha docente muestra y alterna el acceso.

## Pendiente (ver `spec/BACKLOG.md`)

- Envío del token de recovery por correo/WhatsApp.
- Cookie estricta (`Allow-Credentials` + `credentials: 'include'`).
