/** PAM Active Learning slice (backed by /api/pam-al/* endpoints). */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
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
} from "../../types/al";
import type { Annotation, Snippet } from "../../types";
import {
  applyClassicLabelScores,
  buildClassicFeedback,
  snippetsToPredictions,
} from "../../utils/classicFeedSync";

// Default retrain threshold (kept in sync with backend when available).
const RETRAIN_THRESHOLD = 9;
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
  /** True when predictions were too large to store in localStorage. */
  predictionsTruncated?: boolean;
}

function needsServerRestore(saved: PersistedFeed | null): boolean {
  if (!saved) return false;
  if ((saved.predictions?.length ?? 0) > 0) return false;
  if (saved.predictionsTruncated) return true;
  return (saved.totalScored ?? 0) > 0 && Boolean(saved.lastInferenceAt);
}

function buildRestoreInferenceRequest(
  state: ALState,
  saved: PersistedFeed,
): PAMRunInferenceRequest | null {
  const datasetId = normalizeDatasetId(
    state.selectedDatasetId ?? saved.selectedDatasetId,
  );
  const snippetSetId = state.snippetSetId ?? saved.snippetSetId;
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
  }

  return body;
}

function withDisplayFields(rows: PAMPrediction[]): PAMPrediction[] {
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
    const confidence = Number.isFinite(bestProb) && bestProb > 0 ? bestProb : r.confidence ?? 0;
    const mergedScores = {
      ...(r.scores ?? {}),
  // Ensure sampler score keys exist for filtering/coloring.
      uncertainty: (r.uncertainty ?? (r.scores as any)?.uncertainty) ?? undefined,
      diversity: (r.diversity ?? (r.scores as any)?.diversity) ?? undefined,
      density: (r.density ?? (r.scores as any)?.density) ?? undefined,
      composite: (r.composite_score ?? (r.scores as any)?.composite) ?? undefined,
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

function saveFeed(state: ALState, inferenceRequest?: PAMRunInferenceRequest): void {
  try {
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
      predictionsTruncated: tooLarge,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore persistence errors (e.g. storage quota).
  }
}

function loadFeed(): PersistedFeed | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedFeed) : null;
  } catch {
    return null;
  }
}

function normalizeDatasetId(id: number | string | null | undefined): number | null {
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
  applyPersistedMetadata(state, saved);
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
  state.selectedSnippetId = null;
  state.selectedPredictionId = null;
  state.modelCheckpointId = null;
  state.modelFamilyName = null;
  state.usedCheckpointId = null;
  state.snippetSetId = null;
  state.embeddingModelId = null;
  state.lastInferenceAt = null;
  state.error = null;
}

