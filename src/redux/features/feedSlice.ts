import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { feedApi, getErrorMessage } from "../../services/api";
import type { Feed, FeedCreate, FeedSimilarityCreate } from "../../types";

export interface FeedState {
  feed: Feed[] | null;
  loading: boolean;
  error: string | null;
}

const initialState: FeedState = {
  feed: null,
  loading: false,
  error: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Create a new feed
 */
export const createFeed = createAsyncThunk(
  "feed/create",
  async (data: FeedCreate, { rejectWithValue }) => {
    try {
      return await feedApi.create(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * Create a new  similarity feed
 */
export const createSimilarityFeed = createAsyncThunk(
  "feed/similarity-search",
  async (data: FeedSimilarityCreate, { rejectWithValue }) => {
    try {
      return await feedApi.similarity(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

// ============================================================================
// Slice
// ============================================================================

export const feedSlice = createSlice({
  name: "feed",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(createFeed.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createFeed.fulfilled, (state, action) => {
        state.loading = false;
        state.feed = action.payload;
      })
      .addCase(createFeed.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.feed = null;
      })
      .addCase(createSimilarityFeed.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createSimilarityFeed.fulfilled, (state, action) => {
        state.loading = false;
        state.feed = action.payload;
      })
      .addCase(createSimilarityFeed.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.feed = null;
      });
  },
});

export default feedSlice.reducer;
