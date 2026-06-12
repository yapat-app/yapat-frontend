/**
 * StudyFlowProvider — drives a participant through the ordered study phases:
 *
 *   instructions → tour → running (countdown) → transition → [next phase] … → complete
 *
 * Logging lifecycle: the study session is opened (studyLogger.start) exactly when
 * the "running" stage begins and closed (studyLogger.stop) exactly when the timer
 * expires. Nothing that happens during instructions or the tour is logged.
 *
 * On every load it checks localStorage for completed phases and resumes from the
 * first uncompleted one, so participants who finish a session and return later
 * continue exactly where they left off.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { message } from "antd";
import { usePhaseContext } from "../studyPhases";
import { studyLogger } from "../studyLogging/StudyLogger";
import { StudyFlowContext, type StudyFlowContextValue } from "./context";
import {
  isFlowEnabled,
  phaseDurationMs,
  phaseSequence,
} from "./flowConfig";
import { getPhaseContent } from "./phaseContent";
import { clearFlowState, loadFlowState, saveFlowState } from "./flowStorage";
import type { FlowStage, PhaseProgress, StudyFlowState } from "./types";

const TRANSITION_MS = 2500;

function initialProgress(): PhaseProgress {
  return { stage: "instructions", startedAt: null };
}

function isPhaseCompleted(progress: PhaseProgress | undefined, durationMs: number): boolean {
  if (!progress) return false;
  if (progress.stage === "transition") return true;
  if (progress.stage === "complete") return true;
  if (progress.stage === "running" && progress.startedAt !== null) {
    return Date.now() - progress.startedAt >= durationMs;
  }
  return false;
}

interface Props {
  children: React.ReactNode;
}

export const StudyFlowProvider: React.FC<Props> = ({ children }) => {
  const enabled = isFlowEnabled();
  const { phaseId, setPhase } = usePhaseContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sequence = useMemo(() => phaseSequence(), []);
  const durationMs = useMemo(() => phaseDurationMs(), []);

  const [flow, setFlow] = useState<StudyFlowState>(() => loadFlowState());
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const setPhaseRef = useRef(setPhase);
  setPhaseRef.current = setPhase;

  const update = useCallback((updater: (prev: StudyFlowState) => StudyFlowState) => {
    setFlow((prev) => {
      const next = updater(prev);
      saveFlowState(next);
      return next;
    });
  }, []);

  // ── Operator/dev reset: ?study_reset=1 ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (searchParams.get("study_reset") !== "1") return;
    clearFlowState();
    setFlow({ phases: {}, seenTourKeys: [] });
    // Navigate to a completely clean URL so no leftover params (dataset_id,
    // mode, sampling strategy, etc.) from the previous session bleed through.
    const first = sequence.length > 0 ? sequence[0] : "";
    navigate(`/annotate?phase=${first}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── Phase resume: advance to the first uncompleted phase on mount ────────
  useEffect(() => {
    if (!enabled || sequence.length === 0) return;
    const stored = loadFlowState();
    const firstUncompleted = sequence.find(
      (id) => !isPhaseCompleted(stored.phases[id], durationMs),
    );
    if (firstUncompleted === undefined) {
      // Every phase in the sequence is done. Navigate to the last phase so its
      // "complete" stage is the active one. Without this, phaseId stays at
      // whatever PhaseProvider resolved on init (e.g. P1.1 from the env var),
      // and P1.1's stored "transition" stage would trigger the transition effect
      // which would incorrectly advance to P1.2 on the next render cycle.
      const last = sequence[sequence.length - 1];
      if (last) {
        update((prev) => ({
          ...prev,
          phases: { ...prev.phases, [last]: { stage: "complete", startedAt: null } },
        }));
        // Calling setPhase changes phaseId → the transition effect re-runs with
        // stage="complete" and bails out, cancelling any pending P1.x timeout.
        if (last !== phaseId) setPhaseRef.current(last);
      }
      return;
    }
    if (firstUncompleted !== phaseId) {
      setPhaseRef.current(firstUncompleted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── Ensure the active phase has a progress entry ─────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (flow.phases[phaseId]) return;
    update((prev) => ({
      ...prev,
      phases: { ...prev.phases, [phaseId]: initialProgress() },
    }));
  }, [enabled, phaseId, flow.phases, update]);

  const progress = flow.phases[phaseId] ?? initialProgress();
  const stage: FlowStage = enabled ? progress.stage : "running";
  const isTourActive = enabled && stage === "tour";

  // ── Logging: open session exactly when running starts, close when it ends ─
  // This means nothing during instructions or the guided tour is ever logged.
  const prevStageRef = useRef<FlowStage | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const prev = prevStageRef.current;
    prevStageRef.current = stage;

    if (stage === "running" && prev !== "running") {
      // Annotation session begins — start the logger.
      studyLogger.start();
      studyLogger.log("phase_timer_start", {
        phase: phaseId,
        durationSec: Math.round(durationMs / 1000),
      });
    }

    if (prev === "running" && stage !== "running") {
      // Annotation session ends — flush + close before transitioning away.
      studyLogger.log("phase_timer_expire", { phase: phaseId });
      studyLogger.stop();
    }
  }, [enabled, stage, phaseId, durationMs]);

  // Steps to show this phase: only featureKeys not seen in an earlier phase.
  const pendingTourSteps = useMemo(() => {
    if (!enabled) return [];
    const seen = new Set(flow.seenTourKeys);
    return getPhaseContent(phaseId).tour.filter((s) => !seen.has(s.featureKey));
  }, [enabled, phaseId, flow.seenTourKeys]);

  const sequenceIndex = sequence.indexOf(phaseId);
  const nextPhaseId =
    sequenceIndex >= 0 && sequenceIndex < sequence.length - 1
      ? sequence[sequenceIndex + 1]
      : null;

  const setStage = useCallback(
    (id: string, patch: Partial<PhaseProgress>) => {
      update((prev) => ({
        ...prev,
        phases: {
          ...prev.phases,
          [id]: { ...(prev.phases[id] ?? initialProgress()), ...patch },
        },
      }));
    },
    [update],
  );

  // ── Instructions "Begin" → tour (or straight to running if nothing new) ──
  const beginPhase = useCallback(() => {
    if (pendingTourSteps.length === 0) {
      // No tour steps → jump straight to running. The stage-watching effect
      // above will call studyLogger.start() once the state update lands.
      setStage(phaseId, { stage: "running", startedAt: Date.now() });
      setNowTs(Date.now());
      const content = getPhaseContent(phaseId);
      message.success(`${content.title} — annotation session has started!`, 3);
      return;
    }
    setStage(phaseId, { stage: "tour" });
  }, [phaseId, pendingTourSteps, setStage]);

  // ── Tour finished → mark features seen, start the countdown ─────────────
  const finishTour = useCallback(() => {
    const newKeys = pendingTourSteps.map((s) => s.featureKey);
    update((prev) => {
      const seen = new Set([...prev.seenTourKeys, ...newKeys]);
      return {
        phases: {
          ...prev.phases,
          [phaseId]: {
            ...(prev.phases[phaseId] ?? initialProgress()),
            stage: "running",
            startedAt: Date.now(),
          },
        },
        seenTourKeys: [...seen],
      };
    });
    setNowTs(Date.now());
    // Logger start and phase_timer_start are emitted by the stage-watching
    // effect above once the state update lands — no direct calls here.
    const content = getPhaseContent(phaseId);
    message.success(`${content.title} — annotation session has started!`, 3);
  }, [phaseId, pendingTourSteps, update]);

  // ── Countdown tick ────────────────────────────────────────────────────────
  const remainingMs =
    stage === "running" && progress.startedAt != null
      ? Math.max(0, durationMs - (nowTs - progress.startedAt))
      : 0;

  useEffect(() => {
    if (!enabled || stage !== "running") return;
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, stage]);

  // Timer hit zero → enter the transition interstitial.
  // Logging (phase_timer_expire + stop) is handled by the stage-watching effect.
  useEffect(() => {
    if (!enabled || stage !== "running") return;
    if (progress.startedAt == null) return;
    if (remainingMs > 0) return;
    setStage(phaseId, { stage: "transition" });
  }, [enabled, stage, remainingMs, progress.startedAt, phaseId, setStage]);

  // ── Transition → advance to the next phase (or complete the study) ───────
  const advancing = useRef(false);
  useEffect(() => {
    if (!enabled || stage !== "transition") return;
    advancing.current = false;
    const id = window.setTimeout(() => {
      if (advancing.current) return;
      advancing.current = true;
      if (nextPhaseId) {
        // Safety check: if the next phase was already completed in storage
        // (e.g. resume logic ran concurrently), don't re-show its instructions.
        const storedNext = loadFlowState().phases[nextPhaseId];
        if (isPhaseCompleted(storedNext, durationMs)) return;
        studyLogger.log("phase_auto_advance", { from: phaseId, to: nextPhaseId });
        setStage(nextPhaseId, { stage: "instructions", startedAt: null });
        setPhaseRef.current(nextPhaseId);
      } else {
        studyLogger.log("study_complete", { phases: sequence });
        setStage(phaseId, { stage: "complete" });
      }
    }, TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [enabled, stage, nextPhaseId, phaseId, sequence, setStage]);

  const value = useMemo<StudyFlowContextValue>(
    () => ({
      enabled,
      stage,
      isTourActive,
      phaseId,
      pendingTourSteps,
      remainingMs,
      durationMs,
      sequenceIndex: sequenceIndex < 0 ? 0 : sequenceIndex,
      sequenceLength: sequence.length,
      nextPhaseId,
      beginPhase,
      finishTour,
    }),
    [
      enabled,
      stage,
      isTourActive,
      phaseId,
      pendingTourSteps,
      remainingMs,
      durationMs,
      sequenceIndex,
      sequence.length,
      nextPhaseId,
      beginPhase,
      finishTour,
    ],
  );

  return (
    <StudyFlowContext.Provider value={value}>{children}</StudyFlowContext.Provider>
  );
};
