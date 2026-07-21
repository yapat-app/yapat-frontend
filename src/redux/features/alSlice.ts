/** PAM Active Learning slice (backed by /api/pam-al/* endpoints). */

import {
  createSlice,
  createAsyncThunk,
  current,
  isDraft,
} from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { alApi } from "../../services/alApi";
import { getErrorMessage } from "../../services/api";
import type {
  ALState,
  VisibilityFilterState,
  ColorFilterState,
  PAMPrediction,
  FeedbackPayload,
  FeedbackResponse,
  FeedbackAction,
  PAMRetrainRequest,
  PAMRetrainJobDispatch,
  PAMRetrainJobStatus,
  ALColorBy,
  SamplingMethod,
  PAMRunInferenceRequest,
  PAMTrainFromScratchRequest,
  PAMFeedbackCountResponse,
  PAMSuggestionStrategy,
  PAMInferenceResult,
} from "../../types/al";
import { isInferenceJobDispatch } from "../../types/al";
import type { Annotation, Snippet } from "../../types";
import {
  annotationDisplayLabel,
  applyClassicLabelScores,
  buildClassicFeedback,
  snippetsToPredictions,
} from "../../utils/classicFeedSync";
import { aggregateConfidence } from "../../utils/aggregateConfidence";

// Default retrain threshold (kept in sync with backend when available).
const RETRAIN_THRESHOLD = 10;
const STORAGE_KEY = "yapat_al_last_feed";
const MAX_PERSISTED_PREDICTIONS = 5000;

// ── Persistence helpers ───────────────────────────────────────────────────

interface PersistedFeed {
  predictions: PAMPrediction[];
  modelInfo: Record<string, unknown>;
  totalScored: number;
  modelCheckpointId: number | null;
  modelFamilyName: string | null;
  usedCheckpointId: number | null;
  snippetSetId: number | null;
  embeddingModelId: number | null;
  inferenceK: number;
  selectedDatasetId: number | null;
  lastInferenceAt: string;
  /** Whether the last run used top-K suggestions vs the full scored set. */
  sampleSuggestion?: boolean;
  suggestionStrategy?: PAMSuggestionStrategy;
  labelScope?: string[];
  minConfidence?: number;
  /** True when predictions were too large to store in localStorage. */
  predictionsTruncated?: boolean;
  /** Per-snippet annotation/skip state — restored on re-login so done work is not lost. */
  feedbacks?: Record<number, FeedbackResponse>;
  /** Selected snippet IDs (multi-select queue) to restore on refresh. */
  selectedSnippetIds?: number[];
  /** Currently active (scroll-synced) snippet to restore on refresh. */
  activeSnippetId?: number | null;
}

// True when a stored full-prediction feed contains FEWER rows than it claims
// to have scored — i.e. a corrupted/partial save (e.g. 5 rows persisted while
// modelInfo says returned_count=93378). Such a feed must be re-fetched from the
// server rather than shown as-is, otherwise the user is stuck looking at a
// truncated subset that survives page refreshes (localStorage isn't cleared by
// a refresh). Suggestions feeds are intentionally small (top-K), so they're
// exempt; explicitly-truncated feeds are handled by needsServerRestore.
function persistedFeedRowsIncomplete(saved: PersistedFeed | null): boolean {
  if (!saved || saved.predictionsTruncated) return false;
  const stored = saved.predictions?.length ?? 0;
  if (stored === 0) return false;
  if (saved.modelInfo?.mode !== "predictions") return false;
  const returned = saved.modelInfo?.returned_count;
  const claimed =
    typeof returned === "number" ? returned : (saved.totalScored ?? 0);
  return claimed > stored;
}

function needsServerRestore(saved: PersistedFeed | null): boolean {
  if (!saved) return false;
  if (saved.predictionsTruncated) return true;
  if (persistedFeedRowsIncomplete(saved)) return true;
  if ((saved.predictions?.length ?? 0) > 0) return false;
  return (saved.totalScored ?? 0) > 0 && Boolean(saved.lastInferenceAt);
}

function buildRestoreInferenceRequest(
  state: ALState,
  saved: PersistedFeed,
): PAMRunInferenceRequest | null {
  const datasetId = normalizeDatasetId(
    state.selectedDatasetId ?? saved.selectedDatasetId,
  );
  // Only use the saved snippetSetId when it belongs to the same dataset as the
  // current session. Using a snippetSetId from a different dataset (e.g. the
  // last saved feed was for dataset B but we are now restoring dataset A) would
  // cause the backend to run inference on the wrong dataset's snippets.
  const savedDatasetId = normalizeDatasetId(saved.selectedDatasetId);
  const snippetSetId =
    state.snippetSetId ??
    (savedDatasetId !== null && savedDatasetId === datasetId
      ? saved.snippetSetId
      : null);
  const modelFamilyName = state.modelFamilyName ?? saved.modelFamilyName;
  if (datasetId === null || snippetSetId === null || !modelFamilyName) {
    return null;
  }

  const sampleSuggestion =
    saved.sampleSuggestion ??
    (saved.modelInfo?.mode as string | undefined) === "suggestions";

  const body: PAMRunInferenceRequest = {
    dataset_id: datasetId,
    snippet_set_id: snippetSetId,
    model_family_name: modelFamilyName,
    sample_suggestion: sampleSuggestion,
  };

  if (sampleSuggestion) {
    body.k = saved.inferenceK ?? state.inferenceK;
    body.suggestion_strategy = (saved.suggestionStrategy ??
      state.samplingMethod) as PAMSuggestionStrategy;
    if (saved.labelScope?.length) {
      body.label_scope = saved.labelScope;
    }
    if (saved.minConfidence != null && saved.minConfidence > 0) {
      body.min_confidence = saved.minConfidence;
    }
  }

  return body;
}

