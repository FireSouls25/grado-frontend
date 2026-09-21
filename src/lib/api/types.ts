// Shared API types. Shapes mirror the backend domain objects; the client
// never invents fields the API does not return.

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
  id: string;
  names: string;
  surnames: string;
  classID: string;
  documentID: string;
}

export type Mark = '' | 'absence' | 'evasion' | 'late';

export interface Revision {
  id: string;
  sessionID: string;
  number: number;
  studentID: string;
  from: Mark;
  to: Mark;
  changedBy: string;
  changedAt: string;
  note: string;
}

export interface RosterEntry {
  studentID: string;
  names: string;
  surnames: string;
  documentID: string;
}

export interface Session {
  id: string;
  classGroupID: string;
  classLabel: string;
  schoolYear: number;
  teacherID: string;
  subjectID: string;
  date: string;
  period: number;
  roster: RosterEntry[];
}

export interface SessionDetail {
  session: Session;
  marks: Record<string, Mark>;
  revisions: Revision[];
}

export interface Warning {
  id: string;
  studentID: string;
  classID: string;
  teacherID: string;
  happenedAt: string;
  gravity: 'mild' | 'moderate' | 'severe';
  title: string;
  description: string;
  groupID: string;
}
