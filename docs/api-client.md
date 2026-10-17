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
  fetch con `X-Subject-ID` mueren en preflight y todo se ve como error de
  red. En Tauri el origen será el del webview (`tauri.localhost`).
- Identidad: header `X-Subject-ID` desde la sesión (login la guarda,
  `VITE_DEV_SUBJECT_ID` solo para desarrollo).
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
`GET /v1/students/{id}`, `GET /v1/students/{id}/warnings`,
`POST /v1/warnings/batch`, `GET /v1/warnings/recent`,
`GET /v1/incidents/recent`, `GET /v1/classes?year=N`,
`GET /v1/classes/{groupID}/roster`, `GET /v1/teachers/me/schedule`,
`POST /v1/sessions/open`, `GET /v1/dashboard/summary`, `POST /v1/users`,
`GET /v1/audit`, `POST /v1/classes`.

Notas de los endpoints de edición:

- `PUT /v1/students/{id}` **reemplaza** el perfil completo (el estado lo
  administra el servidor). El frontend envía la ficha tal como la cargó,
  con los campos editados.
- `PUT /v1/teachers/{id}` es **parcial**: lo que no se envía se conserva,
  así un formulario a medias nunca borra el teléfono ni desactiva a un
  docente por accidente.

## Bloqueos para el dominio docente (documentados)

- `GET /v1/teachers/me/schedule` ya resuelve por el vínculo
  `users.TeacherID` (ver `docs/auth-backend.md`); el nombre del docente
  en la cabecera sigue pendiente del login real.
- Falta `POST /v1/login` (la capability `users` ya tiene `Authenticate`,
  pero no hay endpoint ni token). Ver `docs/auth-backend.md`.
- `POST /v1/roles` ya existe (admin) pero el frontend aún no lo invoca
  al crear un docente con cuenta.

## Autenticación

Hoy no hay login: la identidad es el header `X-Subject-ID` y la
contraseña solo se valida en el cliente (`domains/auth/accounts.ts`).
`docs/auth-backend.md` documenta el estado real de `users`, el flujo de
identidad actual (`BOOTSTRAP_ADMIN_*`, `SEED_*`, `POST /v1/roles`) y la
spec del login pendiente.
