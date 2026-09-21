import { api } from '$lib/api/client';
import type { Me } from '$lib/api/types';

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
  StudentCount: number;
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

export async function createTeacher(input: NewTeacher): Promise<{ ID: string }> {
  return api.post<{ ID: string }>('/v1/teachers', input);
}

export async function grantRole(subjectID: string, role: string): Promise<unknown> {
  return api.post('/v1/roles', { subjectID, role });
}

export async function groupsByYear(year: number): Promise<YearGroup[]> {
  return api.get<YearGroup[]>(`/v1/classes?year=${year}`);
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
