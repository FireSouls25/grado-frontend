import { api } from '$lib/api/client';
import { ApiError } from '$lib/api/types';
import type { Me, RosterEntry, SessionDetail, Warning } from '$lib/api/types';

// Endpoints that exist in the backend today.
export async function me(): Promise<Me> {
  return api.get<Me>('/v1/me');
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
}

/** Weekly schedule entries for a weekday. Pending: GET /v1/teachers/me/schedule. */
export async function daySchedule(weekday: number): Promise<TeacherClass[]> {
  return api.get<TeacherClass[]>(`/v1/teachers/me/schedule?weekday=${weekday}`);
}

export async function classRoster(groupID: string): Promise<RosterEntry[]> {
  return api.get<RosterEntry[]>(
    `/v1/classes/${encodeURIComponent(groupID)}/roster`
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

export async function issueWarnings(draft: WarningDraft): Promise<Warning[]> {
  return api.post<Warning[]>('/v1/warnings/batch', draft);
}
