# Autenticación pendiente (documentación, sin cambios en backend)

Estado real hoy: **no hay login en el backend**. No existe tabla
`users`, ni contraseñas, ni sesiones. Esto es lo que el frontend simula
y lo que habría que construir en `school-backend/src/core/users`.

No se tocó `school-backend/`; este documento es la especificación
pendiente.

## Cómo "inicia sesión" hoy (mockup, solo frontend)

- `src/domains/auth/accounts.ts` es el directorio de cuentas dev:
  `admin` / `admin123*` y `carlos.mendoza` / `docente123*`. La
  contraseña se compara en el cliente (`checkDevPassword`) y **nunca
  viaja al backend**.
- `src/domains/auth/session.ts` guarda el id del sujeto.
  `src/lib/api/client.ts` lo manda como header `X-Subject-ID`.
- El backend confía ese header (identidad placeholder,
  `school-backend/docs/api.md`): cualquier UUID válido entra como
  "ese" sujeto. No hay verificación.
- Escribir un UUID crudo como identificador crea una cuenta con
  contraseña vacía, y `checkDevPassword` la acepta.

## Cómo nace una identidad hoy

Único camino: variables de entorno al arrancar
(`school-backend/src/cmd/server/main.go`, `SEED_ADMINS`,
`SEED_TEACHERS`, UUIDs separados por coma). Los roles viven en
`roles.MemoryStore`, así que **se borran en cada reinicio**; sin
`DATABASE_URL` no hay persistencia de roles.

Flujo completo para una cuenta nueva:

1. Admin raíz sembrado con `SEED_ADMINS=<uuid>` (obligatorio: nadie
   puede otorgar el primer rol).
2. `POST /v1/teachers` (permiso `manage-users`, solo admin) — el
   servicio asigna el `ID`; el body ignora `ID` y `Active`.
   Campos válidos: `Names`, `Surnames`, `DocumentID` (obligatorios),
   `Phone`, `Address`, `Birthplace`, `Email`, `MedicalConditions`,
   `HomeroomClassID`. JSON estricto: un campo desconocido es `400`.
3. `POST /v1/roles {"subjectID":"<ID>","role":"teacher"}`
   (permiso `manage-roles`, solo admin) — concede en vivo, sin
   reiniciar.
4. Añadir el `ID` a `src/domains/auth/accounts.ts` para poder escribir
   la contraseña en el login del mockup.

Matriz de permisos (`core/roles/permission.go`): `admin` recibe la
unión de todas; `teacher` solo `view-students`,
`record-attendance`, `record-incidents`, `view-class-statistics`;
`student` solo `view-own-history`. Crear cuentas y dar roles es
exclusivo de admin.

## Qué falta en backend (spec propuesta)

Capability `users` + `auth`, siguiendo la arquitectura existente
(ports + services + adaptador de Postgres, textos en el catálogo i18n,
códigos de error estables):

- `User{ID, SubjectID, Names, Surnames, DocumentID, Email, PasswordHash,
  Active, CreatedAt, UpdatedAt}` + `TeacherID` opcional para enlazar el
  perfil docente.
- Hash de contraseñas (`bcrypt`/`argon2`), nunca texto plano; política
  de contraseña y bloqueo por intentos.
- Endpoints:
  - `POST /v1/login {"identifier","password"}` → `200 {"token",
    "expiresAt", "subject", "roles", "home"}` (`401
    http.err_unauthorized` si no valida, sin revelar cuál campo falló).
  - `POST /v1/logout` (revoca el token), `POST /v1/refresh`.
  - `GET /v1/me` se mantiene; opcionalmente añade `displayName` para
    la cabecera (ver `agenda-backend.md` §2).
- El token reemplaza el header **sin tocar handlers**: el middleware
  de contexto sigue siendo la única fuente del sujeto, tal como
  anticipa `docs/api.md` ("a token scheme replaces the header without
  touching handlers").
- Roles en Postgres (`roles.Store` con adaptador) para que sobrevivan
  reinicios; hoy `MemoryStore` + `SEED_*`.
- Statics: throttling de `/v1/login`, auditoría de accesos y
  preference de idioma por usuario (hoy la elige `?lang=` o
  `Accept-Language`).

## Cambios que corresponden solo al frontend (cuando exista)

- `Login.svelte`: sustituir `resolveDevAccount`/`checkDevPassword` por
  una llamada real; borrar el directorio de cuentas dev.
- `session.ts`: guardar token + expiración en vez del id de sujeto.
- `client.ts`: enviar `Authorization: Bearer <token>`; dejar
  `X-Subject-ID` solo si `VITE_DEV_SUBJECT_ID` está puesto (modo dev).
- `guarded()` no cambia: los códigos `401`/`403` y el destino ya están
  implementados.
- El `home` que devuelve `GET /v1/me` sigue siendo la referencia de
  navegación (`/admin`, `/docente`, `/estudiante`).
