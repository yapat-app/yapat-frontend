/**
 * WSSED Redux Slice
 * Manages WSSED states
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type {
  ActiveLearningResponse,
  ActiveLearningLabel,
  getActiveLearningSuggestionsParams,
  Snippet,
  retrainActiveLearningBody,
  PredictionHistogram,
} from "../../types";
import { getErrorMessage, wssedApi, snippetApi } from "../../services/api";

export interface wssedState {
  selectedSpecies: string | null;

  activeLearning: ActiveLearningResponse | null;

  currentSuggestionIndex: number;
  currentSnippetId: number | null;

  currentSnippet: Snippet | null;

  // Audio for the currently selected snippet
  currentSnippetAudio: string | null;
  audioLoading: boolean;
  audioError: string | null;

  // Label submission
  submitLabelLoading: boolean;
  submitLabelError: string | null;
  submitLabelSuccess: boolean;

  //retraining
  modelTraining: boolean;

  histogram: PredictionHistogram | null;
}

const initialState: wssedState = {
  selectedSpecies: null,

  activeLearning: null,

  currentSuggestionIndex: 0,
  currentSnippetId: null,

  currentSnippet: null,

  currentSnippetAudio: null,
  audioLoading: false,
  audioError: null,

  submitLabelLoading: false,
  submitLabelError: null,
  submitLabelSuccess: false,

  modelTraining: false,

  histogram: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

export const fetchActiveLearningSuggestions = createAsyncThunk(
  "wssed/fetchActiveLearningSuggestions",
  async (data: getActiveLearningSuggestionsParams, { rejectWithValue }) => {
    try {
      return await wssedApi.suggestions(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchCurrentSnippetAudio = createAsyncThunk(
  "wssed/fetchCurrentSnippetAudio",
  async (snippetId: number, { rejectWithValue }) => {
    try {
      return await snippetApi.getSnippetAudio(snippetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const submitLabel = createAsyncThunk(
  "wssed/submitLabel",
  async (data: ActiveLearningLabel, { rejectWithValue }) => {
    try {
      await wssedApi.submitLabel(data);
      return data;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const getHistogram = createAsyncThunk(
  "wssed/getHistogram",
  async (
    params: { model_id: number; snippet_set_id: number },
    { rejectWithValue },
  ) => {
    try {
      return await wssedApi.histogram(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const retrainModel = createAsyncThunk(
  "wssed/retrainModel",
  async (params: retrainActiveLearningBody, { rejectWithValue }) => {
    try {
      await wssedApi.retrain(params);
      return params;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export const wssedSlice = createSlice({
  name: "wssed",
  initialState,
  reducers: {
    selectSpecies: (state, action: PayloadAction<string | null>) => {
      state.selectedSpecies = action.payload;

      state.activeLearning = null;
      state.currentSuggestionIndex = 0;
      state.currentSnippetId = null;

      state.currentSnippet = null;
      state.currentSnippetAudio = null;
      state.audioLoading = false;
      state.audioError = null;
    },

    setWssedCurrentSnippet: (state, action: PayloadAction<Snippet | null>) => {
      state.currentSnippet = action.payload;
      state.currentSnippetId = action.payload?.id ?? null;
    },

    setCurrentSuggestionIndex: (state, action: PayloadAction<number>) => {
      const suggestions = state.activeLearning?.suggestions ?? [];
      if (suggestions.length === 0) {
        state.currentSuggestionIndex = 0;
        state.currentSnippetId = null;
        state.currentSnippetAudio = null;
        return;
      }

      const idx = clamp(action.payload, 0, suggestions.length - 1);
      state.currentSuggestionIndex = idx;
      state.currentSnippetId = suggestions[idx]?.snippet_id ?? null;

      // clear audio until thunk loads it
      state.currentSnippetAudio = null;
      state.audioError = null;
    },

    nextSuggestion: (state) => {
      const suggestions = state.activeLearning?.suggestions ?? [];
      if (suggestions.length === 0) return;

      const nextIdx = clamp(
        state.currentSuggestionIndex + 1,
        0,
        suggestions.length - 1,
      );

      state.currentSuggestionIndex = nextIdx;
      state.currentSnippetId = suggestions[nextIdx]?.snippet_id ?? null;

      state.currentSnippetAudio = null;
      state.audioError = null;
    },

    prevSuggestion: (state) => {
      const suggestions = state.activeLearning?.suggestions ?? [];
      if (suggestions.length === 0) return;

      const prevIdx = clamp(
        state.currentSuggestionIndex - 1,
        0,
        suggestions.length - 1,
      );

      state.currentSuggestionIndex = prevIdx;
      state.currentSnippetId = suggestions[prevIdx]?.snippet_id ?? null;

      state.currentSnippetAudio = null;
      state.audioError = null;
    },

    clearCurrentSnippetAudio: (state) => {
      state.currentSnippetAudio = null;
      state.audioLoading = false;
      state.audioError = null;
    },

    clearSubmitLabelStatus: (state) => {
      state.submitLabelLoading = false;
      state.submitLabelError = null;
      state.submitLabelSuccess = false;
    },

    setTraining: (state, action: PayloadAction<boolean>) => {
      state.modelTraining = action.payload;
    },
  },

  extraReducers: (builder) => {
    builder
      // suggestions
      .addCase(fetchActiveLearningSuggestions.fulfilled, (state, action) => {
        state.activeLearning = action.payload || null;

        const suggestions = state.activeLearning?.suggestions ?? [];
        const nextSnippetId =
          suggestions.length > 0 ? suggestions[0].snippet_id : null;

        if (state.currentSnippetId !== nextSnippetId) {
          state.currentSnippetAudio = null;
          state.audioError = null;
        }

        state.currentSuggestionIndex = 0;
        state.currentSnippetId = nextSnippetId;
      })
      .addCase(fetchActiveLearningSuggestions.rejected, (state) => {
        state.activeLearning = null;
        state.currentSuggestionIndex = 0;
        state.currentSnippetId = null;

        state.currentSnippetAudio = null;
        state.audioError = null;
      })
      //histogram
      .addCase(getHistogram.fulfilled, (state, action) => {
        state.histogram = action.payload;
      })
      .addCase(getHistogram.rejected, (state) => {
        state.histogram = null;
      })

      //retrain
      .addCase(retrainModel.pending, (state) => {
        state.modelTraining = true;
      })
      .addCase(retrainModel.fulfilled, (state) => {
        state.modelTraining = false;
      })
      .addCase(retrainModel.rejected, (state) => {
        state.modelTraining = false;
      })

      // audio
      .addCase(fetchCurrentSnippetAudio.pending, (state) => {
        state.audioLoading = true;
        state.audioError = null;
      })
      .addCase(fetchCurrentSnippetAudio.fulfilled, (state, action) => {
        state.audioLoading = false;
        state.audioError = null;
        state.currentSnippetAudio = action.payload ?? null;
      })
      .addCase(fetchCurrentSnippetAudio.rejected, (state, action) => {
        state.audioLoading = false;
        state.currentSnippetAudio = null;
        state.audioError =
          (action.payload as string) || "Failed to fetch snippet audio";
      })

      // submit label
      .addCase(submitLabel.pending, (state) => {
        state.submitLabelLoading = true;
        state.submitLabelError = null;
        state.submitLabelSuccess = false;
      })
      .addCase(submitLabel.fulfilled, (state) => {
        state.submitLabelLoading = false;
        state.submitLabelError = null;
        state.submitLabelSuccess = true;
      })
      .addCase(submitLabel.rejected, (state, action) => {
        state.submitLabelLoading = false;
        state.submitLabelSuccess = false;
        state.submitLabelError =
          (action.payload as string) || "Failed to submit label";
      });
  },
});

export const {
  selectSpecies,
  setWssedCurrentSnippet,
  setCurrentSuggestionIndex,
  nextSuggestion,
  prevSuggestion,
  clearCurrentSnippetAudio,
  clearSubmitLabelStatus,
  setTraining,
} = wssedSlice.actions;

export default wssedSlice.reducer;
