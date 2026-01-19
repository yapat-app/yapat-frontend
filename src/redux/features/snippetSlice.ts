/**
 * Snippet Redux Slice
 * Manages snippet state for annotation workflow
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { snippetApi, getErrorMessage, feedApi } from "../../services/api";
import type { Snippet, FeedParams, FeedSimilarityCreate } from "../../types";

export interface SnippetState {
  snippets: Snippet[];
  selectedFeedId: number | null;
  currentSnippet: Snippet | null;
  currentSnippetAudio: string | null;
  currentIndex: number;
  snippetsFetched: boolean;
  snippetsLoaded: boolean;
  loading: boolean;
  snippetsLoading: boolean;
  error: string | null;
  hasMore: boolean;
}

const initialState: SnippetState = {
  snippets: [],
  currentSnippet: null,
  selectedFeedId: null,
  currentSnippetAudio: null,
  currentIndex: 0,
  loading: false,
  snippetsFetched: false,
  snippetsLoaded: false,
  snippetsLoading: false,
  error: null,
  hasMore: true,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Fetch feed of unannotated snippets for annotation workflow
 */
export const fetchSnippetFeed = createAsyncThunk(
  "snippet/fetchFeed",
  async (params: FeedParams, { rejectWithValue }) => {
    try {
      return await snippetApi.getFeed(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const fetchSimilaritySnippetFeed = createAsyncThunk(
  "snippet/fetchSimilarityFeed",
  async (data: FeedSimilarityCreate, { rejectWithValue }) => {
    try {
      return await feedApi.similarity(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

//Fetch all snippets with optional filtering

export const fetchSnippets = createAsyncThunk(
  "snippet/fetchAll",
  async (
    params: { recording_id?: number; skip?: number; limit?: number },
    { rejectWithValue }
  ) => {
    try {
      return await snippetApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

//Fetch single snippet by ID

export const fetchSnippet = createAsyncThunk(
  "snippet/fetchOne",
  async (snippetId: number, { rejectWithValue }) => {
    try {
      return await snippetApi.getById(snippetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

//Fetch single snippet audio

export const fetchSnippetAudio = createAsyncThunk(
  "snippet/audio",
  async (snippetId: number, { rejectWithValue }) => {
    try {
      return await snippetApi.getSnippetAudio(snippetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

// ============================================================================
// Slice
// ============================================================================

export const snippetSlice = createSlice({
  name: "snippet",
  initialState,
  reducers: {
    //Set the current snippet being annotated

    setCurrentSnippet: (state, action: PayloadAction<Snippet>) => {
      state.currentSnippet = action.payload;
      state.currentIndex = state.snippets.findIndex(
        (s) => s.id === action.payload.id
      );
    },

    //Move to the next snippet in the list

    moveToNextSnippet: (state) => {
      if (state.currentIndex < state.snippets.length - 1) {
        state.currentIndex += 1;
        state.currentSnippet = state.snippets[state.currentIndex];
      }
    },

    //Move to the previous snippet in the list

    moveToPreviousSnippet: (state) => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
        state.currentSnippet = state.snippets[state.currentIndex];
      }
    },

    //Mark current snippet as annotated

    markCurrentAsAnnotated: (state) => {
      if (state.currentSnippet) {
        state.currentSnippet.is_annotated = true;
        // Update in list
        const snippet = state.snippets.find(
          (s) => s.id === state.currentSnippet?.id
        );
        if (snippet) {
          snippet.is_annotated = true;
        }
      }
    },

    //Clear all snippets and reset state

    clearSnippets: (state) => {
      state.snippets = [];
      state.currentSnippet = null;
      state.snippetsFetched = false;
      state.currentIndex = 0;
      state.hasMore = true;
      state.selectedFeedId = null;
      state.error = null;
    },

    setFeedId: (state, action) => {
      state.selectedFeedId = action.payload;
    },
    // load snippets manually
    loadSnippets: (state, action) => {
      state.snippets = action.payload.response;
      state.selectedFeedId = action.payload.id;
      state.snippetsFetched = true;
      state.snippetsLoaded = true;
      state.currentSnippet = action.payload.response[0];
      state.currentIndex = state.snippets.findIndex(
        (s) => s.id === action.payload.response[0].id
      );
    },

    //Clear error message

    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch feed
      .addCase(fetchSnippetFeed.pending, (state) => {
        state.snippetsLoading = true;

        state.error = null;
      })
      .addCase(fetchSnippetFeed.fulfilled, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = true;
        state.snippets = action.payload;
        state.hasMore = action.payload.length > 0;

        // Set first snippet as current if none set
        if (action.payload.length > 0 && !state.currentSnippet) {
          state.currentSnippet = action.payload[0];
          state.currentIndex = 0;
        }
      })
      .addCase(fetchSnippetFeed.rejected, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = false;
        state.error = action.payload as string;
      })
      // Fetch similarity feed
      .addCase(fetchSimilaritySnippetFeed.pending, (state) => {
        state.snippetsLoading = true;
        state.error = null;
      })
      .addCase(fetchSimilaritySnippetFeed.fulfilled, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = true;
        state.snippets = action.payload;
        state.hasMore = action.payload.length > 0;
        // Set first snippet as current if none set
        if (action.payload.length > 0 && !state.currentSnippet) {
          state.currentSnippet = action.payload[0];
          state.currentIndex = 0;
        }
      })
      .addCase(fetchSimilaritySnippetFeed.rejected, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = false;
        state.error = action.payload as string;
      })

      // Fetch all snippets
      .addCase(fetchSnippets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSnippets.fulfilled, (state, action) => {
        state.loading = false;
        state.snippets = action.payload;
      })
      .addCase(fetchSnippets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch snippet audio
      .addCase(fetchSnippetAudio.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSnippetAudio.fulfilled, (state, action) => {
        state.loading = false;
        state.currentSnippetAudio = action.payload;
      })
      .addCase(fetchSnippetAudio.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch single snippet
      .addCase(fetchSnippet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSnippet.fulfilled, (state, action) => {
        state.loading = false;
        state.currentSnippet = action.payload;
      })
      .addCase(fetchSnippet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setCurrentSnippet,
  moveToNextSnippet,
  moveToPreviousSnippet,
  markCurrentAsAnnotated,
  clearSnippets,
  loadSnippets,
  setFeedId,
  clearError,
} = snippetSlice.actions;

export default snippetSlice.reducer;
