# Agenda docente — pendientes backend (solo documentación, sin cambios)

La página `src/domains/teacher/Agenda.svelte` (`/agenda`, `/mi-agenda`,
`/docente`, `/hoy`) replica la referencia visual y hoy funciona con
respaldo local para Lun 18. En cuanto el backend exponga lo siguiente,
la agenda enciende sola (ver `domains/teacher/api.ts`, `isMissing()`).

No se tocó `school-backend/` por pedido explícito en esta fase; la fase
posterior del perfil sí lo extendió en la rama `dev/perfil` (worktree
`school-backend-perfil`), ver §2.

## 1. Horario con salón, grado y estado

Actual: `GET /v1/teachers/me/schedule?weekday=N` está pendiente y el tipo
`TeacherClass` solo trae `GroupID, ClassLabel, SubjectID, SubjectName,
Weekday, Start, End`.

Para la imagen hace falta (propuesta, sin romper lo existente):

```json
{
  "GroupID": "uuid-salón",
  "ClassLabel": "10°A",
  "SubjectID": "uuid-materia",
  "SubjectName": "Matemáticas",
  "Weekday": 1,
  "Start": "07:00",
  "End": "08:30",
  "Room": "201",
  "Grade": "10°A",
  "Status": "pending | done"
}
```

- `Room`: salón físico (201, 304, 102, 202 en la maqueta).
- `Grade`: grado + grupo para `Grado: 10°A`.
- `Status`: `done` → chip verde `Finalizado`, `pending` → chip amarillo
  `Pendiente`. Hoy el frontend deriva `doneCount` de este campo para la
  tarjeta `Registradas 1 de 4`.
- Fuente natural: componer `schedules.EntriesForTeacherOnDay` +
  `classes` (label) + `sessions.SessionsForTeacher` del día para marcar
  `done` cuando ya existe llamado.

## 2. Perfil docente para el encabezado

**Resuelto en la fase de perfil.** `GET /v1/me` ahora devuelve, además
de `{ subject, roles, home }`, el perfil de la cuenta: `username`,
`email`, `active`, `createdAt`, `teacherID` y `teacher` opcional con
`names`, `surnames`, `documentID`, `phone`, `email`, `birthdate`
(`YYYY-MM-DD`) y `sex` (`female|male|''`). La foto propia se sirve con
`GET/PUT /v1/teachers/me/photo` (auto-servido, por el vínculo
`users.TeacherID`).

El panel `lib/shell/ProfilePanel.svelte` (botón de usuario en
`TopActions`, la misma fila de tema y ajustes) consume todo esto vía
`lib/shell/profile.ts`. El encabezado ya no necesita hardcodear el
nombre: puede leerlo de `$profile.me.teacher`.

## 3. Buscador `Buscar estudiante o clase…`

Propuesta mínima (fase siguiente):

- `GET /v1/teachers/me/search?q=` → `{ students[], classes[] }`
  o reutilizar `GET /v1/classes/{groupID}/roster` + filtrado cliente
  (como hace hoy `Agenda.svelte`).
- Nada urgente: el filtro cliente ya cumple la maqueta.

## 4. Navegación post-login

- El backend devuelve `home: "/docente"` para rol docente
  (`src/platform/http/handlers.go:homeFor`). El frontend ahora mapea
  `/docente` y `/hoy` a `Agenda.svelte`, así el login existente cae
  directo en `Agenda de Clases` sin cambiar backend.
- `Abrir Clase` navega a `/clase/:groupID?materia=...` (nuevo
  `ClassDetail.svelte` = Control de Asistencia de la imagen).

## 5. Control de Asistencia (`/clase/:groupID`)

Reescritura visual tal cual la referencia, sin tocar backend:

- Lee `params.groupID` + `?materia=` para resolver materia/grupo/salón/
  horario demo (`fisica → Física 11°B · 304 · 08:45-10:15`, etc.).
- Nómina: intenta `GET /v1/classes/{groupID}/roster` (ordenada por
  apellido); si 404 o vacía usa la nómina demo de la imagen
  (#10024…#10301, 5 presentes + 2 ausentes iniciales).
- Guardar: `POST /v1/sessions/open` + `POST /v1/sessions/{id}/marks`
  (`mark ""` = presente, `"absence"` = ausente); si el backend está
  apagado conserva el estado local y muestra `Asistencia guardada.`
- `Llamado de Atención Colectivo` navega a `/llamado/:groupID`
  (página de registro, §6) en vez del Sheet anterior.
- Pendiente backend útil: `GET /v1/sessions/today?groupID=` con el
  conteo presente/ausente para pintar la barra sin recalcular en
  cliente, y `GET /v1/classes/{id}` con `room`, `grade`, `subjectDesc`,
  `dateLabel` para no depender del mapa demo.

## 6. Registrar Llamado de Atención (`/llamado/:groupID`)

Nueva página `src/domains/teacher/WarningNew.svelte`, tal cual la
referencia, sin tocar backend:

- Flujo: Agenda → `Abrir Clase` → `/clase/:groupID` → botón
  `Llamado de Atención Colectivo` → `/llamado/:groupID?materia=...`.
  `Cancelar` / `Volver al detalle` regresan al detalle preservando
  `?materia=`.
- Campos: título (select con 4 opciones), estudiante (select desde
  `GET /v1/classes/{groupID}/roster` o nómina demo 11°B), severidad
  segmentada Leve/Medio/Grave, descripción con texto demo de la imagen.
- Guardar usa `POST /v1/warnings/batch` con snapshot del estudiante;
  si el backend está apagado (404) muestra el éxito demo.
- Pendiente backend útil: `GET /v1/warnings/titles` (catálogo de
  títulos configurables por el colegio en vez del fijo del frontend),
  `gravity` como enum validado (`mild/moderate/severe`) y respuesta del
   batch con el `ID` creado para enlazar al historial.

## 7. Contratos a no romper

- Nombres de campos capitalizados Go (`GroupID`, `SubjectName`, …).
- `401 → /login`, `403 → atrás o home` (`lib/nav.ts:guarded()`).
- `404` de chi = backend pendiente → vacío honesto, nunca bucle de error.
- Colores solo vía `var(--*)` (`styles/global.css`), textos vía `t`
  (`lib/i18n/es.ts:agenda`).
