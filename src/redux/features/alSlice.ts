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
  PAMRetrainJobResponse,
  ALColorBy,
  SamplingMethod,
  PAMRunInferenceRequest,
} from "../../types/al";

const RETRAIN_THRESHOLD = 5;
const STORAGE_KEY = "yapat_al_last_feed";

// ── Persistence helpers ───────────────────────────────────────────────────

interface PersistedFeed {
  predictions: PAMPrediction[];
  modelInfo: Record<string, unknown>;
  totalScored: number;
  modelCheckpointId: number | null;
  snippetSetId: number | null;
  inferenceK: number;
  selectedDatasetId: number | null;
  lastInferenceAt: string;
}

function saveFeed(state: ALState): void {
  try {
    const data: PersistedFeed = {
      predictions: state.predictions,
      modelInfo: state.modelInfo,
      totalScored: state.totalScored,
      modelCheckpointId: state.modelCheckpointId,
      snippetSetId: state.snippetSetId,
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
  snippetSetId: saved?.snippetSetId ?? null,
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
      state.lastRetrainJob = null;
      state.selectedSnippetId = null;
      state.selectedPredictionId = null;
      state.modelCheckpointId = null;
      state.snippetSetId = null;
      state.error = null;
    },
    setInferenceConfig: (
      state,
      action: PayloadAction<{ modelCheckpointId: number; snippetSetId: number; k?: number }>,
    ) => {
      state.modelCheckpointId = action.payload.modelCheckpointId;
      state.snippetSetId = action.payload.snippetSetId;
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
        state.predictions = action.payload.predictions;
        state.modelInfo = action.payload.model_info;
        state.totalScored = action.payload.total_scored;
        state.lastInferenceAt = new Date().toISOString();
        // Update projection snapshot: on first inference OR after retrain
        // (lastRetrainJob is set by triggerRetrain.fulfilled before this runs)
        if (state.projectionPredictions.length === 0 || state.lastRetrainJob !== null) {
          state.projectionPredictions = action.payload.predictions;
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
        state.feedbacks[fb.prediction_id] = fb;
        state.feedbackCount = fb.feedback_count_since_retrain;
      },
    );
    builder.addCase(submitFeedback.rejected, (state, action) => {
      state.feedbackLoading = false;
      state.error = action.payload as string;
    });

    builder.addCase(triggerRetrain.pending, (state) => {
      state.retrainLoading = true;
    });
    builder.addCase(
      triggerRetrain.fulfilled,
      (state, action: PayloadAction<PAMRetrainJobResponse>) => {
        state.retrainLoading = false;
        state.lastRetrainJob = action.payload;
        if (action.payload.new_checkpoint_id) {
          state.modelCheckpointId = action.payload.new_checkpoint_id;
        }
        state.feedbackCount = 0;
        state.feedbacks = {};
        // Snapshot current predictions into projection — will be updated
        // again after the follow-up inference triggered by useAutoRetrain
        state.projectionPredictions = state.predictions;
      },
    );
    builder.addCase(triggerRetrain.rejected, (state, action) => {
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
  resetFeedbacks,
  clearError,
  clearSavedFeed,
} = alSlice.actions;

export default alSlice.reducer;
