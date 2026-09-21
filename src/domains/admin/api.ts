import { api } from '$lib/api/client';
import type { Me } from '$lib/api/types';

// Endpoints that exist in the backend today.
export async function me(): Promise<Me> {
  return api.get<Me>('/v1/me');
}

// --- Pending backend endpoints (próxima fase) ---------------------------
// Same honesty rule as the teacher domain: any error means "no data yet".

export interface TeacherSummary {
  id: string;
  names: string;
  surnames: string;
  documentID: string;
  active: boolean;
  homeroomClassID: string;
}

export interface Subject {
  id: string;
  name: string;
  active: boolean;
}

export interface TeacherDetail extends TeacherSummary {
  phone: string;
  email: string;
  subjects: { subjectID: string; subjectName: string; from: string }[];
  groups: { groupID: string; classLabel: string; subjectName: string }[];
}

export interface YearGroup {
  groupID: string;
  grade: number;
  groupNo: number;
  classLabel: string;
  schoolYear: number;
  studentCount: number;
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

export async function groupsByYear(year: number): Promise<YearGroup[]> {
  return api.get<YearGroup[]>(`/v1/classes?year=${year}`);
}

export interface ClassReport {
  classGroupID: string;
  sessions: number;
  students: {
    studentID: string;
    names: string;
    surnames: string;
    sessions: number;
    presences: number;
    absences: number;
    evasions: number;
    lates: number;
  }[];
  totals: { sessions: number; presences: number; absences: number; evasions: number; lates: number };
}

export async function classReport(groupID: string): Promise<ClassReport> {
  return api.get<ClassReport>(`/v1/statistics/class/${encodeURIComponent(groupID)}`);
}
