import { api } from '$lib/api/client';
import type { Me, StudentProfile, Warning } from '$lib/api/types';

// Endpoints that exist in the backend today.
export async function me(): Promise<Me> {
  return api.get<Me>('/v1/me');
}

// --- Pending backend endpoints (próxima fase) ---------------------------
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
  Active: boolean;
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

export async function teachers(): Promise<TeacherSummary[]> {
  return api.get<TeacherSummary[]>('/v1/teachers');
}

export async function teacherDetail(id: string): Promise<TeacherDetail> {
  return api.get<TeacherDetail>(`/v1/teachers/${encodeURIComponent(id)}`);
}

export async function subjects(): Promise<Subject[]> {
  return api.get<Subject[]>('/v1/subjects');
}

export async function assignSubject(teacherID: string, subjectID: string): Promise<unknown> {
  return api.post('/v1/assignments', { teacherID, subjectID });
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
  return api.get<StudentProfile>(`/v1/students/${encodeURIComponent(id)}`);
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
  return api.get<Warning[]>(`/v1/students/${encodeURIComponent(id)}/warnings`);
}

/** Audit trail access: who read or wrote student data (admin only). */
export async function auditRecent(limit = 50): Promise<AuditEntry[]> {
  return api.get<AuditEntry[]>(`/v1/audit?limit=${limit}`);
}

export async function auditForStudent(studentID: string): Promise<AuditEntry[]> {
  return api.get<AuditEntry[]>(`/v1/audit?studentID=${encodeURIComponent(studentID)}`);
}

export interface AuditEntry {
  ID: string;
  SubjectID: string;
  Action: 'read' | 'create' | 'update' | 'mark';
  Resource: 'student' | 'warning' | 'session' | 'report';
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
  const raw = await api.get<RawGroup[]>(`/v1/classes?year=${year}`);
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

export async function classReport(groupID: string): Promise<ClassReport> {
  return api.get<ClassReport>(`/v1/statistics/class/${encodeURIComponent(groupID)}`);
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
export async function studentReport(studentID: string): Promise<StudentReport> {
  return api.get<StudentReport>(`/v1/statistics/student/${encodeURIComponent(studentID)}`);
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
  return api.get<RecentWarning[]>(`/v1/warnings/recent?limit=${limit}`);
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
  return api.get<RecentIncident[]>(`/v1/incidents/recent?limit=${limit}`);
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
  return api.get<DashboardSummary>(`/v1/dashboard/summary?year=${year}`);
}
