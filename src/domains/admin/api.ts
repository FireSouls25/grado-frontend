import { api } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import type { Me, StudentProfile, Warning } from '$lib/api/types';

// Endpoints that exist in the backend today.
export async function me(): Promise<Me> {
  return api.get<Me>('/v1/me');
}

/** Un cuerpo `null` con 200 equivale a 404: el recurso no existe.
 *  Así los llamados pintan "no encontrado" en vez de colgarse. */
function missing(resource: string): ApiError {
  return new ApiError(404, { error: { code: 'http.err_not_found', message: `${resource} no encontrado.` } });
}

// --- Pending backend endpoints (próxima fase) ---------------------------
// Same honesty rule as the teacher domain: any error means "no data yet".
// Same honesty rule as the teacher domain: any error means "no data yet".

export interface TeacherSummary {
  ID: string;
  Names: string;
  Surnames: string;
  DocumentID: string;
  Active: boolean;
  HomeroomClassID: string;
}

export interface Subject {
  ID: string;
  Name: string;
  Code: string;
  Description: string;
  Grades: number[];
  Color: string;
  Active: boolean;
}

export interface SubjectAssignment {
  ID: string;
  TeacherID: string;
  SubjectID: string;
  StartedAt: string;
  EndedAt: string;
}

/** Catalog ordered alphabetically. Teachers read it to name agenda items. */
export async function listSubjects(): Promise<Subject[]> {
  return (await api.get<Subject[]>('/v1/subjects')) ?? [];
}

/** One catalog entry. */
export async function subjectDetail(id: string): Promise<Subject> {
  const s = await api.get<Subject>(`/v1/subjects/${encodeURIComponent(id)}`);
  if (!s) throw missing('Materia');
  return { ...s, Grades: s.Grades ?? [] };
}

export interface SubjectInput {
  Name: string;
  Code: string;
  Description: string;
  Grades: number[];
  Color: string;
}

/** Creates a catalog entry. The service assigns the ID and forces active. */
export async function createSubject(input: SubjectInput): Promise<Subject> {
  return api.post<Subject>('/v1/subjects', input);
}

/** Replaces a catalog entry, including Active (retire = active false). */
export async function updateSubject(id: string, input: SubjectInput & { Active: boolean }): Promise<Subject> {
  return api.put<Subject>(`/v1/subjects/${encodeURIComponent(id)}`, input);
}

/** Deletes a catalog entry. Blocked (400) while assignment history or
 *  schedule entries reference it — retire instead. */
export async function deleteSubject(id: string): Promise<void> {
  return api.del(`/v1/subjects/${encodeURIComponent(id)}`);
}

/** Who taught a subject and when: the timeline on the materia detail. */
export async function subjectAssignments(id: string): Promise<SubjectAssignment[]> {
  return (
    (await api.get<SubjectAssignment[]>(`/v1/subjects/${encodeURIComponent(id)}/assignments`)) ?? []
  );
}

/** A teacher's full assignment timeline: what the teacher ficha shows. */
export async function teacherAssignments(id: string): Promise<SubjectAssignment[]> {
  return (
    (await api.get<SubjectAssignment[]>(`/v1/teachers/${encodeURIComponent(id)}/assignments`)) ?? []
  );
}

/** Starts a timeline entry. startedAt is YYYY-MM-DD (defaults to today
 *  in the UI; the backend requires it). */
export async function assignSubject(
  teacherID: string,
  subjectID: string,
  startedAt: string
): Promise<SubjectAssignment> {
  return api.post<SubjectAssignment>('/v1/assignments', { teacherID, subjectID, startedAt });
}

/** Closes an open timeline entry at endedAt (YYYY-MM-DD). History kept. */
export async function endAssignment(id: string, endedAt: string): Promise<SubjectAssignment> {
  return api.post<SubjectAssignment>(`/v1/assignments/${encodeURIComponent(id)}/end`, { endedAt });
}

/** Deletes a timeline entry, for corrections only. */
export async function removeAssignment(id: string): Promise<void> {
  return api.del(`/v1/assignments/${encodeURIComponent(id)}`);
}

export interface ScheduleEntry {
  ID: string;
  ClassGroupID: string;
  TeacherID: string;
  SubjectID: string;
  Weekday: number;
  Start: number;
  End: number;
}

export interface ScheduleInput {
  classGroupID: string;
  teacherID: string;
  subjectID: string;
  weekday: number;
  start: string;
  end: string;
}

/** Weekly slots filtered by teacher and/or salon, optionally one weekday.
 *  At least one of teacherID/classGroupID is required (no full dump). */
export async function scheduleEntries(filter: {
  teacherID?: string;
  classGroupID?: string;
  weekday?: number;
}): Promise<ScheduleEntry[]> {
  const q = new URLSearchParams();
  if (filter.teacherID) q.set('teacherID', filter.teacherID);
  if (filter.classGroupID) q.set('classGroupID', filter.classGroupID);
  if (filter.weekday !== undefined) q.set('weekday', String(filter.weekday));
  return (await api.get<ScheduleEntry[]>(`/v1/schedule?${q.toString()}`)) ?? [];
}