function withDisplayFields(
  rows: PAMPrediction[],
  labelScope?: string[] | null,
): PAMPrediction[] {
  return rows.map((r) => {
    const probs = r.predicted_probabilities ?? undefined;
    let bestLabel = r.predicted_labels?.[0] ?? "—";
    let bestProb = 0;
    if (probs && typeof probs === "object") {
      for (const [label, p] of Object.entries(probs)) {
        if (typeof p === "number" && p > bestProb) {
          bestProb = p;
          bestLabel = label;
        }
      }
    }
    const scopedConfidence = aggregateConfidence(probs, labelScope);
    const confidence =
      labelScope?.length && scopedConfidence > 0
        ? scopedConfidence
        : Number.isFinite(bestProb) && bestProb > 0
          ? bestProb
          : (r.confidence ?? 0);
    const mergedScores = {
      ...(r.scores ?? {}),
      // Ensure sampler score keys exist for filtering/coloring.
      uncertainty: r.uncertainty ?? (r.scores as any)?.uncertainty ?? undefined,
      diversity: r.diversity ?? (r.scores as any)?.diversity ?? undefined,
      density: r.density ?? (r.scores as any)?.density ?? undefined,
      composite: r.composite_score ?? (r.scores as any)?.composite ?? undefined,
      confidence: confidence > 0 ? confidence : undefined,
    };
    return {
      ...r,
      predicted_label: r.predicted_label ?? bestLabel,
      confidence,
      ranking_score: r.ranking_score ?? r.composite_score ?? null,
      scores: mergedScores,
    };
  });
}

// Per-dataset persistence: each dataset's feed is stored under its own key so
// that switching between datasets restores the right feed. This matters most
// for no-checkpoint datasets, whose feed is a random sample that the backend
// re-rolls (and does NOT store server-side) on every call — the only durable
// copy is here in localStorage. STORAGE_KEY is kept as a legacy "last feed"
// mirror so the no-dataset-in-URL restore path still works.
function feedStorageKey(datasetId: number): string {
  return `${STORAGE_KEY}_ds_${datasetId}`;
}

function writeFeed(perKey: string | null, data: PersistedFeed): void {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, json);
    if (perKey) localStorage.setItem(perKey, json);
  } catch {
    // Ignore persistence errors (e.g. storage quota).
  }
}

function removeFeed(datasetId: number | string | null | undefined): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    const n = normalizeDatasetId(datasetId ?? null);
    if (n !== null) localStorage.removeItem(feedStorageKey(n));
  } catch {
    // Ignore storage errors.
  }
}

let _saveFeedTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingSave: { perKey: string | null; data: PersistedFeed } | null = null;

function saveFeed(
  state: ALState,
  inferenceRequest?: PAMRunInferenceRequest,
): void {
  // Unwrap the Immer draft to a plain snapshot before the debounce timer fires —
  // draft proxies are revoked once the reducer finalizes, so a deferred
  // JSON.stringify over draft sub-objects would throw and silently lose the save.
  state = isDraft(state) ? current(state) : state;

  const datasetId = normalizeDatasetId(state.selectedDatasetId);
  const perKey = datasetId !== null ? feedStorageKey(datasetId) : null;

  const tooLarge = state.predictions.length > MAX_PERSISTED_PREDICTIONS;
  const sampleSuggestion =
    inferenceRequest?.sample_suggestion ??
    (state.modelInfo?.mode as string | undefined) === "suggestions";
  const data: PersistedFeed = {
    predictions: tooLarge ? [] : state.predictions,
    modelInfo: state.modelInfo,
    totalScored: state.totalScored,
    modelCheckpointId: state.modelCheckpointId,
    modelFamilyName: state.modelFamilyName,
    usedCheckpointId: state.usedCheckpointId,
    snippetSetId: state.snippetSetId,
    embeddingModelId: state.embeddingModelId,
    inferenceK: state.inferenceK,
    selectedDatasetId: state.selectedDatasetId,
    lastInferenceAt: state.lastInferenceAt ?? new Date().toISOString(),
    sampleSuggestion,
    suggestionStrategy:
      inferenceRequest?.suggestion_strategy ?? state.samplingMethod,
    labelScope: inferenceRequest?.label_scope,
    minConfidence: inferenceRequest?.min_confidence,
    predictionsTruncated: tooLarge,
    feedbacks: state.feedbacks,
    selectedSnippetIds: state.selectedSnippetIds,
    activeSnippetId: state.activeSnippetId,
  };

  // Debounce rapid saves (e.g. 10 feedbacks in a row) into one write. But if a
  // pending save targets a DIFFERENT dataset, flush it first — otherwise
  // resetting the timer below would drop that dataset's save entirely.
  if (_pendingSave && _pendingSave.perKey !== perKey) {
    if (_saveFeedTimer !== null) {
      clearTimeout(_saveFeedTimer);
      _saveFeedTimer = null;
    }
    writeFeed(_pendingSave.perKey, _pendingSave.data);
    _pendingSave = null;
  }

  if (_saveFeedTimer !== null) clearTimeout(_saveFeedTimer);
  _pendingSave = { perKey, data };
  _saveFeedTimer = setTimeout(() => {
    _saveFeedTimer = null;
    const pending = _pendingSave;
    _pendingSave = null;
    if (pending) writeFeed(pending.perKey, pending.data);
  }, 300);
}

