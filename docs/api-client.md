# API client

`src/lib/api/client.ts` + `types.ts`, por dominio en `domains/*/api.ts`.

## Reglas

- Base `VITE_API_URL`; secretos y entorno solo en `.env` (gitignoreado).
- El backend serializa con los nombres de campos de Go, capitalizados
  (`Names`, `DocumentID`, `StudentID`…). Los tipos TS deben usar las
  mismas mayúsculas: un `names` en minúscula compila pero llega
  `undefined` en runtime.
- Desarrollo en navegador: el backend debe permitir el origen dev
  (`ALLOWED_ORIGINS=http://127.0.0.1:1420,http://localhost:1420`), o los
  fetch mueren en preflight y todo se ve como error de red. En Tauri
  el origen será el del webview (`tauri.localhost`).
- Identidad: `Authorization: Bearer <token>` desde la sesión (login
  real contra `POST /v1/login`; el token vive en `grado.token`).
- `ApiError { code, status }`: `code` es la clave estable del backend
  (`http.err_forbidden`, …), `message` ya viene en español.
- `guarded()` implementa el contrato del backend: 401 → `/login`,
  403 → atrás en historial o home del rol (`GET /v1/me`); lo demás se
  relanza para pantallas de error con reintento.
- Sin datos inventados: si un endpoint aún no existe (404 de chi),
  `isMissing()` lo convierte en estado vacío honesto, nunca en error
  en bucle. Ver `domains/teacher/api.ts` (`@pending-backend`).

## Pendiente del backend (para encender el flujo docente)

Nada pendiente: todos los endpoints que el frontend llama existen.
Lo que falta es producto nuevo, no huecos (login con token, lecturas
propias del docente, notificaciones).

Ya existen y el frontend los usa: `GET /v1/me`, `GET /v1/teachers`,
`GET /v1/teachers/{id}`, `GET /v1/subjects`, `GET /v1/subjects/{id}`,
`POST /v1/subjects`, `PUT /v1/subjects/{id}`,
`DELETE /v1/subjects/{id}`, `GET /v1/subjects/{id}/assignments`,
`POST /v1/assignments`, `POST /v1/assignments/{id}/end`,
`DELETE /v1/assignments/{id}`, `GET /v1/teachers/{id}/assignments`,
`GET /v1/schedule`, `POST /v1/schedule`, `PUT /v1/schedule/{id}`,
`DELETE /v1/schedule/{id}`, `POST /v1/students`, `PUT /v1/students/{id}`,
`POST /v1/teachers`, `PUT /v1/teachers/{id}`,
`POST /v1/sessions/{id}/marks`,
`GET /v1/statistics/class/{groupID}`, `GET /v1/statistics/student/{id}`,
`GET /v1/students/{id}`, `GET /v1/students/{id}/warnings` (ahora con nombres resueltos),
`POST /v1/warnings/batch`, `GET /v1/warnings/recent`,
`PUT /v1/warnings/{id}`, `GET /v1/warnings/{id}/revisions`,
`GET /v1/incidents/recent`, `GET /v1/classes?year=N`,
`GET /v1/classes/{groupID}/roster`, `GET /v1/teachers/me/schedule`,
`POST /v1/sessions/open`, `GET /v1/dashboard/summary`, `POST /v1/users`,
`GET /v1/audit`, `POST /v1/classes`, `POST /v1/teachers/attendance`,
`GET /v1/teachers/attendance`, `GET /v1/teachers/{id}/attendance`,
`GET /v1/teachers/roll`, `GET /v1/teachers/attendance/history`,
`GET /v1/teachers/attendance/revisions`,
`PUT /v1/teachers/{id}/photo`, `GET /v1/teachers/{id}/photo`,
`GET /v1/teachers/{id}/sessions`, `GET /v1/teachers/{id}/warnings-made`,
`GET /v1/sessions/history`, `GET /v1/sessions/{id}`,
`GET /v1/teachers/me/photo`, `PUT /v1/teachers/me/photo`,
`PUT /v1/me/password`, `GET /v1/me/photo`, `PUT /v1/me/photo`.

Notas de los endpoints de edición:

- `PUT /v1/students/{id}` **reemplaza** el perfil completo (el estado lo
  administra el servidor). El frontend envía la ficha tal como la cargó,
  con los campos editados.
