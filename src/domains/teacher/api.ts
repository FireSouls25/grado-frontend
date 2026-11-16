import { api } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import type { Me, RosterEntry, Session, Warning } from '$lib/api/types';

// Endpoints that exist in the backend today.
export async function me(): Promise<Me> {
  return api.get<Me>('/v1/me');
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  /** Transitional JSON copy; the HttpOnly cookie is authoritative. */
  refreshToken?: string;
  refreshExpiresAt?: string;
  subject: string;
  roles: string[];
  home: string;
}

/** Real login: credentials travel to the backend, which verifies the
 *  bcrypt hash server-side and returns a bearer for later calls.
 *  Unknown identifier and wrong password share one 401 code. */
export async function login(identifier: string, password: string): Promise<LoginResult> {
  return api.post<LoginResult>('/v1/login', { identifier, password });
}

/** Password recovery request: always 204, even for unknown identifiers
 *  (no enumeration). Throttled per IP (429). */
export async function requestRecovery(identifier: string): Promise<void> {
  await api.post('/v1/recover/request', { identifier });
}

/** Consumes a single-use reset token and sets the new password.
 *  Invalid/expired/reused tokens share 401; weak passwords answer 400. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post('/v1/recover/reset', { token, newPassword });
}

/** Names the account behind a reset token without consuming it.
 *  Unknown/expired tokens share 401. */
export async function verifyResetToken(token: string): Promise<{ username: string; email: string }> {
  return api.get<{ username: string; email: string }>(
    `/v1/recover/verify?token=${encodeURIComponent(token)}`
  );
}

/** Global mail capability: false means reset links never leave the
 *  server (log-only dev), so the UI must warn instead of promising. */
export async function mailCapability(): Promise<boolean> {
  const h = await api.get<{ status?: string; recoveryMail?: boolean }>('/healthz');
  return h?.recoveryMail === true;
}

/** True when the backend has no such route yet (draft phase). Callers
 *  render honest empty states instead of error screens. */
export function isMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

// --- Pending backend endpoints (próxima fase) ---------------------------
// These fail soft: callers treat any error as "no data yet" and render
// honest empty states. They light up automatically once the backend
// exposes them. No fake data is ever invented here.

export interface TeacherClass {
  GroupID: string;
  /** Alias corto para las URLs; el UUID sigue siendo la identidad. */
  GroupSlug?: string;
  ClassLabel: string;
  SubjectID: string;
  SubjectName: string;
  Weekday: number;
  Start: string;
  End: string;
  /** Salón físico. Opcional: el endpoint actual aún no lo trae y la
   *  tarjeta lo omite en vez de inventarlo. */
  Room?: string;
}

/** Self-service update of the caller's own teacher ficha: contact and
 * health fields only. Identity, homeroom and active state travel through
 * the admin endpoint and answer 400 here. */
export interface MyTeacherUpdate {
  Phone?: string;
  Address?: string;
  Birthplace?: string;
  /** ISO date (YYYY-MM-DD). */
  Birthdate?: string;
  Email?: string;
  Sex?: string;
  MedicalConditions?: string;
}

export async function updateMyTeacher(changes: MyTeacherUpdate): Promise<void> {
  // El input de fecha entrega AAAA-MM-DD; el API guarda instantes RFC 3339
  // (igual que la ficha del estudiante).
  const body = { ...changes };
  if (body.Birthdate && /^\d{4}-\d{2}-\d{2}$/.test(body.Birthdate)) body.Birthdate = `${body.Birthdate}T00:00:00Z`;
  await api.put('/v1/teachers/me', body);
}

/** Weekly schedule entries for a weekday. Pending: GET /v1/teachers/me/schedule. */
export async function daySchedule(weekday: number): Promise<TeacherClass[]> {
  return (await api.get<TeacherClass[]>(`/v1/teachers/me/schedule?weekday=${weekday}`)) ?? [];
}

export async function classRoster(groupID: string): Promise<RosterEntry[]> {
  return (
    (await api.get<RosterEntry[]>(`/v1/classes/${encodeURIComponent(groupID)}/roster`)) ?? []
  );
}

