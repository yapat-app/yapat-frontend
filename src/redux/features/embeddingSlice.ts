import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { embeddingApi, getErrorMessage } from "../../services/api";
import type {
  Embedding,
  CreateEmbedding,
  EmbeddingMethod,
  EmbeddingJob,
  SnippetSet,
} from "../../types";

export interface EmbeddingState {
  embeddingCreated: Embedding | null;
  embeddingMethods: EmbeddingMethod[] | null;
  selectedEmbeddedMethodId: number | null;
  datasetEmbeddings: EmbeddingJob[] | null;
  snippetSets: SnippetSet[] | [];
  loading: boolean;
  embeddingLoading: boolean;
  error: string | null;
}

const initialState: EmbeddingState = {
  embeddingCreated: null,
  embeddingMethods: null,
  selectedEmbeddedMethodId: null,
  datasetEmbeddings: null,
  loading: false,
  embeddingLoading: false,
  snippetSets: [],
  error: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Create a new embedding
 */

export const createEmbedding = createAsyncThunk(
  "embedding/create",
  async (
    data: { datasetId: number | null; body: CreateEmbedding },
    { rejectWithValue },
  ) => {
    try {
      return await embeddingApi.create(data.datasetId, data.body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

/**
 * Get all embedding methods
 */
export const getAllEmbeddingMethods = createAsyncThunk(
  "embedding/getAllMethods",
  async (_, { rejectWithValue }) => {
    try {
      return await embeddingApi.allEmbeddingList();
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

/**
 * Get all embedding jobs for dataset
 */
export const getAllDatasetEmbeddings = createAsyncThunk(
  "embedding/alldatasets",
  async (datasetId: number, { rejectWithValue }) => {
    try {
      return await embeddingApi.allDatasetEmbeddingList(datasetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const getAllDatasetSnippetSets = createAsyncThunk(
  "embedding/allSnippetSets",
  async (datasetId: number, { rejectWithValue }) => {
    try {
      return await embeddingApi.allSnippetSets(datasetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

// ============================================================================
// Slice
// ============================================================================

export const embeddingSlice = createSlice({
  name: "embedding",
  initialState,
  reducers: {
    selectEmbedding: (state, action: PayloadAction<number | null>) => {
      state.selectedEmbeddedMethodId = action.payload;
    },
    clearEmbedding: (state) => {
      state.selectedEmbeddedMethodId = null;
      state.embeddingCreated = null;
      state.embeddingLoading = false;
      state.datasetEmbeddings = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create annotation
      .addCase(createEmbedding.pending, (state) => {
        state.embeddingLoading = true;
        state.error = null;
      })
      .addCase(createEmbedding.fulfilled, (state, action) => {
        state.embeddingLoading = false;
        state.embeddingCreated = action.payload;
      })
      .addCase(createEmbedding.rejected, (state, action) => {
        state.embeddingLoading = false;
        state.error = action.payload as string;
        state.embeddingCreated = null;
      })
      .addCase(getAllDatasetSnippetSets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllDatasetSnippetSets.fulfilled, (state, action) => {
        state.loading = false;
        state.snippetSets = action.payload;
      })
      .addCase(getAllDatasetSnippetSets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.snippetSets = [];
      })
      // get all dataset embeddings
      .addCase(getAllDatasetEmbeddings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllDatasetEmbeddings.fulfilled, (state, action) => {
        state.loading = false;
        state.datasetEmbeddings = action.payload;
      })
      .addCase(getAllDatasetEmbeddings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.datasetEmbeddings = null;
      })
      .addCase(getAllEmbeddingMethods.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllEmbeddingMethods.fulfilled, (state, action) => {
        state.loading = false;
        state.embeddingMethods = action.payload;
      })
      .addCase(getAllEmbeddingMethods.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.embeddingMethods = null;
      });
  },
});

export const { selectEmbedding, clearEmbedding } = embeddingSlice.actions;
export default embeddingSlice.reducer;
