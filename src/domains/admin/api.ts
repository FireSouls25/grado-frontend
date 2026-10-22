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

export type TeacherMarkStatus = 'present' | 'absent' | 'late';

export interface TeacherDayMark {
  TeacherID: string;
  TeacherName: string;
  Day: string;
  Status: TeacherMarkStatus;
  Note: string;
}

/** Day roll of teachers with display names, newest... in teacher order. */
export async function teacherDay(date: string): Promise<TeacherDayMark[]> {
  return (await api.get<TeacherDayMark[]>(`/v1/teachers/attendance?date=${encodeURIComponent(date)}`)) ?? [];
}

export interface TeacherHistoryMark {
  TeacherID: string;
  Day: string;
  Status: TeacherMarkStatus;
  Note: string;
  RecordedBy: string;
  RecordedAt: string;
}

export interface TeacherHistory {
  TeacherID: string;
  TeacherName: string;
  Marks: TeacherHistoryMark[];
  Summary: { Present: number; Absent: number; Late: number };
  Revisions: TeacherHistoryRevision[];
}

export interface TeacherHistoryRevision {
  TeacherID: string;
  Day: string;
  OldStatus: '' | TeacherMarkStatus;
  NewStatus: TeacherMarkStatus;
  Note: string;
  RecordedBy: string;
  RecordedAt: string;
}

export async function teacherHistory(id: string, from?: string, to?: string): Promise<TeacherHistory | null> {
  const q = [`from=${encodeURIComponent(from ?? '')}`, `to=${encodeURIComponent(to ?? '')}`]
    .filter((p) => !p.endsWith('='))
    .join('&');
  const r = await api.get<TeacherHistory>(
    `/v1/teachers/${encodeURIComponent(id)}/attendance${q ? `?${q}` : ''}`
  );
  if (!r) return null;
  return { ...r, Marks: r.Marks ?? [], Summary: r.Summary ?? { Present: 0, Absent: 0, Late: 0 }, Revisions: r.Revisions ?? [] };
}

export interface TeacherDayInput {
  teacherID: string;
  status: TeacherMarkStatus | '';
  note?: string;
}

/** Records (or corrects) the whole day roll. Empty status means present. */
export async function recordTeacherDay(day: string, marks: TeacherDayInput[]): Promise<TeacherDayMark[]> {
  return (await api.post<TeacherDayMark[]>('/v1/teachers/attendance', { day, marks })) ?? [];
}

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
  Address: string;
  Birthplace: string;
  Birthdate: string;
  /** 'female' | 'male' | '' — opcional: un backend anterior no lo envía. */
  Sex?: string;
  MedicalConditions: string;
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
  /** 'female' | 'male' | '' (no declarado). */
  Sex: string;
}

export async function createStudent(input: NewStudent): Promise<{ ID: string }> {
  // <input type="date"> yields YYYY-MM-DD; the API reads RFC 3339.
  // Empty means unknown: Go zero time, accepted by validation.
  const birthdate = input.Birthdate
    ? `${input.Birthdate}T00:00:00Z`
    : '0001-01-01T00:00:00Z';
  return api.post<{ ID: string }>('/v1/students', { ...input, Birthdate: birthdate });
}

export interface StudentPhoto {
  data: string;
  contentType: string;
}

