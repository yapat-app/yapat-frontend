/**
 * Study mode — the single switch that separates user-study deployments from
 * public installs.
 *
 * Public installs must not expose user-study features: phase switching, the
 * guided timed flow and interaction logging. Every one of those features checks
 * this switch first, so a public install stays on DEFAULT_PHASE_ID no matter
 * what the other VITE_STUDY_* variables, the URL or localStorage say.
 *
 * Off unless VITE_STUDY_MODE is explicitly set to a truthy value, so a missing
 * or mistyped setting fails closed.
 */

import { readEnv, parseBoolEnv } from "../utils/runtimeEnv";

export function isStudyMode(): boolean {
  return parseBoolEnv(readEnv("VITE_STUDY_MODE"));
}
