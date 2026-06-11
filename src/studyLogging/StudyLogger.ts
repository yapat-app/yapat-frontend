/**
 * StudyLogger — singleton interaction logger for the YAPAT user study.
 *
 * Why a singleton (not a hook): many emitters are non-React (pagehide, audio
 * document listeners, flush timers). Like src/axios/axiosInstance.tsx, this
 * module imports the Redux `store` directly and reads user/dataset/snippet ids
 * fresh from `store.getState()` at log() time, so callers never pass them.
 *
 * Phase is the only piece not in Redux — LoggerContextBridge pushes it via
 * setPhaseId().
 *
 * All public methods are no-ops when the feature flag is off (zero overhead).
 */

import store from "../redux/store";
import type {
  LogOptions,
  PayloadFor,
  StudyEventEnvelope,
  StudyEventType,
} from "./types";
import { postBatch, sendBeaconBatch } from "./loggingApi";
import { persistBuffer, takeBuffer } from "./queueStorage";

const SESSION_KEY = "yapat_study_session_id";

const MAX_BATCH = 50;
const MAX_BUFFERED = 2000;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 1000;
const PERSIST_DEBOUNCE_MS = 1000;
const DEV_RING_SIZE = 200;

function parseBool(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function isEnabled(): boolean {
  // Runtime override (injected by entrypoint.sh into window.__ENV__) takes
  // precedence over the build-time env var so the flag can be toggled without
  // rebuilding the Docker image.
  const runtime = (window as any).__ENV__?.VITE_STUDY_LOGGING_ENABLED;
  if (runtime !== undefined) return parseBool(runtime);
  return parseBool(import.meta.env.VITE_STUDY_LOGGING_ENABLED as string | undefined);
}

function flushSeconds(): number {
  const raw = Number(import.meta.env.VITE_STUDY_LOGGING_FLUSH_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

interface RetryBatch {
  events: StudyEventEnvelope[];
  attempts: number;
  nextAt: number;
}

type VisibilityListener = (hidden: boolean) => void;

// Sessions shorter than this are React StrictMode dev double-mount artifacts.
// Real study sessions last minutes; 2 s is a safe minimum.
const MIN_SESSION_MS = 2000;

class StudyLogger {
  private enabled = isEnabled();
  private started = false;
  private startedAt: number | null = null;
  private phaseId: string | null = null;

  private queue: StudyEventEnvelope[] = [];
  private retry: RetryBatch[] = [];

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private visibilityListeners = new Set<VisibilityListener>();

  /** Dev-only ring buffer surfaced via window.__studyLog. */
  private devRing: StudyEventEnvelope[] = [];

  // ── Public API ────────────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.enabled;
  }

  setPhaseId(id: string | null): void {
    if (!this.enabled) return;
    if (this.phaseId !== null && id !== null && this.phaseId !== id) {
      this.log("phase_change", { from: this.phaseId, to: id });
    }
    this.phaseId = id;
  }

  /** Begin a session: arm listeners/timers, replay any persisted buffer, emit session_start. */
  start(): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.startedAt = Date.now();

    // Replay events buffered before a reload (sent as-is, original envelopes).
    const userId = this.currentUserId();
    const buffered = takeBuffer(userId);
    if (buffered.length > 0) this.queue.push(...buffered);

    window.addEventListener("pagehide", this.handlePageHide);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.flushTimer = setInterval(() => this.flush("timer"), flushSeconds() * 1000);
    this.retryTimer = setInterval(() => this.drainRetry(), 2000);

    this.log("session_start", {
      userAgent: navigator.userAgent,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      lock: parseBool(import.meta.env.VITE_STUDY_PHASE_LOCK as string | undefined),
    });

    // React fires child effects before parent effects, so panel_enter events
    // from usePanelDwell may have already been enqueued before this point.
    // Bubble session_start to the front so it is always the first event sent.
    const ssIdx = this.queue.findIndex((e) => e.eventType === "session_start");
    if (ssIdx > 0) {
      const [ss] = this.queue.splice(ssIdx, 1);
      this.queue.unshift(ss);
    }
  }

  /** End a session (component unmount): final flush + teardown. */
  stop(): void {
    if (!this.enabled || !this.started) return;

    const age = this.startedAt ? Date.now() - this.startedAt : Infinity;

    // Sub-2s sessions are React StrictMode dev double-mount artifacts.
    // Discard without flushing and keep the session ID in sessionStorage so the
    // immediate remount reuses it and continues as one session.
    if (age < MIN_SESSION_MS) {
      this.queue = [];
      this._teardownTimers();
      this.started = false;
      this.startedAt = null;
      return;
    }

    this.log("session_end", { reason: "unmount" });
    this.flush("manual");
    this._teardownTimers();

    // Clear the session ID so the next genuine visit generates a fresh one.
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }

    this.started = false;
    this.startedAt = null;
  }

  private _teardownTimers(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.flushTimer = null;
    this.retryTimer = null;
    window.removeEventListener("pagehide", this.handlePageHide);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  /** Record an event. Callers pass only eventType + payload (+ optional ids/duration). */
  log<E extends StudyEventType>(
    eventType: E,
    payload: PayloadFor<E>,
    opts?: LogOptions,
  ): void {
    if (!this.enabled) return;

    const al = store.getState().al;
    const envelope: StudyEventEnvelope = {
      sessionId: this.sessionId(),
      userId: this.currentUserId(),
      phaseId: this.phaseId,
      datasetId: al.selectedDatasetId ?? null,
      snippetSetId: al.snippetSetId ?? null,
      snippetId: opts?.snippetId ?? al.activeSnippetId ?? null,
      timestamp: new Date().toISOString(),
      eventType,
      payload: payload as Record<string, unknown>,
      durationMs: opts?.durationMs,
    };

    this.enqueue(envelope);
  }

  /** Flush the in-memory queue to the backend. */
  flush(_reason: "timer" | "manual" | "unload" = "manual"): void {
    if (!this.enabled || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    postBatch(batch).catch(() => this.scheduleRetry(batch, 0));
    this.schedulePersist();
  }

  /** Subscribe to tab visibility changes (for dwell pausing). Returns unsubscribe. */
  onVisibilityChange(cb: VisibilityListener): () => void {
    this.visibilityListeners.add(cb);
    return () => this.visibilityListeners.delete(cb);
  }

  isHidden(): boolean {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  }

  /** Dev inspector accessor. */
  recentEvents(): StudyEventEnvelope[] {
    return [...this.devRing];
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private currentUserId(): number | null {
    return store.getState().auth.user?.id ?? null;
  }

  private sessionId(): string {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return "nostore-" + Math.random().toString(36).slice(2);
    }
  }

  private enqueue(envelope: StudyEventEnvelope): void {
    this.queue.push(envelope);

    this.devRing.push(envelope);
    if (this.devRing.length > DEV_RING_SIZE) {
      this.devRing.splice(0, this.devRing.length - DEV_RING_SIZE);
    }

    this.enforceCap();
    this.schedulePersist();

    if (this.queue.length >= MAX_BATCH) this.flush("timer");
  }

  /** Drop oldest events (queue first, then retry) when total buffered exceeds cap. */
  private enforceCap(): void {
    let total = this.queue.length + this.retry.reduce((n, b) => n + b.events.length, 0);
    if (total <= MAX_BUFFERED) return;

    let dropped = 0;
    while (total > MAX_BUFFERED && this.queue.length > 0) {
      this.queue.shift();
      dropped++;
      total--;
    }
    while (total > MAX_BUFFERED && this.retry.length > 0) {
      const batch = this.retry[0];
      batch.events.shift();
      dropped++;
      total--;
      if (batch.events.length === 0) this.retry.shift();
    }

    if (dropped > 0) {
      // Record the loss so it's observable in analysis (avoid recursion via direct push).
      this.queue.push({
        sessionId: this.sessionId(),
        userId: this.currentUserId(),
        phaseId: this.phaseId,
        datasetId: null,
        snippetSetId: null,
        snippetId: null,
        timestamp: new Date().toISOString(),
        eventType: "log_dropped",
        payload: { count: dropped },
      });
    }
  }

  private scheduleRetry(events: StudyEventEnvelope[], attempts: number): void {
    if (attempts >= MAX_ATTEMPTS) return; // give up; events lost
    const backoff = Math.min(30000, RETRY_BASE_MS * 2 ** attempts);
    const jitter = Math.random() * 0.3 * backoff;
    this.retry.push({ events, attempts: attempts + 1, nextAt: Date.now() + backoff + jitter });
    this.schedulePersist();
  }

  private drainRetry(): void {
    if (!this.enabled || this.retry.length === 0) return;
    const now = Date.now();
    const due = this.retry.filter((b) => b.nextAt <= now);
    if (due.length === 0) return;
    this.retry = this.retry.filter((b) => b.nextAt > now);
    for (const batch of due) {
      postBatch(batch.events).catch(() => this.scheduleRetry(batch.events, batch.attempts));
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const all = [...this.queue, ...this.retry.flatMap((b) => b.events)];
      persistBuffer(this.currentUserId(), all);
    }, PERSIST_DEBOUNCE_MS);
  }

  private handlePageHide = (): void => {
    if (!this.enabled) return;
    this.log("session_end", { reason: "unload" });
    const all = [...this.queue, ...this.retry.flatMap((b) => b.events)];
    this.queue = [];
    this.retry = [];
    if (all.length > 0) {
      const ok = sendBeaconBatch(all);
      // If the beacon couldn't fire (no token / unsupported), keep them persisted
      // so they re-send on next load.
      if (!ok) persistBuffer(this.currentUserId(), all);
    }
  };

  private handleVisibilityChange = (): void => {
    const hidden = this.isHidden();
    this.visibilityListeners.forEach((cb) => cb(hidden));
    if (hidden) this.flush("manual"); // opportunistic flush when backgrounded
  };
}

export const studyLogger = new StudyLogger();
export type { StudyLogger };
