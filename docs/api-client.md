# API client

`src/lib/api/client.ts` + `types.ts`, por dominio en `domains/*/api.ts`.

## Reglas

- Base `VITE_API_URL`; secretos y entorno solo en `.env` (gitignoreado).
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
