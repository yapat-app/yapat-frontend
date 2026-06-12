/**
 * Study interaction logging — event types and envelope.
 *
 * Every event carries a common envelope (assembled centrally in StudyLogger).
 * Callers only ever supply `eventType` + `payload` (+ optional snippetId/durationMs);
 * the logger fills in session/user/phase/dataset/snippet ids from Redux + the
 * phase bridge. Keep payloads small (ids + scalars), never full prediction objects
 * or audio content.
 */

export type PanelName =
  | "feed"
  | "visualization"
  | "filter_panel"
  | "score_histogram";

export type ScrollSource = "scroll" | "vis_click" | "programmatic";

/** Discriminated union of every loggable event. */
export type StudyLogEvent =
  // ── Common / lifecycle ──────────────────────────────────────────────
  | { eventType: "session_start"; payload: { userAgent: string; viewportW: number; viewportH: number; lock: boolean } }
  | { eventType: "session_end"; payload: { reason: "unmount" | "unload" } }
  | { eventType: "phase_change"; payload: { from: string | null; to: string } }
  | { eventType: "log_dropped"; payload: { count: number } }

  // ── Guided study flow ───────────────────────────────────────────────
  | { eventType: "phase_instructions_shown"; payload: { phase: string } }
  | { eventType: "phase_tour_start"; payload: { phase: string; stepKeys: string[] } }
  | { eventType: "phase_tour_complete"; payload: { phase: string; completed: boolean } }
  | { eventType: "phase_timer_start"; payload: { phase: string; durationSec: number } }
  | { eventType: "phase_timer_expire"; payload: { phase: string } }
  | { eventType: "phase_auto_advance"; payload: { from: string; to: string } }
  | { eventType: "study_complete"; payload: { phases: string[] } }

  // ── Panel / layout ──────────────────────────────────────────────────
  | { eventType: "panel_enter"; payload: { panel: PanelName } }
  | { eventType: "panel_exit"; payload: { panel: PanelName } }
  | { eventType: "split_resize"; payload: { mode: "ratio" | "right_px"; value: number; viewportW: number; viewportH: number } }

  // ── Feed ────────────────────────────────────────────────────────────
  | { eventType: "feed_active_snippet_change"; payload: { snippetId: number; source: ScrollSource } }

  // ── Annotation ──────────────────────────────────────────────────────
  | { eventType: "feedback_submit"; payload: { action: string; labels: string[] } }
  | { eventType: "label_toggle"; payload: { label: string; op: "add" | "remove"; labelsAfter: string[] } }
  | { eventType: "label_clear"; payload: { labelsBefore: string[] } }

  // ── Visualization ───────────────────────────────────────────────────
  | { eventType: "vis_point_click"; payload: { snippetId: number; shiftHeld: boolean; projectionMethod: string } }
  | { eventType: "vis_point_hover"; payload: { snippetId: number; projectionMethod: string } }
  | { eventType: "projection_method_change"; payload: { from: string; to: string } }
  | { eventType: "sampling_method_change"; payload: { method: string } }

  // ── Filters ─────────────────────────────────────────────────────────
  | { eventType: "visibility_threshold_change"; payload: { property: string; value: number } }
  | { eventType: "visibility_range_change"; payload: { property: string; min: number; max: number } }
  | { eventType: "color_property_change"; payload: { property: string | null } }
  | { eventType: "histogram_property_select"; payload: { property: string } }
  | { eventType: "histogram_multi_toggle"; payload: { property: string; enabled: boolean; keysAfter: string[] } }

  // ── Retrain ─────────────────────────────────────────────────────────
  | { eventType: "retrain_manual_click"; payload: Record<string, never> }
  | { eventType: "retrain_complete"; payload: { durationMs: number; modelFamilyName: string | null } }
  | { eventType: "retrain_failed"; payload: { modelFamilyName: string | null; error: string } }

  // ── Audio ───────────────────────────────────────────────────────────
  | { eventType: "audio_play_segment"; payload: { fromMs: number; toMs: number } }
  | { eventType: "audio_volume_change"; payload: { volume: number } }
  | { eventType: "audio_seek"; payload: { fromMs: number; toMs: number } };

export type StudyEventType = StudyLogEvent["eventType"];

/** Map an eventType to its payload type (for a typed `log()` signature). */
export type PayloadFor<E extends StudyEventType> = Extract<
  StudyLogEvent,
  { eventType: E }
>["payload"];

/** The persisted/transmitted envelope. */
export interface StudyEventEnvelope {
  sessionId: string;
  userId: number | null;
  phaseId: string | null;
  datasetId: number | null;
  snippetSetId: number | null;
  snippetId: number | null;
  timestamp: string; // ISO 8601 (participant clock)
  eventType: StudyEventType;
  payload: Record<string, unknown>;
  durationMs?: number;
}

export interface LogOptions {
  snippetId?: number | null;
  durationMs?: number;
}
