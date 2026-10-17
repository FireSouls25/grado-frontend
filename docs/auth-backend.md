# Autenticación: estado real y pendientes

Documentación de referencia. No se modificó `school-backend/`.

## Estado real (login con tokens)

- **Sí existe** la capability `users`: tabla `users` con `username`,
  `email`, `password_hash` (bcrypt), `active` y `teacher_id`. Ver
  `school-backend/docs/users.md`.
- `User.ID` **es** el subject que consume el sistema de roles.
- **Sí existe** `POST /v1/login {identifier, password}` →
  `200 {token, expiresAt, subject, roles, home}` (HS256, 12h por
  defecto). Identificador desconocido, clave errada y cuenta inactiva
  comparten el 401 `users.err_invalid_credentials`.
- Throttling: 10 intentos por identificador+IP y minuto (429
  `http.err_rate_limited`).
- La identidad viaja como `Authorization: Bearer <token>`; el header
  `X-Subject-ID` solo se acepta en desarrollo (y tests), nunca en
  producción.
- El admin raíz se crea al arrancar con `BOOTSTRAP_ADMIN_USERNAME` +
  `BOOTSTRAP_ADMIN_PASSWORD` (+ `BOOTSTRAP_ADMIN_EMAIL` opcional), y su
  rol admin se re-asegura en cada boot. En producción `AUTH_SECRET` es
  obligatorio (el arranque falla sin él); en desarrollo vacío significa
  secreto aleatorio por arranque.
- Los roles ya viven en Postgres (`role_grants`): sobreviven reinicios.

## Login del frontend (real, sin mockup)

- `Login.svelte` llama `POST /v1/login`; el mock `accounts.ts` se
  eliminó: no quedan credenciales en el cliente.
- `session.ts` guarda el token (`grado.token`); `client.ts` manda
  `Authorization: Bearer`. El vencimiento cae a `/login` vía
  `guarded()` (401).

## Pendiente (fase de login, sin tocar)

- `POST /v1/refresh` y revocación (denylist): hoy logout es descartar
  el token en el cliente y el vencimiento lo invalida en el servidor.
- Nombre del docente en la cabecera y alta con docente por HTTP.
- Auditoría y throttling distribuido del login (pendientes de Ley 1581;
  el throttling actual es en memoria, por instancia).

## Bloqueos de dominio docente en el backend (pendientes, sin tocar)

- **Vínculo `users.User` ↔ `Teacher.ID`: existe** (`TeacherID` + link
  en seed + resolución en `GET /v1/teachers/me/schedule`). Falta
  exponerlo por HTTP (alta con docente y vincular/desvincular) y el
  nombre del docente en la cabecera, que llega con el login real.
- **Roles en Postgres**: hoy viven en memoria, se pierden al reiniciar.
- **Alta de cuentas por HTTP**: `POST /v1/users` y `POST /v1/roles`
  (este último ya existe pero el frontend aún no lo llama).
- **Auditoría y throttling** de login (pendientes de Ley 1581).