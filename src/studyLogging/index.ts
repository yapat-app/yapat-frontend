/**
 * Study interaction logging — public surface.
 * See docs/study-logging.md for the event schema and integration guide.
 */

export { studyLogger } from "./StudyLogger";
export { useStudyLogger } from "./useStudyLogger";
export { usePanelDwell } from "./usePanelDwell";
export { useAudioInstrumentation } from "./useAudioInstrumentation";
export { LoggerContextBridge } from "./LoggerContextBridge";
export type {
  StudyLogEvent,
  StudyEventType,
  StudyEventEnvelope,
  PanelName,
  ScrollSource,
  LogOptions,
  PayloadFor,
} from "./types";
