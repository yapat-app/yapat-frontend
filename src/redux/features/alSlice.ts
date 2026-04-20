/**
 * PAM Active Learning Redux Slice — uses /api/pam-al/* endpoints.
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { alApi } from "../../services/alApi";
import { getErrorMessage } from "../../services/api";
import type {
  ALState,
  VisibilityFilterState,
  ColorFilterState,
  PAMInferenceResult,
  PAMPrediction,
  FeedbackPayload,
  FeedbackResponse,
  PAMRetrainRequest,
  PAMRetrainJobDispatch,
  PAMRetrainJobStatus,
  ALColorBy,
  SamplingMethod,
  PAMRunInferenceRequest,
  PAMTrainFromScratchRequest,
} from "../../types/al";

// Keep UI threshold aligned with backend RETRAIN_AFTER (active_learning/config.yaml)
const RETRAIN_THRESHOLD = 9;
const STORAGE_KEY = "yapat_al_last_feed";

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
      // Ensure sampler-suite keys always exist in `scores` so the filter/color system works
      // even if the backend returns `scores: {}` and also provides these at top-level.
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

function saveFeed(state: ALState): void {
  try {
    const data: PersistedFeed = {
      predictions: state.predictions,
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage quota exceeded — ignore
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

// Rehydrate predictions + config from localStorage on startup
const saved = loadFeed();

const initialState: ALState = {
  modelCheckpointId: saved?.modelCheckpointId ?? null,
  modelFamilyName: saved?.modelFamilyName ?? null,
  usedCheckpointId: saved?.usedCheckpointId ?? null,
  snippetSetId: saved?.snippetSetId ?? null,
  embeddingModelId: saved?.embeddingModelId ?? null,
  inferenceK: saved?.inferenceK ?? 20,
  predictions: saved?.predictions ?? [],
  projectionPredictions: saved?.predictions ?? [],  // start with saved feed if available
  modelInfo: saved?.modelInfo ?? {},
  totalScored: saved?.totalScored ?? 0,
  feedbacks: {},
  feedbackCount: 0,
  retrainThreshold: RETRAIN_THRESHOLD,
  selectedSnippetId: null,
  selectedPredictionId: null,
  selectedDatasetId: saved?.selectedDatasetId ?? null,
  colorBy: "prediction",
  samplingMethod: "uncertainty",
  alFilters: {
    visibility: { propertyKey: null, range: [0, 1] },
    color: { propertyKey: null },
  },
  lastRetrainDispatch: null,
  lastRetrainJob: null,
  inferenceLoading: false,
  feedbackLoading: false,
  retrainLoading: false,
  error: null,
  lastInferenceAt: saved?.lastInferenceAt ?? null,
};

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
      state.selectedDatasetId = action.payload;
      state.predictions = [];
      state.projectionPredictions = [];
      state.feedbacks = {};
      state.feedbackCount = 0;
      state.lastRetrainDispatch = null;
      state.lastRetrainJob = null;
      state.selectedSnippetId = null;
      state.selectedPredictionId = null;
      state.modelCheckpointId = null;
      state.modelFamilyName = null;
      state.usedCheckpointId = null;
      state.snippetSetId = null;
      state.embeddingModelId = null;
      state.error = null;
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
    resetFeedbacks: (state) => {
      state.feedbacks = {};
      state.feedbackCount = 0;
    },
    clearError: (state) => {
      state.error = null;
    },
    clearSavedFeed: (state) => {
      state.predictions = [];
      state.projectionPredictions = [];
      state.modelInfo = {};
      state.totalScored = 0;
      state.feedbacks = {};
      state.feedbackCount = 0;
      state.usedCheckpointId = null;
      state.lastInferenceAt = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(runInference.pending, (state) => {
      state.inferenceLoading = true;
      state.error = null;
    });
    builder.addCase(
      runInference.fulfilled,
      (state, action: PayloadAction<PAMInferenceResult>) => {
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
        state.lastInferenceAt = new Date().toISOString();
        // Update projection snapshot: on first inference OR after retrain
        // (lastRetrainJob is set by triggerRetrain.fulfilled before this runs)
        if (state.projectionPredictions.length === 0 || state.lastRetrainJob !== null) {
          state.projectionPredictions = state.predictions;
        }
        saveFeed(state);
      },
    );
    builder.addCase(runInference.rejected, (state, action) => {
      state.inferenceLoading = false;
      state.error = action.payload as string;
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
        state.feedbackCount = fb.feedback_count_since_retrain;

        // Backend is the source of truth for auto-retrain:
        // when /feedback reports retrain_triggered, it has already created & dispatched a retrain job.
        if (fb.retrain_triggered && fb.auto_retrain_job_id && fb.auto_retrain_checkpoint_id) {
          state.retrainLoading = true;
          state.lastRetrainDispatch = {
            job_id: fb.auto_retrain_job_id,
            checkpoint_id: fb.auto_retrain_checkpoint_id,
            status: "PENDING",
            message: `Auto-retrain job ${fb.auto_retrain_job_id} dispatched`,
          };
          state.lastRetrainJob = null;
        }
      },
    );
    builder.addCase(submitFeedback.rejected, (state) => {
      state.feedbackLoading = false;
      // Feedback errors should not blank the entire prediction feed UI.
      // (The card-level UI already shows a toast on failure.)
      // Keep `state.error` reserved for inference/job failures.
    });

    builder.addCase(triggerRetrain.pending, (state) => {
      state.retrainLoading = true;
    });
    builder.addCase(
      triggerRetrain.fulfilled,
      (state, action: PayloadAction<PAMRetrainJobDispatch>) => {
        state.retrainLoading = false;
        state.lastRetrainDispatch = action.payload;
        state.lastRetrainJob = null;
        state.feedbackCount = 0;
        state.feedbacks = {};
        // Snapshot current predictions into projection — will be updated
        // again after retrain completes + inference reruns
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
        state.retrainLoading = false;
        state.lastRetrainDispatch = action.payload;
        state.lastRetrainJob = null;
        // Cold-start creates an active checkpoint on completion; clear counters for a fresh run
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
      }
    });
    builder.addCase(pollRetrainJob.rejected, (state, action) => {
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
  resetFeedbacks,
  clearError,
  clearSavedFeed,
} = alSlice.actions;

export default alSlice.reducer;