// Open returns the flat session (the backend answers the created row,
// not the detail envelope): callers needing marks fetch the detail.
// Period/slot disambiguate back-to-back blocks of the same salon on the
// same day; omitted period means the single (or first) block.
export async function openSession(groupID: string, period?: number, subjectID?: string): Promise<Session> {
  return api.post<Session>('/v1/sessions/open', {
    classGroupID: groupID,
    ...(period ? { period } : {}),
    ...(subjectID ? { subjectID } : {})
  });
}

/** Bloque crudo de horario tal como lo devuelve el backend: la clase y la
 *  materia son ids, la hora son minutos desde la medianoche (420 = 07:00).
 *  Las etiquetas legibles se resuelven aparte con los catálogos reales. */
export interface ScheduleEntry {
  ID: string;
  ClassGroupID: string;
  TeacherID: string;
  SubjectID: string;
  Weekday: number;
  Start: number; // minutes since midnight
  End: number;
}

/** Weekly schedule entries for a weekday (real backend shape). */
export async function dayScheduleOn(weekday: number): Promise<ScheduleEntry[]> {
  return (await api.get<ScheduleEntry[]>(`/v1/teachers/me/schedule?weekday=${weekday}`)) ?? [];
}

export interface ClassGroupRow {
  ID: string;
  Grade: number;
  GroupNo: number;
}

/** Catálogo de salones del año; el docente lo puede leer (view-class-stats). */
export async function listClasses(year: number): Promise<ClassGroupRow[]> {
  return (await api.get<ClassGroupRow[]>(`/v1/classes?year=${year}`)) ?? [];
}

export interface SubjectRow {
  ID: string;
  Name: string;
}

/** Catálogo de materias; el docente lo puede leer (view-class-stats). */
export async function listSubjects(): Promise<SubjectRow[]> {
  return (await api.get<SubjectRow[]>('/v1/subjects')) ?? [];
}

export async function recordMark(
  sessionID: string,
  studentID: string,
  mark: string,
  note: string
): Promise<unknown> {
  return api.post(`/v1/sessions/${encodeURIComponent(sessionID)}/marks`, {
    studentID,
    mark,
    note
  });
}

/** Today's roll calls of one salon, newest first. */
export async function todaySessions(groupID: string, day: string): Promise<{ ID: string; Period: number }[]> {
  const q = `classGroupID=${encodeURIComponent(groupID)}&from=${encodeURIComponent(day)}&to=${encodeURIComponent(day)}`;
  return (await api.get<{ ID: string; Period: number }[]>(`/v1/sessions/history?${q}`)) ?? [];
}

/** Explicit uniform states of one roll call (missing = proper). */
export async function sessionUniform(id: string): Promise<Record<string, boolean> | null> {
  const r = await api.get<{ Uniform?: Record<string, boolean> }>(`/v1/sessions/${encodeURIComponent(id)}`);
  return r?.Uniform ?? null;
}

// --- Permisos previos y listas omitidas -----------------------------------
// El permiso previo lo concede secretaría/administración antes de la
// clase. La lista lo pinta bloqueado: no se puede marcar presente ni
// falta porque el permiso manda.

export interface PriorPermit {
  ID: string;
  StudentID: string;
  StudentName: string;
  ClassGroupID: string;
  ClassLabel: string;
  SubjectID: string;
  SubjectName: string;
  /** Día cubierto (YYYY-MM-DD). */
  Date: string;
  Reason: string;
  CreatedBy: string;
  CreatedByName: string;
  CreatedAt: string;
}

/** Permisos previos de un salón para un día concreto. */
export async function groupPermits(groupID: string, day: string): Promise<PriorPermit[]> {
  const q = `classGroupID=${encodeURIComponent(groupID)}&date=${encodeURIComponent(day)}`;
  return (await api.get<PriorPermit[]>(`/v1/attendance/permits?${q}`)) ?? [];
}

/** Bloque de horario cuya clase ya terminó sin llamado a lista. */
export interface OmittedClass {
  ScheduleEntryID: string;
  ClassGroupID: string;
  GroupSlug: string;
  ClassLabel: string;
  SubjectID: string;
  SubjectName: string;
  Weekday: number;
  Start: string;
  End: string;
  Omitted: boolean;
}

/** Bloques del docente que ya pasaron sin llamado, para un día. */
export async function omittedRollcalls(day: string): Promise<OmittedClass[]> {
  return (
    (await api.get<OmittedClass[]>(`/v1/attendance/omitted?date=${encodeURIComponent(day)}`)) ?? []
  );
}


