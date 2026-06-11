/**
 * Dev-only inspector: exposes `window.__studyLog` for eyeballing recent events
 * and forcing a flush while developing. Installed once by LoggerContextBridge.
 * Inert when logging is disabled or outside dev.
 */

import { studyLogger } from "./StudyLogger";

let installed = false;

export function installDevInspector(): void {
  if (installed) return;
  if (!import.meta.env.DEV || !studyLogger.isEnabled()) return;
  installed = true;
  (window as any).__studyLog = {
    recent: () => studyLogger.recentEvents(),
    flush: () => studyLogger.flush("manual"),
    enabled: () => studyLogger.isEnabled(),
  };
}
