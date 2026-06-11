/**
 * useStudyLogger — thin React hook over the singleton.
 *
 * Returns a stable `log` bound to the singleton plus the current PhaseConfig so
 * call sites can gate events on phase capabilities (never on hard-coded phase IDs).
 */

import { useCallback } from "react";
import { usePhaseConfig } from "../studyPhases";
import { studyLogger } from "./StudyLogger";
import type { LogOptions, PayloadFor, StudyEventType } from "./types";

export function useStudyLogger() {
  const phase = usePhaseConfig();

  const log = useCallback(
    <E extends StudyEventType>(eventType: E, payload: PayloadFor<E>, opts?: LogOptions) => {
      studyLogger.log(eventType, payload, opts);
    },
    [],
  );

  return { log, phase, enabled: studyLogger.isEnabled() };
}