/** Current marks of one roll call, by student. */
export async function sessionMarks(id: string): Promise<Record<string, string> | null> {
  const r = await api.get<{ Marks?: Record<string, string> }>(`/v1/sessions/${encodeURIComponent(id)}`);
  return r?.Marks ?? null;
}

// The backend builds its own snapshots from the current profiles and
// rejects unknown fields, so the draft carries only the event itself.
export interface WarningDraft {
  studentIDs: string[];
  classID: string;
  title: string;
  gravity: 'mild' | 'moderate' | 'severe';
  description: string;
}

export interface StudentIncident {
  ID: string;
  Title: string;
  HappenedAt: string;
  Severity: string;
}

/** Records one student's uniform state (true = proper). Only changes
 *  travel; missing students count as proper uniform. */
export async function recordUniform(sessionID: string, studentID: string, ok: boolean): Promise<unknown> {
  return api.post(`/v1/sessions/${encodeURIComponent(sessionID)}/uniform`, {
    studentID,
    ok
  });
}

/** The student's own fault history (same readers as warnings). */
export async function studentIncidents(id: string): Promise<StudentIncident[]> {
  return (await api.get<StudentIncident[]>(`/v1/students/${encodeURIComponent(id)}/incidents`)) ?? [];
}

export interface AcademicAlertInput {
  studentIDs: string[];
  reason: string;
}

export interface AcademicAlert {
  ID: string;
  StudentID: string;
  TeacherID: string;
  Reason: string;
  Status: 'open' | 'reviewed';
  CreatedAt: string;
  ReviewedAt: string;
  ReviewedBy: string;
}

/** Raises one academic alert per student for admin review. */
export async function raiseAcademicAlerts(input: AcademicAlertInput): Promise<AcademicAlert[]> {
  return (await api.post<AcademicAlert[]>('/v1/academic-alerts', input)) ?? [];
}

export async function issueWarnings(draft: WarningDraft): Promise<Warning[]> {
  return (await api.post<Warning[]>('/v1/warnings/batch', draft)) ?? [];
}

// --- Llamados de atención con el catálogo del manual ---------------------
// Un llamado es una situación del manual contra uno o varios estudiantes
// de un salón. El servidor decide el tipo (1, 2 o 3) desde la situación;
// el título guarda el texto de la situación y la descripción la nota.

export interface SituationWarningDraft {
  classID: string;
  situationID: string;
  /** Texto de la situación del manual, tal como lo verá el resto. */
  title: string;
  note?: string;
  /** yyyy-mm-dd; hoy u omitido usa la hora actual del servidor. */
  date?: string;
  studentIDs: string[];
}

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function issueSituationWarnings(draft: SituationWarningDraft): Promise<Warning[]> {
  const body: Record<string, unknown> = {
    classID: draft.classID,
    situationID: draft.situationID,
    title: draft.title,
    description: (draft.note ?? '').trim(),
    studentIDs: draft.studentIDs
  };
  // Un día pasado se fija al mediodía de Colombia; hoy usa la hora real.
  if (draft.date && draft.date !== localToday()) body.happenedAt = `${draft.date}T12:00:00-05:00`;
  return (await api.post<Warning[]>('/v1/warnings/batch', body)) ?? [];
}

/** Llamados registrados por quien consulta, del más reciente al más antiguo. */
export interface MyWarning extends Warning {
  StudentSlug?: string;
}

/** Descargo del estudiante sobre un llamado; texto vacío lo borra. */
export async function defendWarning(id: string, text: string): Promise<Warning> {
  return api.post<Warning>(`/v1/warnings/${encodeURIComponent(id)}/defense`, { text });
}

export async function myWarnings(): Promise<MyWarning[]> {
  return (await api.get<MyWarning[]>('/v1/warnings/mine')) ?? [];
}

// --- Observaciones de convivencia -----------------------------------------
// El catálogo es fijo del backend (ids estables s1-01..s3-08); el tipo de
// cada situación lo decide siempre el servidor y el texto vive en el i18n.

export interface Situation {
  ID: string;
  Kind: 1 | 2 | 3;
}

export async function getObservationCatalog(): Promise<Situation[]> {
  return (await api.get<Situation[]>('/v1/observations/catalog')) ?? [];
}

