import { api } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import type { Me, RosterEntry, SessionDetail, Warning } from '$lib/api/types';

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
  await api.put('/v1/teachers/me', changes);
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

export async function openSession(groupID: string): Promise<SessionDetail> {
  return api.post<SessionDetail>('/v1/sessions/open', { classGroupID: groupID });
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

export interface WarningDraft {
  studentIDs: string[];
  classID: string;
  title: string;
  gravity: 'mild' | 'moderate' | 'severe';
  description: string;
  snapshots: Record<string, WarningSnapshot>;
}

export interface WarningSnapshot {
  names: string;
  surnames: string;
  documentID: string;
  classID: string;
}

export interface StudentIncident {
  ID: string;
  Title: string;
  HappenedAt: string;
  Severity: string;
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