/** Places one weekly slot. Overlaps, out-of-hours and untaught pairings
 *  fail with stable 400 codes the editor renders inline. */
export async function createEntry(input: ScheduleInput): Promise<ScheduleEntry> {
  return api.post<ScheduleEntry>('/v1/schedule', input);
}

/** Replaces one weekly slot, re-checking everything. */
export async function updateEntry(id: string, input: ScheduleInput): Promise<ScheduleEntry> {
  return api.put<ScheduleEntry>(`/v1/schedule/${encodeURIComponent(id)}`, input);
}

/** Removes one weekly slot. */
export async function deleteEntry(id: string): Promise<void> {
  return api.del(`/v1/schedule/${encodeURIComponent(id)}`);
}

export interface TeacherDetail extends TeacherSummary {
  Phone: string;
  Email: string;
  Subjects: { SubjectID: string; SubjectName: string; From: string }[];
  Groups: { GroupID: string; ClassLabel: string; SubjectName: string }[];
}

export interface YearGroup {
  GroupID: string;
  Grade: number;
  GroupNo: number;
  ClassLabel: string;
  SchoolYear: number;
  StudentCount?: number;
}

// Go serializa los slices vacíos como `null`: cada lista se normaliza aquí
// para que las pantallas nunca hagan `.map`/`.length` sobre null.
export async function teachers(): Promise<TeacherSummary[]> {
  return (await api.get<TeacherSummary[]>('/v1/teachers')) ?? [];
}

export async function teacherDetail(id: string): Promise<TeacherDetail> {
  const d = await api.get<TeacherDetail>(`/v1/teachers/${encodeURIComponent(id)}`);
  if (!d) throw missing('Docente');
  return { ...d, Subjects: d.Subjects ?? [], Groups: d.Groups ?? [] };
}

export async function subjects(): Promise<Subject[]> {
  return listSubjects();
}

export interface NewStudent {
  Names: string;
  Surnames: string;
  ClassID: string;
  DocumentID: string;
  Birthdate: string;
  Caregiver: { Names: string; Phone: string };
}

export interface NewTeacher {
  Names: string;
  Surnames: string;
  DocumentID: string;
  Phone: string;
  Email: string;
}

export async function createStudent(input: NewStudent): Promise<{ ID: string }> {
  // <input type="date"> yields YYYY-MM-DD; the API reads RFC 3339.
  // Empty means unknown: Go zero time, accepted by validation.
  const birthdate = input.Birthdate
    ? `${input.Birthdate}T00:00:00Z`
    : '0001-01-01T00:00:00Z';
  return api.post<{ ID: string }>('/v1/students', { ...input, Birthdate: birthdate });
}

/** Full profile of one student: 25 fields the class report never carries. */
export async function studentProfile(id: string): Promise<StudentProfile> {
  const p = await api.get<StudentProfile>(`/v1/students/${encodeURIComponent(id)}`);
  if (!p) throw missing('Estudiante');
  return p;
}

/** Replaces the student profile. The id comes from the path and the status
 *  is lifecycle-managed by the server, so it is never sent. */
export async function updateStudent(id: string, profile: StudentProfile): Promise<StudentProfile> {
  const { ID: _id, Status: _status, ...editable } = profile;
  return api.put<StudentProfile>(`/v1/students/${encodeURIComponent(id)}`, editable);
}

/** Partial teacher update: omitted fields keep their stored value. */
export async function updateTeacher(
  id: string,
  changes: Partial<TeacherSummary> & { Phone?: string; Email?: string }
): Promise<TeacherDetail> {
  return api.put<TeacherDetail>(`/v1/teachers/${encodeURIComponent(id)}`, changes);
}

/** The student's own warning history, with the frozen snapshot per entry. */
export async function studentWarnings(id: string): Promise<Warning[]> {
  return (await api.get<Warning[]>(`/v1/students/${encodeURIComponent(id)}/warnings`)) ?? [];
}

/** Audit trail access: who read or wrote student data (admin only). */
export async function auditRecent(limit = 50): Promise<AuditEntry[]> {
  return (await api.get<AuditEntry[]>(`/v1/audit?limit=${limit}`)) ?? [];
}

export async function auditForStudent(studentID: string): Promise<AuditEntry[]> {
  return (await api.get<AuditEntry[]>(`/v1/audit?studentID=${encodeURIComponent(studentID)}`)) ?? [];
}

export interface AuditEntry {
  ID: string;
  SubjectID: string;
  Action: 'read' | 'create' | 'update' | 'delete' | 'mark';
  Resource: 'student' | 'warning' | 'session' | 'report' | 'schedule' | 'subject' | 'assignment';
  ResourceID: string;
  Status: number;
  HappenedAt: string;
}

export async function createTeacher(input: NewTeacher): Promise<{ ID: string }> {
  return api.post<{ ID: string }>('/v1/teachers', input);
}

export interface NewUser {
  username: string;
  email: string;
  password: string;
  role: string;
}

export interface UserAccount {
  ID: string;
  Username: string;
  Email: string;
  Active: boolean;
  Roles: string[];
}

