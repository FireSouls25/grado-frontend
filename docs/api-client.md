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

Estos endpoints son los que el frontend ya llama y el backend aún no
expone; fallan suave a vacíos honestos (`isMissing()`) y se encienden
solos cuando existan:

- `GET /v1/teachers/me/schedule?weekday=N` — clases del día
- `GET /v1/classes/{groupID}/roster` — nómina del salón
- `POST /v1/sessions/open` — abrir llamado a lista
- `POST /v1/warnings/batch` — lote de llamados
- `GET /v1/subjects` y `POST /v1/assignments` — catálogo/asignación de
  materias (usados por la ficha docente)
- `GET /v1/classes?year=N` — salones por año (lo usa el dominio admin)
- `GET /v1/warnings/recent`, `GET /v1/incidents/recent`,
  `GET /v1/dashboard/summary` — agregados del panel
- `POST /v1/users` — alta de cuenta (la tabla `users` ya existe; falta
  el endpoint). El frontend ya tolera su ausencia como "cuenta pendiente"

Ya existen y el frontend los usa: `GET /v1/me`, `GET /v1/teachers`,
`GET /v1/teachers/{id}`, `POST /v1/students`, `POST /v1/teachers`,
`POST /v1/sessions/{id}/marks`,
`GET /v1/statistics/class/{groupID}`.

## Bloqueos para el dominio docente (documentados)

- Falta el vínculo `users.User` ↔ `Teacher.ID`: sin él no hay
  `GET /v1/teachers/me/schedule` ni nombre del docente.
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
