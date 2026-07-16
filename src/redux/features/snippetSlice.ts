/**
 * Snippet Redux Slice
 * Manages snippet state for annotation workflow
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { snippetApi, getErrorMessage, feedApi } from "../../services/api";
import type {
  Snippet,
  SnippetAudioResult,
  FeedParams,
  FeedSimilarityCreate,
} from "../../types";
import { getLoggedInUser, logout } from "./authSlice";
import { loadClassicFeedCacheForUser } from "../../utils/classicFeedPersistence";

export type ClassicFeedKind = "random" | "similarity" | "filter";

/** Snapshot of classic (random/similarity) feed UI state per dataset. */
export interface ClassicFeedSlotSnapshot {
  snippets: Snippet[];
  selectedFeedId: number | null;
  currentSnippet: Snippet | null;
  currentIndex: number;
  snippetsFetched: boolean;
  snippetsLoaded: boolean;
}

function cloneSnippetList(snippets: Snippet[]): Snippet[] {
  return snippets.map((s) => ({ ...s }));
}

export interface SnippetState {
  snippets: Snippet[];
  selectedFeedId: number | null;
  currentSnippet: Snippet | null;
  currentSnippetAudio: SnippetAudioResult | null;
  currentIndex: number;
  snippetsFetched: boolean;
  snippetsLoaded: boolean;
  loading: boolean;
  snippetsLoading: boolean;
  error: string | null;
  hasMore: boolean;
  /** Transient: snippet id user explicitly requested (next/prev). Prefer on refresh */
  requestedSnippetId: number | null;
  /**
   * Last random vs last similarity feed per dataset (AnnotationHub).
   * Keys are dataset IDs.
   */
  classicFeedCache: Record<
    number,
    {
      random: ClassicFeedSlotSnapshot | null;
      similarity: ClassicFeedSlotSnapshot | null;
      filter: ClassicFeedSlotSnapshot | null;
    }
  >;
  /** Last user id we hydrated classicFeedCache from localStorage (session guard). */
  classicFeedCacheUserId: number | null;
}

function snapshotFromState(state: SnippetState): ClassicFeedSlotSnapshot {
  return {
    snippets: cloneSnippetList(state.snippets),
    selectedFeedId: state.selectedFeedId,
    currentSnippet: state.currentSnippet ? { ...state.currentSnippet } : null,
    currentIndex: state.currentIndex,
    snippetsFetched: state.snippetsFetched,
    snippetsLoaded: state.snippetsLoaded,
  };
}

function ensureClassicBucket(
  cache: SnippetState["classicFeedCache"],
  datasetId: number,
): {
  random: ClassicFeedSlotSnapshot | null;
  similarity: ClassicFeedSlotSnapshot | null;
  filter: ClassicFeedSlotSnapshot | null;
} {
  if (!cache[datasetId]) {
    cache[datasetId] = { random: null, similarity: null, filter: null };
  }
  return cache[datasetId]!;
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
  classicFeedCache: {},
  classicFeedCacheUserId: null,
  requestedSnippetId: null,
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
  },
);