// Creates a login account (admin only). Teachers never self-register:
// the admin sets their initial password here. Optionally grants a role
// in the same call (e.g. "teacher").
export async function createUser(input: NewUser): Promise<UserAccount> {
  return api.post<UserAccount>('/v1/users', input);
}

interface RawGroup {
  ID: string;
  SchoolYearID: string;
  Grade: number;
  GroupNo: number;
}

export async function groupsByYear(year: number): Promise<YearGroup[]> {
  const raw = (await api.get<RawGroup[]>(`/v1/classes?year=${year}`)) ?? [];
  return raw.map((g) => ({
    GroupID: g.ID,
    Grade: g.Grade,
    GroupNo: g.GroupNo,
    ClassLabel: `${g.Grade}-${g.GroupNo}`,
    SchoolYear: year
  }));
}

export interface ClassReport {
  ClassGroupID: string;
  Sessions: number;
  Students: {
    StudentID: string;
    Names: string;
    Surnames: string;
    Sessions: number;
    Presences: number;
    Absences: number;
    Evasions: number;
    Lates: number;
  }[];
  Totals: { Sessions: number; Presences: number; Absences: number; Evasions: number; Lates: number };
}

const EMPTY_TOTALS = { Sessions: 0, Presences: 0, Absences: 0, Evasions: 0, Lates: 0 };

export async function classReport(groupID: string): Promise<ClassReport> {
  const r = await api.get<ClassReport>(`/v1/statistics/class/${encodeURIComponent(groupID)}`);
  if (!r) return { ClassGroupID: groupID, Sessions: 0, Students: [], Totals: { ...EMPTY_TOTALS } };
  return { ...r, Students: r.Students ?? [], Totals: r.Totals ?? { ...EMPTY_TOTALS } };
}

export interface StudentSessionEntry {
  SessionID: string;
  Date: string;
  ClassLabel: string;
  SchoolYear: number;
  Period: number;
  Mark: string;
}

export interface StudentReport {
  StudentID: string;
  Sessions: StudentSessionEntry[];
  Presences: number;
  Absences: number;
  Evasions: number;
  Lates: number;
  WarningsMild: number;
  WarningsModerate: number;
  WarningsSevere: number;
  FaultsMinor: number;
  FaultsOrdinary: number;
  FaultsSevere: number;
}

// Full cross-year report of one student (admin-only in the backend).
// 404 today means "no data yet": callers paint an honest empty.
export async function studentReport(studentID: string): Promise<StudentReport | null> {
  const r = await api.get<StudentReport>(`/v1/statistics/student/${encodeURIComponent(studentID)}`);
  if (!r) return null;
  return { ...r, Sessions: r.Sessions ?? [] };
}

export interface RecentWarning {
  ID: string;
  StudentID: string;
  ClassID: string;
  TeacherID: string;
  HappenedAt: string;
  Gravity: 'mild' | 'moderate' | 'severe';
  Title: string;
  Description: string;
  GroupID: string;
}

// Latest llamados. No such route in the backend yet: callers treat
// isMissing as an honest empty, never as an error screen.
export async function warningsRecent(limit = 20): Promise<RecentWarning[]> {
  return (await api.get<RecentWarning[]>(`/v1/warnings/recent?limit=${limit}`)) ?? [];
}

export interface RecentIncident {
  ID: string;
  Title: string;
  HappenedAt: string;
  Severity: string;
}

// Latest fault/incident records. Pending backend contract: same
// honest-empty rule as warningsRecent.
export async function incidentsRecent(limit = 20): Promise<RecentIncident[]> {
  return (await api.get<RecentIncident[]>(`/v1/incidents/recent?limit=${limit}`)) ?? [];
}

export interface DashboardSummary {
  Year: number;
  Totals: { Teachers: number; Students: number; Groups: number };
  GroupsTruncated: boolean;
  WarningsLast7d: { Mild: number; Moderate: number; Severe: number };
  MarksLast7d: { Presences: number; Absences: number; Evasions: number; Lates: number };
  TopRisk: {
    StudentID: string;
    Names: string;
    Surnames: string;
    Sessions: number;
    Presences: number;
    Absences: number;
    Evasions: number;
    Lates: number;
  }[];
  RecentWarnings: RecentWarning[];
}

// Agregado real del backend (`?year=` obligatorio). Todo campo puede
// venir vacío: la consola pinta vacíos honestos, nunca ceros falsos.
export async function dashboardSummary(year: number): Promise<DashboardSummary> {
  const d = await api.get<DashboardSummary>(`/v1/dashboard/summary?year=${year}`);
  if (!d) throw missing('Resumen');
  return {
    ...d,
    MarksLast7d: d.MarksLast7d ?? { Presences: 0, Absences: 0, Evasions: 0, Lates: 0 },
    WarningsLast7d: d.WarningsLast7d ?? { Mild: 0, Moderate: 0, Severe: 0 },
    TopRisk: d.TopRisk ?? [],
    RecentWarnings: d.RecentWarnings ?? []
  };
}
