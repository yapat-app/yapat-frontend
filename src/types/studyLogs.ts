/**
 * Admin study-log viewer types — mirror of the backend admin read schemas.
 */

export interface StudyLogUser {
  user_id: number;
  username: string;
  session_count: number;
  event_count: number;
  last_seen: string; // ISO 8601
}

export interface StudyLogSession {
  session_id: string;
  event_count: number;
  first_event_at: string; // ISO 8601
  last_event_at: string; // ISO 8601
  phase_ids: string[];
  duration_minutes: number | null;
}

export interface StudyLogEventRow {
  id: number;
  client_ts: string; // ISO 8601
  event_type: string;
  phase_id: string | null;
  dataset_id: number | null;
  snippet_id: number | null;
  payload: Record<string, unknown> | null;
  duration_ms: number | null;
}

export interface StudyLogEventsPage {
  session_id: string;
  total: number;
  events: StudyLogEventRow[];
}