/** Stored photo as a data URL, or null when the student has none. */
export async function studentPhoto(id: string): Promise<StudentPhoto | null> {
  try {
    return await api.get<StudentPhoto>(`/v1/students/${encodeURIComponent(id)}/photo`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Stores (or clears, when empty) the student photo. */
export async function uploadPhoto(id: string, data: string): Promise<void> {
  await api.put(`/v1/students/${encodeURIComponent(id)}/photo`, { data });
}

/** Stored teacher photo as a data URL, or null when none. */
export async function teacherPhoto(id: string): Promise<StudentPhoto | null> {
  try {
    return await api.get<StudentPhoto>(`/v1/teachers/${encodeURIComponent(id)}/photo`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Stores (or clears, when empty) the teacher photo. */
export async function uploadTeacherPhoto(id: string, data: string): Promise<void> {
  await api.put(`/v1/teachers/${encodeURIComponent(id)}/photo`, { data });
}

export interface TeacherSessionRow {
  ID: string;
  Date: string;
  ClassLabel: string;
  Period: number;
  Subject: string;
  Students: number;
  Absences: number;
}

/** Roll calls taken by one teacher, newest first. */
export async function teacherSessionsTaken(id: string): Promise<TeacherSessionRow[]> {
  return (await api.get<TeacherSessionRow[]>(`/v1/teachers/${encodeURIComponent(id)}/sessions`)) ?? [];
}

/** Llamados issued from the logins linked to one teacher, newest first. */
export async function teacherWarningsMade(id: string): Promise<RecentWarning[]> {
  return (await api.get<RecentWarning[]>(`/v1/teachers/${encodeURIComponent(id)}/warnings-made`)) ?? [];
}

export interface TeacherRollRow {
  TeacherID: string;
  TeacherName: string;
  Day: string;
  Status: '' | TeacherMarkStatus;
  Note: string;
  Recorded: boolean;
}

/** Teachers expected one day (from the weekly schedule) with their
 *  recorded marks, if any. Unmarked rows carry an empty status. */
export async function teacherRoll(date: string): Promise<TeacherRollRow[]> {
  return (await api.get<TeacherRollRow[]>(`/v1/teachers/roll?date=${encodeURIComponent(date)}`)) ?? [];
}

export interface TeacherDayCard {
  Day: string;
  Total: number;
  Present: number;
  Absent: number;
  Late: number;
}

export type TeacherDayStatus = '' | TeacherMarkStatus;

export interface ClassSessionCard {
  ID: string;
  Date: string;
  ClassLabel: string;
  Period: number;
  Subject: string;
  Teacher: string;
  Students: number;
  Present: number;
  Absent: number;
  Permission: number;
  Evasion: number;
  Late: number;
}

/** Roll calls of one salon in a range, newest first. */
export async function classSessionsHistory(
  groupID: string,
  from?: string,
  to?: string
): Promise<ClassSessionCard[]> {
  const q = [
    `classGroupID=${encodeURIComponent(groupID)}`,
    `from=${encodeURIComponent(from ?? '')}`,
    `to=${encodeURIComponent(to ?? '')}`
  ]
    .filter((p) => !p.endsWith('='))
    .join('&');
  return (await api.get<ClassSessionCard[]>(`/v1/sessions/history?${q}`)) ?? [];
}

export interface SessionRevisionRow {
  Student: string;
  From: string;
  To: string;
  Author: string;
  ChangedAt: string;
  Note: string;
}

export interface SessionDetailData {
  Session: {
    ID: string;
    Date: string;
    ClassLabel: string;
    Period: number;
    TeacherID: string;
    SubjectID: string;
    Roster: { StudentID: string; Names: string; Surnames: string; DocumentID: string }[];
  };
  Marks: Record<string, string>;
  Revisions: SessionRevisionRow[];
}

/** One roll call with current marks and the full revision trail. */
export async function sessionDetail(id: string): Promise<SessionDetailData | null> {
  const r = await api.get<SessionDetailData>(`/v1/sessions/${encodeURIComponent(id)}`);
  if (!r) return null;
  return { ...r, Revisions: r.Revisions ?? [] };
}

/** Corrects one student's mark inside a roll call (admins included). */
export async function recordSessionMark(
  sessionID: string,
  studentID: string,
  mark: '' | 'absence' | 'absence-permission' | 'evasion' | 'late',
  note: string
): Promise<void> {
  await api.post(`/v1/sessions/${encodeURIComponent(sessionID)}/marks`, {
    studentID,
    mark,
    note
  });
}

export interface TeacherDayRevision {
  TeacherID: string;
  TeacherName: string;
  Day: string;
  OldStatus: TeacherDayStatus;
  NewStatus: TeacherMarkStatus;
  Note: string;
  Author: string;
  RecordedAt: string;
}

/** Every change recorded on one day, newest first. */
export async function teacherDayRevisions(date: string): Promise<TeacherDayRevision[]> {
  return (await api.get<TeacherDayRevision[]>(`/v1/teachers/attendance/revisions?date=${encodeURIComponent(date)}`)) ?? [];
}

/** One card per recorded day, newest first. */
export async function teacherRollHistory(from?: string, to?: string): Promise<TeacherDayCard[]> {
  const q = [`from=${encodeURIComponent(from ?? '')}`, `to=${encodeURIComponent(to ?? '')}`]
    .filter((p) => !p.endsWith('='))
    .join('&');
  return (await api.get<TeacherDayCard[]>(`/v1/teachers/attendance/history${q ? `?${q}` : ''}`)) ?? [];
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
  Resource: 'student' | 'warning' | 'session' | 'report' | 'schedule' | 'subject' | 'assignment' | 'group';
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
export async function createUser(input: NewUser & { teacherID?: string }): Promise<UserAccount> {
  return api.post<UserAccount>('/v1/users', input);
}

/** Login linked to a teacher profile, or null when the teacher has none
 *  (honest 404: the admin creates it from the list). */
export interface TeacherAccount {
  ID: string;
  Username: string;
  Email: string;
  Active: boolean;
}

export async function teacherAccount(id: string): Promise<TeacherAccount | null> {
  try {
    return await api.get<TeacherAccount>(`/v1/teachers/${encodeURIComponent(id)}/account`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Enables or disables a login without deleting it (lockout response).
 *  Disabling kills bearers at the next request; refresh is rejected. */
export async function setUserActive(id: string, active: boolean): Promise<UserAccount> {
  return api.put<UserAccount>(`/v1/users/${encodeURIComponent(id)}/active`, { active });
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

export interface NewClassGroup {
  year: number;
  grade: number;
  groupNo: number;
}

/** Dated range of one academic period (RFC3339 datetimes). */
export interface PeriodRange {
  Start: string;
  End: string;
}

/** School year with dated periods. Empty PeriodRanges = legacy year. */
export interface SchoolYear {
  ID: string;
  Year: number;
  Periods: number;
  StartDate: string;
  EndDate: string;
  Holidays: string[];
  /** Manually marked days without classes (not official holidays). */
  NoClassDays: string[];
  PeriodRanges: PeriodRange[];
  Closed: boolean;
}

export interface NewSchoolYear {
  year: number;
  periods: number;
  startDate: string;
  endDate: string;
  holidays: string[];
  noClassDays: string[];
  periodRanges: { start: string; end: string }[];
}

/** Every year with its dated periods, newest first. */
export async function listYears(): Promise<SchoolYear[]> {
  return (await api.get<SchoolYear[]>('/v1/schoolyears')) ?? [];
}

export async function getYear(id: string): Promise<SchoolYear> {
  const y = await api.get<SchoolYear>(`/v1/schoolyears/${encodeURIComponent(id)}`);
  if (!y) throw new ApiError(404, { error: { code: 'http.err_not_found', message: 'Año no encontrado.' } });
  return { ...y, Holidays: y.Holidays ?? [], NoClassDays: y.NoClassDays ?? [], PeriodRanges: y.PeriodRanges ?? [] };
}

/** Official Colombian holidays (Ley 51 de 1983) as YYYY-MM-DD: the
 *  editable seed for the year form. */
export async function officialHolidays(year: number): Promise<string[]> {
  const r = await api.get<{ year: number; holidays: string[] }>(`/v1/holidays?year=${year}`);
  return r?.holidays ?? [];
}

/** Creates a year: new years always date their periods. */
export async function createYear(input: NewSchoolYear): Promise<SchoolYear> {
  return api.post<SchoolYear>('/v1/schoolyears', {
    year: input.year,
    periods: input.periods,
    startDate: input.startDate,
    endDate: input.endDate,
    holidays: input.holidays,
    noClassDays: input.noClassDays,
    periodRanges: input.periodRanges
  });
}

/** Replaces a year (holidays-only once it grew salons; never when closed). */
export async function updateYear(id: string, input: NewSchoolYear): Promise<SchoolYear> {
  return api.put<SchoolYear>(`/v1/schoolyears/${encodeURIComponent(id)}`, {
    year: input.year,
    periods: input.periods,
    startDate: input.startDate,
    endDate: input.endDate,
    holidays: input.holidays,
    noClassDays: input.noClassDays,
    periodRanges: input.periodRanges
  });
}

/** Finishes a year (idempotent): no enrollments and no edits afterwards. */
export async function closeYear(id: string): Promise<SchoolYear> {
  return api.post<SchoolYear>(`/v1/schoolyears/${encodeURIComponent(id)}/close`, {});
}

/** Year-end decision per student. */
export type PromotionDecision = 'promote' | 'repeat' | 'graduate';

export interface Promotion {
  ID: string;
  StudentID: string;
  FromGroupID: string;
  ToGroupID: string;
  Decision: PromotionDecision;
  DecidedBy: string;
  DecidedAt: string;
}

export interface PromotionInput {
  studentID: string;
  fromGroupID: string;
  toGroupID?: string;
  decision: PromotionDecision;
}

/** Records one audited decision and applies it (enroll destination,
 *  RepeatCount+1 or graduation). Grade 11 only graduates or repeats. */
export async function recordPromotion(input: PromotionInput): Promise<Promotion> {
  return api.post<Promotion>('/v1/promotions', {
    studentID: input.studentID,
    fromGroupID: input.fromGroupID,
    ...(input.toGroupID ? { toGroupID: input.toGroupID } : {}),
    decision: input.decision
  });
}

/** Decisions already taken from one salon (the decided vs pending review). */
export async function promotionsForGroup(groupID: string): Promise<Promotion[]> {
  return (await api.get<Promotion[]>(`/v1/promotions?groupID=${encodeURIComponent(groupID)}`)) ?? [];
}

/** Decision history of one student, oldest first. */
export async function promotionsForStudent(studentID: string): Promise<Promotion[]> {
  return (await api.get<Promotion[]>(`/v1/promotions?studentID=${encodeURIComponent(studentID)}`)) ?? [];
}

/** Creates a class-group (salón). Duplicates within the year fail 400
 *  with a stable code; unknown years 404. */
export async function createClassGroup(input: NewClassGroup): Promise<YearGroup> {
  const g = await api.post<{ ID: string; SchoolYearID: string; Grade: number; GroupNo: number }>(
    '/v1/classes',
    { year: input.year, grade: input.grade, groupNo: input.groupNo }
  );
  return {
    GroupID: g.ID,
    Grade: g.Grade,
    GroupNo: g.GroupNo,
    ClassLabel: `${g.Grade}-${g.GroupNo}`,
    SchoolYear: input.year
  };
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
    Excused: number;
    Evasions: number;
    Lates: number;
  }[];
  Totals: { Sessions: number; Presences: number; Absences: number; Excused: number; Evasions: number; Lates: number };
}

const EMPTY_TOTALS = { Sessions: 0, Presences: 0, Absences: 0, Excused: 0, Evasions: 0, Lates: 0 };

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
  Excused: number;
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
  StudentName: string;
  ClassID: string;
  ClassLabel: string;
  TeacherID: string;
  AuthorName: string;
  HappenedAt: string;
  Gravity: 'mild' | 'moderate' | 'severe';
  Title: string;
  Description: string;
  GroupID: string;
}

// Latest llamados, newest first, with display names resolved by the
// backend (live records win, the frozen snapshot stands in otherwise).
// all=true lifts the 90-day dashboard window for admin history screens.
export async function warningsRecent(limit = 20, all = false): Promise<RecentWarning[]> {
  const q = [`limit=${limit}`];
  if (all) q.push('all=1');
  return (await api.get<RecentWarning[]>(`/v1/warnings/recent?${q.join('&')}`)) ?? [];
}

export interface WarningRevision {
  WarningID: string;
  OldGravity: string;
  NewGravity: string;
  OldTitle: string;
  NewTitle: string;
  OldDetail: string;
  NewDetail: string;
  Author: string;
  ChangedAt: string;
}

/** Every correction of one llamado, newest first. */
export async function warningRevisions(id: string): Promise<WarningRevision[]> {
  return (await api.get<WarningRevision[]>(`/v1/warnings/${encodeURIComponent(id)}/revisions`)) ?? [];
}

export interface WarningCorrection {
  gravity?: 'mild' | 'moderate' | 'severe';
  title?: string;
  description?: string;
}

/** Corrects a llamado; unchanged saves are no-ops server-side. */
export async function correctWarning(id: string, input: WarningCorrection): Promise<Warning> {
  const updated = await api.put<Warning>(`/v1/warnings/${encodeURIComponent(id)}`, input);
  if (!updated) throw missing('Llamado');
  return updated;
}

export interface NewWarningBatch {
  classID: string;
  studentIDs: string[];
  gravity: 'mild' | 'moderate' | 'severe';
  title: string;
  description: string;
  happenedAt?: string;
}

/** Issues one llamado for one or more students. Same endpoint and same
 *  record the teacher flow uses: one event, one shared group, each
 *  student keeps its own history. */
export async function issueWarningBatch(draft: NewWarningBatch): Promise<Warning[]> {
  return (await api.post<Warning[]>('/v1/warnings/batch', draft)) ?? [];
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
  MarksLast7d: { Presences: number; Absences: number; Excused: number; Evasions: number; Lates: number };
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
    MarksLast7d: d.MarksLast7d ?? { Presences: 0, Absences: 0, Excused: 0, Evasions: 0, Lates: 0 },
    WarningsLast7d: d.WarningsLast7d ?? { Mild: 0, Moderate: 0, Severe: 0 },
    TopRisk: d.TopRisk ?? [],
    RecentWarnings: d.RecentWarnings ?? []
  };
}