function buildInitialState(): ALState {
  const saved = loadFeed();
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
    selectedSnippetId: null,
    selectedPredictionId: null,
    selectedDatasetId: null,
    colorBy: "prediction",
    samplingMethod: "uncertainty",
    alFilters: {
      visibility: { propertyKey: null, range: [0, 1], propertyKeys: [], ranges: {} },
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
  };

  if (saved && (saved.predictions?.length ?? 0) > 0) {
    applyPersistedFeed(base, saved);
  } else if (saved && needsServerRestore(saved)) {
    applyPersistedMetadata(base, saved);
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

    const saved = loadFeed();
    if (!needsServerRestore(saved)) {
      return null;
    }

    const body = buildRestoreInferenceRequest(state, saved!);
    if (!body) {
      return rejectWithValue("Incomplete saved Active Learning session");
    }

    try {
      return await alApi.runInference(body);
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
      return await alApi.getFeedbackCount(params.dataset_id, params.model_family_name);
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
      state.selectedSnippetId = action.payload;
      if (action.payload !== null) {
        const pred = state.predictions.find(
          (p) => p.snippet_id === action.payload,
        );
        state.selectedPredictionId = pred?.id ?? null;
      } else {
        state.selectedPredictionId = null;
      }
    },
    setSelectedDataset: (state, action: PayloadAction<number | null>) => {
      const nextId = normalizeDatasetId(action.payload);
      const currentId = normalizeDatasetId(state.selectedDatasetId);
      if (nextId === currentId) return;

      state.selectedDatasetId = nextId;

      const saved = loadFeed();
      const savedId = normalizeDatasetId(saved?.selectedDatasetId ?? null);
      if (nextId !== null && savedId === nextId && saved) {
        if ((saved.predictions?.length ?? 0) > 0) {
          applyPersistedFeed(state, saved);
          return;
        }
        if (needsServerRestore(saved)) {
          applyPersistedMetadata(state, saved);
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
    setVisibilityFilter: (state, action: PayloadAction<Partial<VisibilityFilterState>>) => {
      state.alFilters.visibility = { ...state.alFilters.visibility, ...action.payload };
    },
    setColorFilter: (state, action: PayloadAction<Partial<ColorFilterState>>) => {
      state.alFilters.color = { ...state.alFilters.color, ...action.payload };
    },
    /** Multi-property visibility filter helpers. */
    setVisibilityKeys: (state, action: PayloadAction<string[]>) => {
      state.alFilters.visibility.propertyKeys = action.payload;
      state.alFilters.visibility.ranges = state.alFilters.visibility.ranges ?? {};
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
      state.alFilters.visibility.ranges = state.alFilters.visibility.ranges ?? {};
      state.alFilters.visibility.ranges[key] = range;
    },
    resetVisibilityFilter: (state) => {
      state.alFilters.visibility = { propertyKey: null, range: [0, 1], propertyKeys: [], ranges: {} };
    },
    resetFeedbacks: (state) => {
      state.feedbacks = {};
      state.feedbackCount = 0;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearSavedFeed: (state) => {
      clearSessionState(state);
      state.selectedDatasetId = null;
      localStorage.removeItem(STORAGE_KEY);
    },
    setClassicAnnotationFeed: (
      state,
      action: PayloadAction<{ snippets: Snippet[]; datasetId: number }>,
    ) => {
      const { snippets, datasetId } = action.payload;
      const predictions = snippetsToPredictions(snippets);
      state.feedSource = "classic";
      state.selectedDatasetId = datasetId;
      state.predictions = predictions;
      state.projectionPredictions = predictions;
      state.modelInfo = { mode: "classic" };
      state.inferenceLoading = false;
      state.error = null;
      // Keep usedCheckpointId so quick labels still load from the same labels.json /
      // checkpoint config as Active Learning (staged behaviour). Classic annotations
      // use feedSource === "classic", not PAM feedback.
      state.feedbacks = {};
      if (predictions.length > 0 && state.selectedSnippetId === null) {
        state.selectedSnippetId = predictions[0].snippet_id;
      }
    },
    hydrateClassicFeedbacks: (
      state,
      action: PayloadAction<Record<number, FeedbackResponse>>,
    ) => {
      if (state.feedSource !== "classic") return;
      state.feedbacks = { ...state.feedbacks, ...action.payload };
      state.predictions = applyClassicLabelScores(state.predictions, state.feedbacks);
      state.projectionPredictions = state.predictions;
    },
    hydrateClassicAnnotations: (
      state,
      action: PayloadAction<Record<number, Annotation[]>>,
    ) => {
      if (state.feedSource !== "classic") return;
      state.classicAnnotationsBySnippet = {
        ...state.classicAnnotationsBySnippet,
        ...action.payload,
      };
    },
    setClassicSnippetAnnotations: (
      state,
      action: PayloadAction<{ snippetId: number; annotations: Annotation[] }>,
    ) => {
      if (state.feedSource !== "classic") return;
      const { snippetId, annotations } = action.payload;
      if (annotations.length === 0) {
        delete state.classicAnnotationsBySnippet[snippetId];
        delete state.feedbacks[snippetId];
      } else {
        state.classicAnnotationsBySnippet[snippetId] = annotations;
        const labels = annotations
          .map((a) => a.resolved_name_snapshot?.trim())
          .filter((name): name is string => Boolean(name));
        state.feedbacks[snippetId] = buildClassicFeedback(
          snippetId,
          labels.length > 0 ? "MODIFY" : "REJECT",
          labels,
        );
      }
      state.predictions = applyClassicLabelScores(state.predictions, state.feedbacks);
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
      state.feedbacks[snippetId] = buildClassicFeedback(snippetId, fbAction, labels);
      state.predictions = applyClassicLabelScores(state.predictions, state.feedbacks);
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
      state.selectedSnippetId = null;
      state.selectedPredictionId = null;
    },
    hydrateSavedFeed: (state) => {
      if (state.predictions.length > 0) return;
      const saved = loadFeed();
      if (!saved) return;

      const savedId = normalizeDatasetId(saved.selectedDatasetId);
      const currentId = normalizeDatasetId(state.selectedDatasetId);
      if (currentId !== null && savedId !== null && currentId !== savedId) return;

      if ((saved.predictions?.length ?? 0) > 0) {
        applyPersistedFeed(state, saved);
        return;
      }

      if (needsServerRestore(saved)) {
        applyPersistedMetadata(state, saved);
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(runInference.pending, (state) => {
      state.inferenceLoading = true;
      state.error = null;
    });
    builder.addCase(
      runInference.fulfilled,
      (state, action) => {
        const request = action.meta.arg as PAMRunInferenceRequest;
        state.inferenceLoading = false;
        state.modelFamilyName = action.payload.model_family_name;
        state.usedCheckpointId = action.payload.used_checkpoint_id;
        state.modelInfo = {
          mode: action.payload.mode,
          suggestion_strategy: action.payload.suggestion_strategy,
          returned_count: action.payload.returned_count,
          total_predictions: action.payload.total_predictions,
          used_checkpoint_id: action.payload.used_checkpoint_id,
        };
        state.totalScored = action.payload.total_predictions;
        state.feedSource = "pam";
        state.predictions = withDisplayFields(action.payload.rows);
        state.lastInferenceAt = new Date().toISOString();
        state.selectedDatasetId = request.dataset_id;
        // Update projection snapshot on first inference or after a retrain.
        if (state.projectionPredictions.length === 0 || state.lastRetrainJob !== null) {
          state.projectionPredictions = state.predictions;
        }
        saveFeed(state, request);
      },
    );
    builder.addCase(runInference.rejected, (state, action) => {
      state.inferenceLoading = false;
      state.error = action.payload as string;
    });

    builder.addCase(restoreFeedFromServer.pending, (state) => {
      state.inferenceLoading = true;
      state.error = null;
    });
    builder.addCase(
      restoreFeedFromServer.fulfilled,
      (state, action) => {
        if (!action.payload) {
          state.inferenceLoading = false;
          return;
        }
        const saved = loadFeed();
        const request = saved
          ? buildRestoreInferenceRequest(state, saved)
          : null;
        state.inferenceLoading = false;
        state.modelFamilyName = action.payload.model_family_name;
        state.usedCheckpointId = action.payload.used_checkpoint_id;
        state.modelInfo = {
          mode: action.payload.mode,
          suggestion_strategy: action.payload.suggestion_strategy,
          returned_count: action.payload.returned_count,
          total_predictions: action.payload.total_predictions,
          used_checkpoint_id: action.payload.used_checkpoint_id,
        };
        state.totalScored = action.payload.total_predictions;
        state.predictions = withDisplayFields(action.payload.rows);
        if (state.projectionPredictions.length === 0) {
          state.projectionPredictions = state.predictions;
        }
        if (request?.dataset_id != null) {
          state.selectedDatasetId = request.dataset_id;
        }
        saveFeed(state, request ?? undefined);
      },
    );
    builder.addCase(restoreFeedFromServer.rejected, (state, action) => {
      state.inferenceLoading = false;
      state.error = action.payload as string;
    });

    builder.addCase(fetchFeedbackCount.fulfilled, (state, action: PayloadAction<PAMFeedbackCountResponse>) => {
      // Keep threshold in sync with backend.
      if (Number.isFinite(action.payload.retrain_after) && action.payload.retrain_after > 0) {
        state.retrainThreshold = action.payload.retrain_after;
      }
      // Don't overwrite a locally-reset counter while a retrain is in progress.
      if (state.retrainLoading) return;
      state.feedbackCount = action.payload.feedback_count_since_retrain;
      state.retrainPending = Boolean(action.payload.retrain_pending);
    });

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
        if (fb.retrain_triggered && fb.auto_retrain_job_id && fb.auto_retrain_checkpoint_id) {
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

    builder.addCase(pollRetrainJob.fulfilled, (state, action: PayloadAction<PAMRetrainJobStatus>) => {
      state.lastRetrainJob = action.payload;
      if (action.payload.status === "COMPLETED" || action.payload.status === "FAILED") {
        state.retrainLoading = false;
        state.lastRetrainFailed = action.payload.status === "FAILED";
      }
    });
    builder.addCase(pollRetrainJob.rejected, (state, action) => {
      state.retrainLoading = false;
      state.error = action.payload as string;
    });
  },
});

export const {
  setSelectedSnippet,
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
} = alSlice.actions;

export { needsServerRestore };
export default alSlice.reducer;