export const fetchSimilaritySnippetFeed = createAsyncThunk(
  "snippet/fetchSimilarityFeed",
  async (data: FeedSimilarityCreate, { rejectWithValue }) => {
    try {
      return await feedApi.similarity(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchSimilarityBySnippetIdFeed = createAsyncThunk(
  "snippet/fetchSimilarityBySnippetIdFeed",
  async (
    data: {
      reference_snippet_id: number;
      dataset_id: number;
      limit?: number;
      snippet_set_id?: number;
    },
    { rejectWithValue },
  ) => {
    try {
      return await feedApi.similarityBySnippetId(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

//Fetch all snippets with optional filtering

export const fetchSnippets = createAsyncThunk(
  "snippet/fetchAll",
  async (
    params: { recording_id?: number; skip?: number; limit?: number },
    { rejectWithValue },
  ) => {
    try {
      return await snippetApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
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
  },
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
  },
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
        (s) => s.id === action.payload.id,
      );
      // direct set means user explicitly chose a snippet - clear transient
      state.requestedSnippetId = null;
    },

    //Move to the next snippet in the list

    moveToNextSnippet: (state) => {
      if (state.currentIndex < state.snippets.length - 1) {
        state.currentIndex += 1;
        state.currentSnippet = state.snippets[state.currentIndex];
        state.requestedSnippetId = state.currentSnippet?.id ?? null;
      }
    },

    //Move to the previous snippet in the list

    moveToPreviousSnippet: (state) => {
      if (state.currentIndex > 0) {
        state.currentIndex -= 1;
        state.currentSnippet = state.snippets[state.currentIndex];
        state.requestedSnippetId = state.currentSnippet?.id ?? null;
      }
    },

    //Mark current snippet as annotated

    markCurrentAsAnnotated: (state) => {
      if (state.currentSnippet) {
        state.currentSnippet.is_annotated = true;
        // Update in list
        const snippet = state.snippets.find(
          (s) => s.id === state.currentSnippet?.id,
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

    jumpToSnippetById: (state, action: PayloadAction<number>) => {
      const idx = state.snippets.findIndex((s) => s.id === action.payload);
      if (idx >= 0) {
        state.currentIndex = idx;
        state.currentSnippet = state.snippets[idx];
        state.requestedSnippetId = null;
      }
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
        (s) => s.id === action.payload.response[0].id,
      );
      state.requestedSnippetId = null;
    },

    //Clear error message

    clearError: (state) => {
      state.error = null;
    },

    saveClassicFeedSlot: (
      state,
      action: PayloadAction<{ datasetId: number; kind: ClassicFeedKind }>,
    ) => {
      const { datasetId, kind } = action.payload;
      if (!Number.isFinite(datasetId)) return;
      const bucket = ensureClassicBucket(state.classicFeedCache, datasetId);
      bucket[kind] = snapshotFromState(state);
    },

    restoreClassicFeedSlot: (
      state,
      action: PayloadAction<{ datasetId: number; kind: ClassicFeedKind }>,
    ) => {
      const { datasetId, kind } = action.payload;
      if (!Number.isFinite(datasetId)) return;
      const bucket = state.classicFeedCache[datasetId];
      const snap = bucket?.[kind] ?? null;
      if (!snap || snap.snippets.length === 0) {
        state.snippets = [];
        state.currentSnippet = null;
        state.selectedFeedId = null;
        state.currentIndex = 0;
        state.snippetsFetched = false;
        state.snippetsLoaded = false;
        state.error = null;
        state.hasMore = true;
        return;
      }
      state.snippets = cloneSnippetList(snap.snippets);
      state.selectedFeedId = snap.selectedFeedId;
      state.currentSnippet = snap.currentSnippet
        ? { ...snap.currentSnippet }
        : null;
      state.currentIndex = snap.currentIndex;
      if (state.currentSnippet && state.snippets.length > 0) {
        const idx = state.snippets.findIndex(
          (s) => s.id === state.currentSnippet?.id,
        );
        if (idx >= 0) state.currentIndex = idx;
        else {
          state.currentIndex = 0;
          state.currentSnippet = state.snippets[0] ?? null;
        }
      }
      state.snippetsFetched = snap.snippetsFetched;
      state.snippetsLoaded = snap.snippetsLoaded;
      state.error = null;
    },

    clearClassicFeedCacheForDataset: (state, action: PayloadAction<number>) => {
      const id = action.payload;
      if (Number.isFinite(id)) delete state.classicFeedCache[id];
    },

    /** Sync-load classic feed slots from localStorage (safe before restoreClassicFeedSlot). */
    ensureClassicFeedCacheHydrated: (state, action: PayloadAction<number>) => {
      const uid = action.payload;
      if (!Number.isFinite(uid)) return;
      if (state.classicFeedCacheUserId === uid) return;
      state.classicFeedCache = loadClassicFeedCacheForUser(
        uid,
      ) as SnippetState["classicFeedCache"];
      state.classicFeedCacheUserId = uid;
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

        if (action.payload.length > 0) {
          const preferredId =
            state.requestedSnippetId ?? state.currentSnippet?.id ?? null;
          let idx = 0;
          if (preferredId != null) {
            const found = action.payload.findIndex(
              (s: any) => s.id === preferredId,
            );
            if (found >= 0) idx = found;
          }
          state.currentSnippet = action.payload[idx];
          state.currentIndex = idx;
        } else {
          state.currentSnippet = null;
          state.currentIndex = 0;
        }

        // handled transient preference
        state.requestedSnippetId = null;

        const dsId = action.meta.arg.dataset_id;
        if (typeof dsId === "number" && Number.isFinite(dsId)) {
          const bucket = ensureClassicBucket(state.classicFeedCache, dsId);
          const kind: ClassicFeedKind =
            action.meta.arg.method === "filter" ? "filter" : "random";
          bucket[kind] = snapshotFromState(state);
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
        if (action.payload.length > 0) {
          const preferredId =
            state.requestedSnippetId ?? state.currentSnippet?.id ?? null;
          let idx = 0;
          if (preferredId != null) {
            const found = action.payload.findIndex(
              (s: any) => s.id === preferredId,
            );
            if (found >= 0) idx = found;
          }
          state.currentSnippet = action.payload[idx];
          state.currentIndex = idx;
        } else {
          state.currentSnippet = null;
          state.currentIndex = 0;
        }
        state.requestedSnippetId = null;

        const dsId = action.meta.arg.dataset_id;
        if (typeof dsId === "number" && Number.isFinite(dsId)) {
          const bucket = ensureClassicBucket(state.classicFeedCache, dsId);
          bucket.similarity = snapshotFromState(state);
        }
      })
      .addCase(fetchSimilaritySnippetFeed.rejected, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = false;
        state.error = action.payload as string;
      })
      // Fetch similarity feed by snippet ID
      .addCase(fetchSimilarityBySnippetIdFeed.pending, (state) => {
        state.snippetsLoading = true;
        state.error = null;
      })
      .addCase(fetchSimilarityBySnippetIdFeed.fulfilled, (state, action) => {
        state.snippetsLoading = false;
        state.snippetsFetched = true;
        state.snippets = action.payload;
        state.hasMore = action.payload.length > 0;
        if (action.payload.length > 0) {
          const preferredId =
            state.requestedSnippetId ?? state.currentSnippet?.id ?? null;
          let idx = 0;
          if (preferredId != null) {
            const found = action.payload.findIndex(
              (s: any) => s.id === preferredId,
            );
            if (found >= 0) idx = found;
          }
          state.currentSnippet = action.payload[idx];
          state.currentIndex = idx;
        } else {
          state.currentSnippet = null;
          state.currentIndex = 0;
        }
        state.requestedSnippetId = null;
        const dsId = action.meta.arg.dataset_id;
        if (typeof dsId === "number" && Number.isFinite(dsId)) {
          const bucket = ensureClassicBucket(state.classicFeedCache, dsId);
          bucket.similarity = snapshotFromState(state);
        }
      })
      .addCase(fetchSimilarityBySnippetIdFeed.rejected, (state, action) => {
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
        // prefer requestedSnippetId or preserve current if present after refresh
        if (action.payload.length > 0) {
          const preferredId =
            state.requestedSnippetId ?? state.currentSnippet?.id ?? null;
          if (preferredId != null) {
            const found = action.payload.findIndex(
              (s: any) => s.id === preferredId,
            );
            if (found >= 0) {
              state.currentIndex = found;
              state.currentSnippet = action.payload[found];
            } else {
              state.currentIndex = 0;
              state.currentSnippet = action.payload[0];
            }
          } else {
            state.currentIndex = 0;
            state.currentSnippet = action.payload[0];
          }
        } else {
          state.currentIndex = 0;
          state.currentSnippet = null;
        }
        state.requestedSnippetId = null;
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
      })
      .addCase(getLoggedInUser.fulfilled, (state, action) => {
        const uid = action.payload?.id;
        if (uid == null || !Number.isFinite(uid)) return;
        if (state.classicFeedCacheUserId === uid) return;
        state.classicFeedCache = loadClassicFeedCacheForUser(
          uid,
        ) as SnippetState["classicFeedCache"];
        state.classicFeedCacheUserId = uid;
      })
      .addCase(logout, (state) => {
        state.classicFeedCache = {};
        state.classicFeedCacheUserId = null;
        state.snippets = [];
        state.currentSnippet = null;
        state.selectedFeedId = null;
        state.currentSnippetAudio = null;
        state.currentIndex = 0;
        state.snippetsFetched = false;
        state.snippetsLoaded = false;
        state.error = null;
        state.hasMore = true;
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
  jumpToSnippetById,
  setFeedId,
  clearError,
  saveClassicFeedSlot,
  restoreClassicFeedSlot,
  clearClassicFeedCacheForDataset,
  ensureClassicFeedCacheHydrated,
} = snippetSlice.actions;

export default snippetSlice.reducer;
