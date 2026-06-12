/**
 * Study-flow configuration — env-driven knobs for the guided participant flow.
 *
 * The ordered phase *sequence* is derived from the same allowlist the phase lock
 * already uses (`VITE_STUDY_PHASE_ALLOWED`), so there is a single source of truth
 * for "which phases, in what order".
 */

import { STUDY_PHASES, ALL_PHASE_IDS } from "../studyPhases/phases";
import { isPhaseLocked } from "../studyPhases/PhaseProvider";

function env(key: string): string | undefined {
  // Runtime override (entrypoint.sh → window.__ENV__) wins over build-time env,
  // mirroring StudyLogger so flags can flip without rebuilding the image.
  const runtime = (window as unknown as { __ENV__?: Record<string, string> }).__ENV__?.[key];
  if (runtime !== undefined) return runtime;
  return (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
}

function parseBool(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/** Whether the guided study flow runs. Defaults to ON when the phase is locked. */
export function isFlowEnabled(): boolean {
  const raw = env("VITE_STUDY_FLOW_ENABLED");
  if (raw === undefined || raw === "") return isPhaseLocked();
  return parseBool(raw);
}

/** Per-phase annotation budget, in milliseconds. Default 5 minutes. */
export function phaseDurationMs(): number {
  const minutes = Number(env("VITE_STUDY_PHASE_DURATION_MINUTES"));
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
  return Math.round(safe * 60_000);
}

/**
 * Ordered list of phase ids the participant moves through.
 * Sourced from the allowlist; falls back to every registered phase in registry
 * order so the flow still works in non-locked / dev setups.
 */
export function phaseSequence(): string[] {
  const raw = env("VITE_STUDY_PHASE_ALLOWED");
  const fromAllowlist = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => !!id && !!STUDY_PHASES[id]);
  return fromAllowlist.length > 0 ? fromAllowlist : ALL_PHASE_IDS;
}