function loadFeed(datasetId?: number | string | null): PersistedFeed | null {
  const normalized = normalizeDatasetId(datasetId ?? null);
  try {
    if (normalized !== null) {
      const perRaw = localStorage.getItem(feedStorageKey(normalized));
      if (perRaw) return JSON.parse(perRaw) as PersistedFeed;
    }
    // Fall back to the legacy single-slot key. When a dataset id was requested,
    // only accept it if it actually belongs to that dataset (a leftover from a
    // pre-per-dataset save); otherwise it's a different dataset's feed.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedFeed;
    if (
      normalized !== null &&
      normalizeDatasetId(parsed?.selectedDatasetId) !== normalized
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeDatasetId(
  id: number | string | null | undefined,
): number | null {
  if (id === null || id === undefined) return null;
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyPersistedMetadata(state: ALState, saved: PersistedFeed): void {
  state.modelInfo = saved.modelInfo ?? {};
  state.totalScored = saved.totalScored ?? 0;
  state.modelCheckpointId = saved.modelCheckpointId ?? null;
  state.modelFamilyName = saved.modelFamilyName ?? null;
  state.usedCheckpointId = saved.usedCheckpointId ?? null;
  state.snippetSetId = saved.snippetSetId ?? null;
  state.embeddingModelId = saved.embeddingModelId ?? null;
  state.inferenceK = saved.inferenceK ?? 20;
  state.lastInferenceAt = saved.lastInferenceAt ?? null;
  state.selectedDatasetId = normalizeDatasetId(saved.selectedDatasetId);
}

function applyPersistedFeed(state: ALState, saved: PersistedFeed): void {
  const rows = withDisplayFields(saved.predictions ?? []);
  state.predictions = rows;
  state.projectionPredictions = rows;
  if (saved.feedbacks && Object.keys(saved.feedbacks).length > 0) {
    state.feedbacks = saved.feedbacks;
    state.predictions = applyClassicLabelScores(
      state.predictions,
      state.feedbacks,
    );
    state.projectionPredictions = state.predictions;
  }
  applyPersistedMetadata(state, saved);

  // Restore selection — keep only IDs that still exist in the prediction set.
  if (state.predictions.length > 0) {
    const predSet = new Set(state.predictions.map((p) => p.snippet_id));
    const restoredIds = (saved.selectedSnippetIds ?? []).filter((id) =>
      predSet.has(id),
    );
    if (restoredIds.length > 0) {
      state.selectedSnippetIds = restoredIds;
      const restoredActive =
        saved.activeSnippetId != null && predSet.has(saved.activeSnippetId)
          ? saved.activeSnippetId
          : restoredIds[0];
      state.activeSnippetId = restoredActive;
    } else {
      // Saved selection is stale (predictions changed) — default to first.
      state.selectedSnippetIds = [state.predictions[0].snippet_id];
      state.activeSnippetId = state.predictions[0].snippet_id;
    }
  }
}

function clearSessionState(state: ALState): void {
  state.feedSource = null;
  state.classicAnnotationsBySnippet = {};
  state.predictions = [];
  state.projectionPredictions = [];
  state.modelInfo = {};
  state.totalScored = 0;
  state.feedbacks = {};
  state.feedbackCount = 0;
  state.lastRetrainDispatch = null;
  state.lastRetrainJob = null;
  state.lastRetrainFailed = false;
  state.selectedSnippetIds = [];
  state.activeSnippetId = null;
  state.modelCheckpointId = null;
  state.modelFamilyName = null;
  state.usedCheckpointId = null;
  state.snippetSetId = null;
  state.embeddingModelId = null;
  state.lastInferenceAt = null;
  state.error = null;
}

/**
 * The dataset_id the URL asks for at store-init time, if any. Read directly
 * from location.search (rather than react-router's useSearchParams, which
 * isn't available this early) so buildInitialState() can tell whether a
 * localStorage-persisted feed actually belongs to the dataset the user is
 * navigating to — mirrors the expectedDatasetId guard in hydrateSavedFeed.
 */
function getUrlDatasetId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("dataset_id");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildInitialState(): ALState {
  const urlDatasetId = getUrlDatasetId();
  const saved = loadFeed(urlDatasetId);
  const savedDatasetId = normalizeDatasetId(saved?.selectedDatasetId ?? null);
  // A saved feed for a *different* dataset than the URL asks for is stale for
  // this navigation — restoring its snippetSetId/modelFamilyName alongside
  // the URL's dataset_id would send a cross-dataset combination the backend
  // rejects ("snippet_set_id=X belongs to dataset_id=Y, not dataset_id=Z").
  const savedMatchesUrl =
    urlDatasetId === null ||
    savedDatasetId === null ||
    urlDatasetId === savedDatasetId;
  const base: ALState = {
    feedSource: null,
    classicAnnotationsBySnippet: {},
    modelCheckpointId: null,
    modelFamilyName: null,
    usedCheckpointId: null,
    snippetSetId: null,
    embeddingModelId: null,
    inferenceK: 20,
    predictions: [],
    projectionPredictions: [],
    modelInfo: {},
    totalScored: 0,
    feedbacks: {},
    feedbackCount: 0,
    retrainPending: false,
    retrainThreshold: RETRAIN_THRESHOLD,
    selectedSnippetIds: [],
    activeSnippetId: null,
    selectedDatasetId: null,
    colorBy: "prediction",
    samplingMethod: "uncertainty",
    alFilters: {
      visibility: {
        propertyKey: null,
        range: [0, 1],
        propertyKeys: [],
        ranges: {},
      },
      color: { propertyKey: null },
    },
    lastRetrainDispatch: null,
    lastRetrainJob: null,
    lastRetrainFailed: false,
    inferenceLoading: false,
    feedbackLoading: false,
    retrainLoading: false,
    error: null,
    lastInferenceAt: null,
    lastPredictionsRequestId: null,
  };

  if (!savedMatchesUrl) {
    // The URL asks for a different dataset than the persisted feed belongs
    // to — start clean with the URL's dataset selected rather than seeding
    // the store with another dataset's snippetSetId/modelFamilyName. The
    // usual URL-driven effects (see useHubALSession) then load this
    // dataset's own feed normally.
    base.selectedDatasetId = urlDatasetId;
  } else if (saved && needsServerRestore(saved)) {
    // Covers truncated feeds AND partial/corrupted saves (fewer rows than
    // claimed) — restore metadata so the server-restore effect re-fetches.
    applyPersistedMetadata(base, saved);
  } else if (saved && (saved.predictions?.length ?? 0) > 0) {
    applyPersistedFeed(base, saved);
  } else if (saved) {
    base.selectedDatasetId = normalizeDatasetId(saved.selectedDatasetId);
    base.modelCheckpointId = saved.modelCheckpointId ?? null;
    base.modelFamilyName = saved.modelFamilyName ?? null;
    base.usedCheckpointId = saved.usedCheckpointId ?? null;
    base.snippetSetId = saved.snippetSetId ?? null;
    base.embeddingModelId = saved.embeddingModelId ?? null;
    base.inferenceK = saved.inferenceK ?? 20;
    base.lastInferenceAt = saved.lastInferenceAt ?? null;
    base.modelInfo = saved.modelInfo ?? {};
    base.totalScored = saved.totalScored ?? 0;
  }

  return base;
}

// Rehydrate state from localStorage.
const initialState: ALState = buildInitialState();

// ── Thunks ────────────────────────────────────────────────────────────────

export const runInference = createAsyncThunk(
  "al/runInference",
  async (body: PAMRunInferenceRequest, { rejectWithValue }) => {
    try {
      return await alApi.runInference(body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

/**
 * Fetch a small batch of fresh suggestions after a retrain and APPEND them to
 * the existing predictions (Phase 1 scrollable feed only). A divider sentinel
 * is inserted between the old and new predictions so the feed renders a visual
 * "Model updated" marker without replacing or scrolling the current view.
 */
export const fetchAndAppendSuggestions = createAsyncThunk(
  "al/fetchAndAppendSuggestions",
  async (body: PAMRunInferenceRequest, { rejectWithValue }) => {
    try {
      const result = await alApi.runInference(body);
      if (isInferenceJobDispatch(result)) {
        return rejectWithValue(
          "Background job started — cannot append in this state",
        );
      }
      return result as PAMInferenceResult;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const submitFeedback = createAsyncThunk(
  "al/submitFeedback",
  async (payload: FeedbackPayload, { rejectWithValue }) => {
    try {
      return await alApi.postFeedback(payload);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const triggerRetrain = createAsyncThunk(
  "al/triggerRetrain",
  async (body: PAMRetrainRequest, { rejectWithValue }) => {
    try {
      return await alApi.triggerRetrain(body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const trainFromScratch = createAsyncThunk(
  "al/trainFromScratch",
  async (body: PAMTrainFromScratchRequest, { rejectWithValue }) => {
    try {
      return await alApi.trainFromScratch(body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const pollRetrainJob = createAsyncThunk(
  "al/pollRetrainJob",
  async (jobId: number, { rejectWithValue }) => {
    try {
      return await alApi.getRetrainJob(jobId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const restoreFeedFromServer = createAsyncThunk(
  "al/restoreFeedFromServer",
  async (_, { getState, rejectWithValue }) => {
    const state = (getState() as { al: ALState }).al;
    if (state.predictions.length > 0) {
      return null;
    }

    const saved = loadFeed(state.selectedDatasetId);
    if (!needsServerRestore(saved)) {
      return null;
    }

    const body = buildRestoreInferenceRequest(state, saved!);
    if (!body) {
      return rejectWithValue("Incomplete saved Active Learning session");
    }

    try {
      const data = await alApi.runInference(body);
      if (isInferenceJobDispatch(data)) {
        return rejectWithValue(
          "Predictions are still being generated on the server. Try again shortly.",
        );
      }
      return { data, request: body };
    } catch (error: unknown) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchFeedbackCount = createAsyncThunk(
  "al/fetchFeedbackCount",
  async (
    params: { dataset_id: number; model_family_name: string },
    { rejectWithValue },
  ) => {
    try {
      return await alApi.getFeedbackCount(
        params.dataset_id,
        params.model_family_name,
      );
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

// ── Slice ─────────────────────────────────────────────────────────────────

const alSlice = createSlice({
  name: "al",
  initialState,
  reducers: {
    setSelectedSnippet: (state, action: PayloadAction<number | null>) => {
      state.selectedSnippetIds =
        action.payload !== null ? [action.payload] : [];
      state.activeSnippetId = action.payload;
      saveFeed(state);
    },
    toggleSelectedSnippet: (state, action: PayloadAction<number>) => {
      const id = action.payload;
      const idx = state.selectedSnippetIds.indexOf(id);
      if (idx === -1) {
        state.selectedSnippetIds.push(id);
        // First toggle-in becomes active if nothing is active yet.
        if (state.activeSnippetId === null) state.activeSnippetId = id;
      } else {
        state.selectedSnippetIds.splice(idx, 1);
        // If we removed the active one, fall back to the first remaining.
        if (state.activeSnippetId === id) {
          state.activeSnippetId = state.selectedSnippetIds[0] ?? null;
        }
      }
      saveFeed(state);
    },
    clearSelectedSnippets: (state) => {
      state.selectedSnippetIds = [];
      state.activeSnippetId = null;
      saveFeed(state);
    },
    /** Set the snippet currently visible in the multi-select feed (scroll-driven). */
    setActiveSnippet: (state, action: PayloadAction<number | null>) => {
      state.activeSnippetId = action.payload;
      saveFeed(state);
    },
    setSelectedDataset: (state, action: PayloadAction<number | null>) => {
      const nextId = normalizeDatasetId(action.payload);
      const currentId = normalizeDatasetId(state.selectedDatasetId);
      if (nextId === currentId) return;

      state.selectedDatasetId = nextId;

      // Load THIS dataset's own persisted feed (per-dataset key), not whatever
      // was viewed last. This is what makes a previously-generated feed —
      // including a no-checkpoint random feed that lives only in localStorage —
      // reappear on switch instead of going blank until a refresh.
      const saved = loadFeed(nextId);
      const savedId = normalizeDatasetId(saved?.selectedDatasetId ?? null);
      if (nextId !== null && savedId === nextId && saved) {
        // needsServerRestore first: it also catches partial/corrupted saves
        // (fewer rows than claimed) so we re-fetch instead of showing a subset.
        if (needsServerRestore(saved)) {
          clearSessionState(state);
          state.selectedDatasetId = nextId;
          applyPersistedMetadata(state, saved);
          return;
        }
        if ((saved.predictions?.length ?? 0) > 0) {
          applyPersistedFeed(state, saved);
          return;
        }
      }

      clearSessionState(state);
      state.selectedDatasetId = nextId;
    },
    setInferenceConfig: (
      state,
      action: PayloadAction<{
        modelCheckpointId: number | null;
        modelFamilyName: string;
        snippetSetId: number;
        embeddingModelId: number;
        k?: number;
      }>,
    ) => {
      state.modelCheckpointId = action.payload.modelCheckpointId;
      state.modelFamilyName = action.payload.modelFamilyName;
      state.snippetSetId = action.payload.snippetSetId;
      state.embeddingModelId = action.payload.embeddingModelId;
      if (action.payload.k !== undefined) state.inferenceK = action.payload.k;
    },
    setColorBy: (state, action: PayloadAction<ALColorBy>) => {
      state.colorBy = action.payload;
    },
    setSamplingMethod: (state, action: PayloadAction<SamplingMethod>) => {
      state.samplingMethod = action.payload;
    },
    setVisibilityFilter: (
      state,
      action: PayloadAction<Partial<VisibilityFilterState>>,
    ) => {
      state.alFilters.visibility = {
        ...state.alFilters.visibility,
        ...action.payload,
      };
    },
    setColorFilter: (
      state,
      action: PayloadAction<Partial<ColorFilterState>>,
    ) => {
      state.alFilters.color = { ...state.alFilters.color, ...action.payload };
    },
    /** Multi-property visibility filter helpers. */
    setVisibilityKeys: (state, action: PayloadAction<string[]>) => {
      state.alFilters.visibility.propertyKeys = action.payload;
      state.alFilters.visibility.ranges =
        state.alFilters.visibility.ranges ?? {};
      for (const key of action.payload) {
        if (!state.alFilters.visibility.ranges[key]) {
          state.alFilters.visibility.ranges[key] = [0, 1];
        }
      }
    },
    setVisibilityRangeFor: (
      state,
      action: PayloadAction<{ key: string; range: [number, number] }>,
    ) => {
      const { key, range } = action.payload;
      state.alFilters.visibility.ranges =
        state.alFilters.visibility.ranges ?? {};
      state.alFilters.visibility.ranges[key] = range;
    },
    resetVisibilityFilter: (state) => {
      state.alFilters.visibility = {
        propertyKey: null,
        range: [0, 1],
        propertyKeys: [],
        ranges: {},
      };
    },
    resetFeedbacks: (state) => {
      state.feedbacks = {};
      state.feedbackCount = 0;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearSavedFeed: (state) => {
      const datasetId = state.selectedDatasetId;
      clearSessionState(state);
      state.selectedDatasetId = null;
      removeFeed(datasetId);
    },
    setClassicAnnotationFeed: (
      state,
      action: PayloadAction<{ snippets: Snippet[]; datasetId: number }>,
    ) => {
      const { snippets, datasetId } = action.payload;
      const predictions = snippetsToPredictions(snippets);
      // If the dataset changed, the previous selection no longer belongs to this
      // feed — drop it so we don't keep a stale cross-dataset snippet selected.
      const datasetChanged =
        normalizeDatasetId(state.selectedDatasetId) !==
        normalizeDatasetId(datasetId);
      state.feedSource = "classic";
      state.selectedDatasetId = datasetId;
      state.predictions = predictions;
      state.projectionPredictions = predictions;
      state.modelInfo = { mode: "classic" };
      state.inferenceLoading = false;
      state.error = null;
      if (datasetChanged) {
        // Clear AL-session scoping so the projection derives the embedding model
        // from THIS dataset's snippet set, not a stale value from another dataset.
        state.snippetSetId = null;
        state.embeddingModelId = null;
      }
      // Keep usedCheckpointId so quick labels still load from the same labels.json /
      // checkpoint config as Active Learning (staged behaviour). Classic annotations
      // use feedSource === "classic", not PAM feedback.
      state.feedbacks = {};
      // Select the first snippet when nothing is selected, the dataset changed, or
      // the current selection is no longer part of the new feed.
      const newIds = new Set(predictions.map((p) => p.snippet_id));
      const currentIds = state.selectedSnippetIds;
      const selectionInvalid =
        currentIds.length === 0 ||
        datasetChanged ||
        currentIds.every((id) => !newIds.has(id));
      if (predictions.length > 0 && selectionInvalid) {
        state.selectedSnippetIds = [predictions[0].snippet_id];
        state.activeSnippetId = predictions[0].snippet_id;
      }
    },
    hydrateClassicFeedbacks: (
      state,
      action: PayloadAction<Record<number, FeedbackResponse>>,
    ) => {
      if (state.feedSource !== "classic") return;
      state.feedbacks = { ...state.feedbacks, ...action.payload };
      state.predictions = applyClassicLabelScores(
        state.predictions,
        state.feedbacks,
      );
      state.projectionPredictions = state.predictions;
    },
    hydrateClassicAnnotations: (
      state,
      action: PayloadAction<Record<number, Annotation[]>>,
    ) => {
      state.classicAnnotationsBySnippet = action.payload;
      if (state.feedSource !== "classic") return;
      for (const [snippetIdRaw, annotations] of Object.entries(
        action.payload,
      )) {
        const snippetId = Number(snippetIdRaw);
        if (!Number.isFinite(snippetId)) continue;
        if (annotations.length === 0) {
          delete state.feedbacks[snippetId];
          continue;
        }
        const labels = annotations
          .map(annotationDisplayLabel)
          .filter((name): name is string => Boolean(name));
        if (labels.length === 0) {
          delete state.feedbacks[snippetId];
          continue;
        }
        state.feedbacks[snippetId] = buildClassicFeedback(
          snippetId,
          "MODIFY",
          labels,
        );
      }
      state.predictions = applyClassicLabelScores(
        state.predictions,
        state.feedbacks,
      );
      state.projectionPredictions = state.predictions;
    },
    setClassicSnippetAnnotations: (
      state,
      action: PayloadAction<{ snippetId: number; annotations: Annotation[] }>,
    ) => {
      const { snippetId, annotations } = action.payload;
      // Always keep the canonical per-snippet annotation rows in the store so
      // they survive transient feed toggles or navigation. Only update the
      // derived `feedbacks` and scored `predictions` when we're actively
      // viewing a classic feed; otherwise leave those derived views alone.
      if (annotations.length === 0) {
        delete state.classicAnnotationsBySnippet[snippetId];
      } else {
        state.classicAnnotationsBySnippet[snippetId] = annotations;
      }

      if (state.feedSource !== "classic") return;

      if (annotations.length === 0) {
        delete state.feedbacks[snippetId];
      } else {
        const labels = annotations
          .map(annotationDisplayLabel)
          .filter((name): name is string => Boolean(name));
        state.feedbacks[snippetId] = buildClassicFeedback(
          snippetId,
          labels.length > 0 ? "MODIFY" : "REJECT",
          labels,
        );
      }
      state.predictions = applyClassicLabelScores(
        state.predictions,
        state.feedbacks,
      );
      state.projectionPredictions = state.predictions;
    },
    setClassicSnippetFeedback: (
      state,
      action: PayloadAction<{
        snippetId: number;
        action: FeedbackAction;
        labels: string[];
      }>,
    ) => {
      if (state.feedSource !== "classic") return;
      const { snippetId, action: fbAction, labels } = action.payload;
      state.feedbacks[snippetId] = buildClassicFeedback(
        snippetId,
        fbAction,
        labels,
      );
      state.predictions = applyClassicLabelScores(
        state.predictions,
        state.feedbacks,
      );
      state.projectionPredictions = state.predictions;
    },
    clearClassicAnnotationFeed: (state) => {
      if (state.feedSource !== "classic") return;
      state.feedSource = null;
      state.classicAnnotationsBySnippet = {};
      state.predictions = [];
      state.projectionPredictions = [];
      state.feedbacks = {};
      state.modelInfo = {};
      state.selectedSnippetIds = [];
    },
    clearRetrainDispatch: (state) => {
      state.lastRetrainDispatch = null;
      state.lastRetrainJob = null;
      state.retrainLoading = false;
      // Note: appendPredictionsWithDivider is handled in extraReducers (needs withDisplayFields).
    },
    // Drop a stale AL binding whose snippetSetId doesn't belong to the current
    // dataset (e.g. restored from a corrupted persisted feed). Clearing the
    // inference metadata lets the normal auto-infer / regenerate flow resolve
    // the dataset's own snippet set instead of repeatedly sending a
    // cross-dataset (dataset_id, snippet_set_id) pair the backend rejects.
    resetStaleInferenceBinding: (state) => {
      state.snippetSetId = null;
      state.lastInferenceAt = null;
      state.totalScored = 0;
      state.modelInfo = {};
      // Persist the cleaned binding so the corrupted snippetSetId doesn't come
      // right back from localStorage on the next load.
      saveFeed(state);
    },
    hydrateSavedFeed: (
      state,
      action: PayloadAction<{ expectedDatasetId?: number | null } | undefined>,
    ) => {
      if (state.predictions.length > 0) return;
      const currentId = normalizeDatasetId(state.selectedDatasetId);
      const targetId =
        action?.payload?.expectedDatasetId !== undefined
          ? normalizeDatasetId(action.payload.expectedDatasetId)
          : currentId;
      const saved = loadFeed(targetId);
      if (!saved) return;

      const savedId = normalizeDatasetId(saved.selectedDatasetId);
      // targetId is the dataset we intend to show: explicit payload (from URL)
      // wins, then the dataset already in state. This closes the hole where, on
      // first mount, state.selectedDatasetId is still null and a feed from a
      // *different* dataset would be restored onto the current dataset's view.
      if (targetId !== null && savedId !== null && targetId !== savedId) return;

      // needsServerRestore first: catches truncated AND partial/corrupted saves
      // (fewer rows than claimed) so we re-fetch rather than show a subset.
      if (needsServerRestore(saved)) {
        applyPersistedMetadata(state, saved);
        return;
      }

      if ((saved.predictions?.length ?? 0) > 0) {
        applyPersistedFeed(state, saved);
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(runInference.pending, (state, action) => {
      state.inferenceLoading = true;
      state.error = null;
      state.lastPredictionsRequestId = action.meta.requestId;
    });
    builder.addCase(runInference.fulfilled, (state, action) => {
      const request = action.meta.arg as PAMRunInferenceRequest;
      state.inferenceLoading = false;

      // Discard stale responses: if the user switched datasets while this
      // request was in flight, applying it would overwrite
      // snippetSetId/selectedDatasetId with the previous dataset's values,
      // and the next request would send a cross-dataset snippet_set_id
      // that the backend rejects.
      const currentDatasetId = normalizeDatasetId(state.selectedDatasetId);
      const requestDatasetId = normalizeDatasetId(request.dataset_id);
      if (currentDatasetId !== null && currentDatasetId !== requestDatasetId) {
        return;
      }

      // Discard out-of-order responses: several effects (auto-infer,
      // restore-from-server, mode-switch reload) can each dispatch a
      // predictions-fetching request for the same dataset in quick
      // succession. Only apply the response if no newer such request has
      // been dispatched since — otherwise a slower-resolving earlier
      // request (e.g. one with fewer/empty rows) can clobber a
      // later request's already-applied good data.
      if (action.meta.requestId !== state.lastPredictionsRequestId) {
        return;
      }

      const payload = action.payload;

      // Sync inference failed on the server; predictions are being built on pam_al worker.
      if (isInferenceJobDispatch(payload)) {
        state.lastRetrainDispatch = payload;
        state.lastRetrainJob = null;
        state.retrainLoading = true;
        state.error = null;
        state.selectedDatasetId = request.dataset_id;
        return;
      }

      const result: PAMInferenceResult = payload;
      state.modelFamilyName = result.model_family_name;
      state.usedCheckpointId = result.used_checkpoint_id;
      const labelScope = result.label_scope ?? request.label_scope ?? null;
      state.modelInfo = {
        mode: result.mode,
        suggestion_strategy: result.suggestion_strategy,
        returned_count: result.returned_count,
        total_predictions: result.total_predictions,
        used_checkpoint_id: result.used_checkpoint_id,
        label_scope: labelScope,
      };
      state.totalScored = result.total_predictions;
      state.feedSource = "pam";
      state.predictions = withDisplayFields(result.rows, labelScope);
      state.lastInferenceAt = new Date().toISOString();
      state.selectedDatasetId = request.dataset_id;
      // Persist the snippet set used for inference so the projection view can
      // derive the correct FPV embedding model. Auto-inference paths (mode-switch
      // etc.) don't call setInferenceConfig, so we capture it here too.
      if (request.snippet_set_id != null) {
        state.snippetSetId = request.snippet_set_id;
      }
      state.retrainLoading = false;
      // Always update projection snapshot so colour/score overlays stay in sync
      // when switching between modes (AL ↔ validate) or after a retrain.
      state.projectionPredictions = state.predictions;

      // Auto-select the first prediction if nothing is selected or the current
      // selection is no longer in the new prediction set (e.g. after a mode switch).
      const newIds = new Set(state.predictions.map((p) => p.snippet_id));
      if (
        state.predictions.length > 0 &&
        (state.selectedSnippetIds.length === 0 ||
          state.selectedSnippetIds.every((id) => !newIds.has(id)))
      ) {
        state.selectedSnippetIds = [state.predictions[0].snippet_id];
        state.activeSnippetId = state.predictions[0].snippet_id;
      }
      saveFeed(state, request);
    });
    builder.addCase(runInference.rejected, (state, action) => {
      state.inferenceLoading = false;
      const message = action.payload as string;
      state.error = message;

      // See the identical self-heal in restoreFeedFromServer.rejected: a
      // stale snippetSetId (e.g. read directly from redux by the mode-switch
      // reload effect) can be sent alongside the correct dataset_id. Clear
      // it so a retry resolves a fresh, correctly-scoped snippet set instead
      // of repeating the same rejected combination forever.
      if (
        typeof message === "string" &&
        /belongs to dataset_id=/.test(message)
      ) {
        // Clear only the stale IN-MEMORY snippet-set binding so a retry can
        // resolve a fresh, correctly-scoped one. Do NOT delete the persisted
        // feed: a no-checkpoint dataset's feed lives ONLY in localStorage
        // (the server re-rolls it and never stores it), so removing it here
        // would permanently destroy a still-valid feed on a transient error.
        state.snippetSetId = null;
      }
    });

    builder.addCase(restoreFeedFromServer.pending, (state, action) => {
      state.inferenceLoading = true;
      state.error = null;
      state.lastPredictionsRequestId = action.meta.requestId;
    });
    builder.addCase(restoreFeedFromServer.fulfilled, (state, action) => {
      if (!action.payload) {
        state.inferenceLoading = false;
        return;
      }
      state.inferenceLoading = false;

      if (action.meta.requestId !== state.lastPredictionsRequestId) {
        return;
      }

      const { data: restored, request } = action.payload;
      const currentDatasetId = normalizeDatasetId(state.selectedDatasetId);
      const requestDatasetId = normalizeDatasetId(request.dataset_id);
      if (currentDatasetId !== null && currentDatasetId !== requestDatasetId) {
        return;
      }
      const saved = loadFeed(request.dataset_id);
      state.modelFamilyName = restored.model_family_name;
      state.usedCheckpointId = restored.used_checkpoint_id;
      const restoredScope =
        restored.label_scope ??
        (saved?.labelScope?.length ? saved.labelScope : null);
      state.modelInfo = {
        mode: restored.mode,
        suggestion_strategy: restored.suggestion_strategy,
        returned_count: restored.returned_count,
        total_predictions: restored.total_predictions,
        used_checkpoint_id: restored.used_checkpoint_id,
        label_scope: restoredScope,
      };
      state.totalScored = restored.total_predictions;
      state.predictions = withDisplayFields(restored.rows, restoredScope);
      if (state.projectionPredictions.length === 0) {
        state.projectionPredictions = state.predictions;
      }
      state.selectedDatasetId = request.dataset_id;
      // Restore selection from localStorage — keep only IDs still in predictions.
      if (
        state.predictions.length > 0 &&
        state.selectedSnippetIds.length === 0
      ) {
        const predSet = new Set(state.predictions.map((p) => p.snippet_id));
        const restoredIds = (saved?.selectedSnippetIds ?? []).filter((id) =>
          predSet.has(id),
        );
        if (restoredIds.length > 0) {
          state.selectedSnippetIds = restoredIds;
          const restoredActive =
            saved?.activeSnippetId != null && predSet.has(saved.activeSnippetId)
              ? saved.activeSnippetId
              : restoredIds[0];
          state.activeSnippetId = restoredActive;
        } else {
          state.selectedSnippetIds = [state.predictions[0].snippet_id];
          state.activeSnippetId = state.predictions[0].snippet_id;
        }
      }
      saveFeed(state, request);
    });
    builder.addCase(restoreFeedFromServer.rejected, (state, action) => {
      state.inferenceLoading = false;
      const message = action.payload as string;
      state.error = message;

      // Self-heal from a corrupted persisted feed: a stale snippetSetId can
      // get bundled with the *current* selectedDatasetId in localStorage
      if (
        typeof message === "string" &&
        /belongs to dataset_id=/.test(message)
      ) {
        state.snippetSetId = null;
      }
    });

    builder.addCase(
      fetchFeedbackCount.fulfilled,
      (state, action: PayloadAction<PAMFeedbackCountResponse>) => {
        // Keep threshold in sync with backend.
        if (
          Number.isFinite(action.payload.retrain_after) &&
          action.payload.retrain_after > 0
        ) {
          state.retrainThreshold = action.payload.retrain_after;
        }
        // Don't overwrite a locally-reset counter while a retrain is in progress.
        if (state.retrainLoading) return;
        state.feedbackCount = action.payload.feedback_count_since_retrain;
        state.retrainPending = Boolean(action.payload.retrain_pending);
      },
    );

    builder.addCase(submitFeedback.pending, (state) => {
      state.feedbackLoading = true;
    });
    builder.addCase(
      submitFeedback.fulfilled,
      (state, action: PayloadAction<FeedbackResponse>) => {
        state.feedbackLoading = false;
        const fb = action.payload;
        state.feedbacks[fb.snippet_id] = fb;

        // When the backend reports auto-retrain, treat it as already dispatched.
        if (
          fb.retrain_triggered &&
          fb.auto_retrain_job_id &&
          fb.auto_retrain_checkpoint_id
        ) {
          // Reset counter locally while the new checkpoint job is pending.
          state.feedbackCount = 0;
          state.feedbacks = {};
          state.retrainLoading = true;
          state.lastRetrainFailed = false;
          state.lastRetrainDispatch = {
            job_id: fb.auto_retrain_job_id,
            checkpoint_id: fb.auto_retrain_checkpoint_id,
            status: "PENDING",
            message: `Auto-retrain job ${fb.auto_retrain_job_id} dispatched`,
          };
          state.lastRetrainJob = null;
        } else {
          state.feedbackCount = fb.feedback_count_since_retrain;
          // Surface failed retrain state so UI can prompt for manual retry.
          if (fb.last_retrain_failed) {
            state.lastRetrainFailed = true;
          }
        }
        // Persist updated feedbacks so annotations survive a page refresh.
        saveFeed(state);
      },
    );
    builder.addCase(submitFeedback.rejected, (state) => {
      state.feedbackLoading = false;
      // Keep `state.error` reserved for inference/job failures.
    });

    builder.addCase(triggerRetrain.pending, (state) => {
      state.retrainLoading = true;
    });
    builder.addCase(
      triggerRetrain.fulfilled,
      (state, action: PayloadAction<PAMRetrainJobDispatch>) => {
        // Keep retrainLoading=true until polling reports a terminal state.
        state.lastRetrainDispatch = action.payload;
        state.lastRetrainJob = null;
        state.lastRetrainFailed = false;
        state.feedbackCount = 0;
        state.feedbacks = {};
        // Snapshot current predictions for projection view.
        state.projectionPredictions = state.predictions;
      },
    );
    builder.addCase(triggerRetrain.rejected, (state, action) => {
      state.retrainLoading = false;
      state.error = action.payload as string;
    });

    builder.addCase(trainFromScratch.pending, (state) => {
      state.retrainLoading = true;
      state.error = null;
    });
    builder.addCase(
      trainFromScratch.fulfilled,
      (state, action: PayloadAction<PAMRetrainJobDispatch>) => {
        // Keep retrainLoading=true until polling reports a terminal state.
        state.lastRetrainDispatch = action.payload;
        state.lastRetrainJob = null;
        // Clear counters for a fresh run.
        state.feedbackCount = 0;
        state.feedbacks = {};
      },
    );
    builder.addCase(trainFromScratch.rejected, (state, action) => {
      state.retrainLoading = false;
      state.error = action.payload as string;
    });

    builder.addCase(
      pollRetrainJob.fulfilled,
      (state, action: PayloadAction<PAMRetrainJobStatus>) => {
        state.lastRetrainJob = action.payload;
        if (
          action.payload.status === "COMPLETED" ||
          action.payload.status === "FAILED"
        ) {
          state.retrainLoading = false;
          state.lastRetrainFailed = action.payload.status === "FAILED";
        }
      },
    );
    builder.addCase(pollRetrainJob.rejected, (state, action) => {
      // Network error while polling — treat as a failed retrain so the UI
      // shows the warning banner and the user can retry manually.
      state.retrainLoading = false;
      state.lastRetrainFailed = true;
      state.error = action.payload as string;
    });

    builder.addCase(fetchAndAppendSuggestions.fulfilled, (state, action) => {
      const result = action.payload;
      const labelScope = result.label_scope ?? null;
      const newRows = withDisplayFields(result.rows, labelScope);

      // Filter out snippet IDs already present in the feed (including dividers).
      const existingIds = new Set(
        state.predictions.filter((p) => !p._isDivider).map((p) => p.snippet_id),
      );
      const freshRows = newRows.filter((p) => !existingIds.has(p.snippet_id));
      if (freshRows.length === 0) return;

      // Use a negative timestamp so each retrain gets a unique divider key.
      const divider: PAMPrediction = {
        _isDivider: true,
        snippet_id: -Date.now(),
        id: null,
        model_checkpoint_id: null,
        predicted_labels: null,
        predicted_label: null,
        confidence: null,
        ranking_score: null,
        created_at: null,
      };

      state.predictions = [...state.predictions, divider, ...freshRows];
      // Update the timestamp so the toolbar shows when the feed was last refreshed,
      // not the stale initial-inference time.
      state.lastInferenceAt = new Date().toISOString();
      // Persist the combined feed so a reload after retrain keeps the new snippets.
      saveFeed(state);
      // projectionPredictions intentionally not updated — the projection overlay
      // stays stable so Phase 1 users are not visually disrupted.
    });
    builder.addCase(fetchAndAppendSuggestions.rejected, () => {
      // Silently ignore — the existing feed is unaffected.
    });
  },
});

export const {
  setSelectedSnippet,
  toggleSelectedSnippet,
  clearSelectedSnippets,
  setActiveSnippet,
  setSelectedDataset,
  setInferenceConfig,
  setColorBy,
  setSamplingMethod,
  setVisibilityFilter,
  setColorFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
  resetVisibilityFilter,
  resetFeedbacks,
  clearError,
  clearSavedFeed,
  hydrateSavedFeed,
  setClassicAnnotationFeed,
  hydrateClassicFeedbacks,
  hydrateClassicAnnotations,
  setClassicSnippetAnnotations,
  setClassicSnippetFeedback,
  clearClassicAnnotationFeed,
  clearRetrainDispatch,
  resetStaleInferenceBinding,
} = alSlice.actions;

export { needsServerRestore };
export default alSlice.reducer;
