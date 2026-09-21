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

- `GET /v1/teachers/me/schedule?weekday=N` — clases del día
- `GET /v1/classes/{groupID}/roster` — nómina del salón
- `POST /v1/sessions/open` — abrir llamado a lista
- `POST /v1/warnings/batch` — lote de llamados (existe `POST
  /v1/sessions/{id}/marks` y ya se usa para marcar)
