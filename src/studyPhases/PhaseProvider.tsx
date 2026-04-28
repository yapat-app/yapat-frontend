/**
 * StudyPhaseProvider
 *
 * Resolution priority (highest first):
 *   1. URL query param `?phase=P2.1`        — best for handing participants links
 *   2. localStorage `yapat_study_phase`     — sticky across reloads on the same browser
 *   3. Env var  VITE_STUDY_PHASE             — build-time default per deployment
 *   4. DEFAULT_PHASE_ID                      — final fallback
 *
 * Components consume `usePhaseConfig()` and never need to know which layer
 * resolved the value.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_PHASE_ID, STUDY_PHASES, getPhaseConfig } from "./phases";
import { PhaseContext, type PhaseContextValue } from "./context";

const STORAGE_KEY = "yapat_study_phase";

function getUrlPhaseValue(searchParams: URLSearchParams): string | null {
  // Canonical + short alias
  const direct = searchParams.get("phase") ?? searchParams.get("p");
  if (direct) return direct;

  // Recovery path: if someone built a URL like `?dataset_id=1?phase=P2.1`
  // the `phase` ends up embedded in a value and won't be parsed as a param.
  for (const [_k, v] of searchParams.entries()) {
    if (!v) continue;
    const idx = v.indexOf("phase=");
    const idxP = v.indexOf("p=");
    const start = idx >= 0 ? idx : idxP;
    if (start < 0) continue;
    const tail = v.slice(start);
    const recovered = new URLSearchParams(tail.startsWith("?") ? tail.slice(1) : tail);
    const ph = recovered.get("phase") ?? recovered.get("p");
    if (ph) return ph;
  }

  return null;
}

function isPhaseLocked(): boolean {
  const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_STUDY_PHASE_LOCK;
  return v === "1" || v === "true" || v === "yes";
}

function getAllowedPhaseIds(): string[] {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_STUDY_PHASE_ALLOWED;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s: string) => s.trim())
    .filter((id: string) => !!id && !!STUDY_PHASES[id]);
}

function resolveInitialPhaseId(urlValue: string | null): string {
  const envValue = (import.meta as ImportMeta & { env?: Record<string, string> })
    .env?.VITE_STUDY_PHASE;
  const allowed = getAllowedPhaseIds();

  // When locked, the deployment decides the phase. Ignore URL/localStorage.
  if (isPhaseLocked()) {
    // Allowlist lock: allow URL switching *within* allowlist.
    if (allowed.length > 0) {
      if (urlValue && allowed.includes(urlValue)) return urlValue;
    }
    // Otherwise pick env phase if allowed, otherwise first allowed.
    if (allowed.length > 0) {
      if (envValue && allowed.includes(envValue)) return envValue;
      return allowed[0];
    }
    if (envValue && STUDY_PHASES[envValue]) return envValue;
    return DEFAULT_PHASE_ID;
  }

  if (urlValue && STUDY_PHASES[urlValue]) return urlValue;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && STUDY_PHASES[stored]) return stored;
  } catch {
    // localStorage may be disabled in private mode — ignore.
  }

  if (envValue && STUDY_PHASES[envValue]) return envValue;

  return DEFAULT_PHASE_ID;
}

interface Props {
  children: React.ReactNode;
}

export const StudyPhaseProvider: React.FC<Props> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Support both `?phase=P2.1` (canonical) and `?p=P2.1` (short alias),
  // plus a recovery path for malformed URLs.
  const urlValue = getUrlPhaseValue(searchParams);

  const [phaseId, setPhaseIdState] = useState<string>(() =>
    resolveInitialPhaseId(urlValue),
  );

  // When locked, always keep the URL in sync with the effective phase so
  // participants don't end up with misleading `?phase=...` values.
  useEffect(() => {
    if (!isPhaseLocked()) return;
    const allowed = getAllowedPhaseIds();
    // In allowlist-lock mode, allow switching via URL as long as it's allowed.
    if (allowed.length > 0 && urlValue && allowed.includes(urlValue) && urlValue !== phaseId) {
      setPhaseIdState(urlValue);
      return;
    }
    const current = searchParams.get("phase") ?? searchParams.get("p");
    if (current === phaseId) return;
    const next = new URLSearchParams(searchParams);
    next.set("phase", phaseId);
    next.delete("p");
    setSearchParams(next, { replace: true });
  }, [phaseId, searchParams, setSearchParams, urlValue]);

  // Keep state in sync if the URL changes (deep links / participant flow).
  useEffect(() => {
    const locked = isPhaseLocked();
    if (locked) return;
    if (urlValue && STUDY_PHASES[urlValue] && urlValue !== phaseId) {
      setPhaseIdState(urlValue);
      try {
        localStorage.setItem(STORAGE_KEY, urlValue);
      } catch {
        // ignore
      }
    }
  }, [urlValue, phaseId]);

  const setPhase = (id: string) => {
    const locked = isPhaseLocked();
    if (locked) {
      const allowed = getAllowedPhaseIds();
      // If locked with allowlist, allow switching within allowlist.
      if (allowed.length === 0) return;
      if (!allowed.includes(id)) return;
    }
    if (!STUDY_PHASES[id]) return;
    setPhaseIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
    const next = new URLSearchParams(searchParams);
    // Always write the canonical param name.
    next.set("phase", id);
    next.delete("p");
    setSearchParams(next, { replace: true });
  };

  const value = useMemo<PhaseContextValue>(
    () => ({
      phase: getPhaseConfig(phaseId),
      phaseId,
      setPhase,
    }),
    // setSearchParams is stable; phaseId drives recomputation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phaseId],
  );

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>;
};
