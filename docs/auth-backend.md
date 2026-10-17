# Autenticación: estado real y pendientes

Documentación de referencia. No se modificó `school-backend/`.

## Estado real (tras el commit backend "Add user auth")

- **Sí existe** la capability `users`: tabla `users` con `username`,
  `email`, `password_hash` (bcrypt), `active`. Ver
  `school-backend/docs/users.md`.
- `User.ID` **es** el subject que consume el sistema de roles.
- **No existe todavía** ningún endpoint de login/token: no hay
  `POST /v1/login`, ni `logout`, ni `refresh`, ni uso de `Authorization`.
  La identidad sigue viajando en el header `X-Subject-ID`.
- El admin raíz se crea al arrancar con `BOOTSTRAP_ADMIN_USERNAME` +
  `BOOTSTRAP_ADMIN_PASSWORD` (+ `BOOTSTRAP_ADMIN_EMAIL` opcional), y su
  rol admin se re-asegura en cada boot. `SEED_ADMINS` / `SEED_TEACHERS`
  siguen funcionando para Roles sobre UUIDs de subjects.
- `users.Service` (`Authenticate`, `Create`, `SetPassword`, `SetActive`)
  ya existe y está testeado: lo que falta es la capa HTTP.

## Qué sigue en el login del frontend (mockup)

- `src/domains/auth/accounts.ts` sigue siendo el directorio dev
  (`admin`, `carlos.mendoza`); la contraseña se compara en el cliente y
  nunca viaja al backend.
- `session.ts` guarda solo el id del sujeto; `client.ts` manda
  `X-Subject-ID`. No hay soporte de token en código.
- Hueco conocido: escribir un UUID crudo como identificador crea una
  cuenta con contraseña vacía y `checkDevPassword` la acepta.

## Cuando exista `POST /v1/login` (cambios solo de frontend)

1. `accounts.ts`: borrar el directorio dev.
2. `Login.svelte`: sustituir `resolveDevAccount`/`checkDevPassword` por
   `POST /v1/login {"identifier","password"}`; mapear
   `users.err_invalid_credentials` a un mensaje único.
3. `session.ts`: guardar token + expiración (`grado.token`).
4. `client.ts`: `Authorization: Bearer <token>`; mantener
   `X-Subject-ID` solo con `VITE_DEV_SUBJECT_ID` (modo dev).
5. `guarded()` en `lib/nav.ts` no cambia: `401`/`403` ya están resueltos.

## Bloqueos de dominio docente en el backend (pendientes, sin tocar)

- **Vínculo `users.User` ↔ `Teacher.ID`: existe** (`TeacherID` + link
  en seed + resolución en `GET /v1/teachers/me/schedule`). Falta
  exponerlo por HTTP (alta con docente y vincular/desvincular) y el
  nombre del docente en la cabecera, que llega con el login real.
- **Roles en Postgres**: hoy viven en memoria, se pierden al reiniciar.
- **Alta de cuentas por HTTP**: `POST /v1/users` y `POST /v1/roles`
  (este último ya existe pero el frontend aún no lo llama).
- **Auditoría y throttling** de login (pendientes de Ley 1581).