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

/**
 * True when the server was never reached (connection refused, DNS, CORS
 * preflight) or the request timed out. Both are worth retrying, and both
 * mean "the data is not wrong, the connection is".
 */
export function isOffline(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
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
  // Display names resolved by list endpoints (recent, per-student).
  StudentName?: string;
  ClassLabel?: string;
  AuthorName?: string;
  Snapshot?: {
    Names: string;
    Surnames: string;
    DocumentID: string;
    ClassID: string;
    Birthdate: string;
    Age: number;
    CaregiverName: string;
    CaregiverPhone: string;
  };
}

/** Yes/no profile item with a detail when affirmative (vision, hearing…). */
export interface Condition {
  Has: boolean;
  Detail: string;
}

export interface Guardian {
  Names: string;
  DocumentID: string;
  Phone: string;
  Occupation: string;
  Address: string;
}

/** Full student profile: GET /v1/students/{id}. */
export interface StudentProfile {
  ID: string;
  Names: string;
  Surnames: string;
  ClassID: string;
  DocumentID: string;
  Phone: string;
  Address: string;
  Birthplace: string;
  Birthdate: string;
  Email: string;
  Vision: Condition;
  Hearing: Condition;
  BloodType: string;
  IsNew: boolean;
  PreviousSchool: string;
  TransferReason: string;
  RepeatCount: number;
  Mother: Guardian;
  Father: Guardian;
  Caregiver: Guardian;
  LivesWith: string;
  Siblings: { Name: string; ClassID: string }[];
  MedicalReport: string;
  DiversityCondition: string;
  SpecialistReport: Condition;
  Status: 'active' | 'graduated';
}