- `PUT /v1/teachers/{id}` es **parcial**: lo que no se envía se conserva,
  así un formulario a medias nunca borra el teléfono ni desactiva a un
  docente por accidente. La ficha docente (`TeacherDetail.svelte`) edita
  con él Nombres, Apellidos, Cédula, Celular, Correo y Sexo.
- `GET /v1/warnings/recent` devuelve cada llamado con `StudentName`,
  `ClassLabel` y `AuthorName` ya resueltos (ver `backend/docs/api.md`).
  La pantalla `/admin/llamados` los muestra con filtros y crea llamados
  con `POST /v1/warnings/batch`, el mismo endpoint del docente.
- `GET /v1/me` devuelve además el perfil personal de la cuenta:
  `username`, `email`, `active`, `createdAt`, `teacherID` y `teacher`
  opcional (`names`, `surnames`, `documentID`, `phone`, `email`,
  `birthdate` ISO `YYYY-MM-DD`, `sex` `female|male|''`). Los campos de
  cuenta son opcionales en `types.ts` para degradar honesto contra un
  backend anterior. `lib/shell/profile.ts` lo consume en el panel de
  perfil (`lib/shell/ProfilePanel.svelte`), abierto desde `TopActions`.
- `GET/PUT /v1/teachers/me/photo` son el gemelo auto-servido de las
  fotos de docente: resuelven por el vínculo `users.TeacherID` (o por el
  subject si ya es un id de docente), 404 honesto sin foto y `403` sin
  perfil propio. El PUT acepta data URL o base64 y vacío para quitar.
- `GET/PUT /v1/me/photo` (`lib/shell/profile.ts`, panel de perfil) es la
  foto unificada de la llamada: si hay docente vinculado resuelve y
  escribe en su ficha (`teachers.photo`, fuente única); si no, guarda la
  imagen en la propia cuenta (`users.photo`). Por eso admins ya pueden
  cambiar su foto desde el perfil. Cap 2 MiB y `data` vacío para quitar,
  404 honesto sin foto. Estudiantes siguen pendientes: el backend no
  tiene todavía el vínculo `users.StudentID` con fichas de estudiantes.
- `PUT /v1/me/password` (`{'currentPassword','newPassword'}`, `204`)
  cambia la contraseña de la propia cuenta: el backend verifica la
  actual antes (`401` con `users.err_invalid_credentials` si falla) y la
  política de contraseña vive en el backend (`400` con
  `users.err_weak_password`). El panel de perfil abre el formulario con
  "Cambiar contraseña"; los tokens ya emitidos quedan vigentes hasta
  expirar: la rotación invalida por versión y revoca los refresh
  (`token_version` + `RevokeAllForUser`). Tras cambiar la clave, el panel
  cierra la sesión local y pide entrar de nuevo.

## Bloqueos para el dominio docente (documentados)

- `GET /v1/teachers/me/schedule` ya resuelve por el vínculo
  `users.TeacherID` (ver `docs/auth-backend.md`); el nombre del docente
  ya no está pendiente: `GET /v1/me` trae el perfil (`teacher.names`,
  `teacher.surnames`) y el panel de perfil lo muestra.
- `POST /v1/roles` ya existe (admin) y el alta de docente lo otorga
  (`role: 'teacher'` en `createUser`); el vínculo docente se crea con
  `teacherID` en el mismo llamado.

## Autenticación

Login real: `POST /v1/login {identifier, password}` verifica bcrypt en
el servidor y devuelve `{token, expiresAt, refreshToken,
refreshExpiresAt, subject, roles, home}`. El cliente guarda el par
(`grado.token` + `grado.refresh`, más cookie HttpOnly cuando aplica) y
envía `Authorization: Bearer`. `session.ts` rota proactivo (~80% TTL) y
`guarded()` reintenta una vez ante 401; si la sesión murió (revocado,
deshabilitado, rotado), limpia y va a `/login` con aviso. Logout avisa a
`POST /v1/logout` best-effort. Throttle 429 con cuenta regresiva en los
formularios; recuperación en `/recuperar` y `/recuperar/:token`.
Detalle en `docs/auth-backend.md`; lo pendiente vive en
`spec/BACKLOG.md`.
