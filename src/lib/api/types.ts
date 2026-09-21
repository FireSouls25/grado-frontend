// Shared API types. Field names mirror Go's default JSON encoding
// (capitalized struct fields, no tags): they must stay capitalized to
// match what the backend actually sends.

export interface ApiErrorBody {
  code: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, body: { error?: ApiErrorBody }) {
    super(body?.error?.message ?? 'Error de red');
    this.name = 'ApiError';
    this.code = body?.error?.code ?? 'http.err_internal';
    this.status = status;
  }
}

export interface Me {
  subject: string;
  roles: string[];
  home: string;
}

export interface Student {
  ID: string;
  Names: string;
  Surnames: string;
  ClassID: string;
  DocumentID: string;
}

export type Mark = '' | 'absence' | 'evasion' | 'late';

export interface Revision {
  ID: string;
  SessionID: string;
  Number: number;
  StudentID: string;
  From: Mark;
  To: Mark;
  ChangedBy: string;
  ChangedAt: string;
  Note: string;
}

export interface RosterEntry {
  StudentID: string;
  Names: string;
  Surnames: string;
  DocumentID: string;
}

export interface Session {
  ID: string;
  ClassGroupID: string;
  ClassLabel: string;
  SchoolYear: number;
  TeacherID: string;
  SubjectID: string;
  Date: string;
  Period: number;
  Roster: RosterEntry[];
}

export interface SessionDetail {
  Session: Session;
  Marks: Record<string, Mark>;
  Revisions: Revision[];
}

export interface Warning {
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
