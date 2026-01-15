/**
 * Annotation Redux Slice
 * Manages annotation state
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { annotationApi, getErrorMessage } from "../../services/api";
import type {
  Annotation,
  AnnotationCreate,
  AnnotationBatchCreate,
  DatasetAnnotationStats,
} from "../../types";

export interface AnnotationState {
  annotations: Annotation[];
  datasetAnnotations: DatasetAnnotationStats[];
  currentAnnotation: Annotation | null;
  loading: boolean;
  error: string | null;
  lastCreated: Annotation | null;
}

const initialState: AnnotationState = {
  annotations: [],
  datasetAnnotations: [],
  currentAnnotation: null,
  loading: false,
  error: null,
  lastCreated: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Create a new annotation
 */
export const createAnnotation = createAsyncThunk(
  "annotation/create",
  async (data: AnnotationCreate, { rejectWithValue }) => {
    try {
      return await annotationApi.create(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * Create multiple annotations for a snippet
 */
export const createAnnotationBatch = createAsyncThunk(
  "annotation/createBatch",
  async (data: AnnotationBatchCreate, { rejectWithValue }) => {
    try {
      return await annotationApi.createBatch(data);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * Fetch annotations with optional filtering
 */
export const fetchAnnotations = createAsyncThunk(
  "annotation/fetchAll",
  async (
    params: {
      snippet_id?: number;
      taxon_id?: string;
      user_id?: number;
      skip?: number;
      limit?: number;
    },
    { rejectWithValue }
  ) => {
    try {
      return await annotationApi.getAll(params);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * Fetch single annotation by ID
 */
export const fetchAnnotation = createAsyncThunk(
  "annotation/fetchOne",
  async (annotationId: number, { rejectWithValue }) => {
    try {
      return await annotationApi.getById(annotationId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * Delete an annotation
 */
export const deleteAnnotation = createAsyncThunk(
  "annotation/delete",
  async (annotationId: number, { rejectWithValue }) => {
    try {
      await annotationApi.delete(annotationId);
      return annotationId;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

/**
 * All Dataset Annotation Stats
 */
export const getAllDatasetAnnotationStats = createAsyncThunk(
  "annotation/allDatasetStats",
  async (_, { rejectWithValue }) => {
    try {
      return await annotationApi.getAnnotationsForDataset();
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

// ============================================================================
// Slice
// ============================================================================

export const annotationSlice = createSlice({
  name: "annotation",
  initialState,
  reducers: {
    //Set the current annotation

    setCurrentAnnotation: (state, action: PayloadAction<Annotation | null>) => {
      state.currentAnnotation = action.payload;
    },

    //Clear all annotations

    clearAnnotations: (state) => {
      state.annotations = [];
      state.currentAnnotation = null;
      state.lastCreated = null;
      state.error = null;
    },

    //Clear error message

    clearError: (state) => {
      state.error = null;
    },

    //Clear last created annotation

    clearLastCreated: (state) => {
      state.lastCreated = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Create annotation
      .addCase(createAnnotation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAnnotation.fulfilled, (state, action) => {
        state.loading = false;
        state.annotations.push(action.payload);
        state.lastCreated = action.payload;
      })
      .addCase(createAnnotation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create annotation batch
      .addCase(createAnnotationBatch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAnnotationBatch.fulfilled, (state, action) => {
        state.loading = false;
        state.annotations.push(...action.payload);
        state.lastCreated = action.payload[action.payload.length - 1];
      })
      .addCase(createAnnotationBatch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch annotations
      .addCase(fetchAnnotations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAnnotations.fulfilled, (state, action) => {
        state.loading = false;
        state.annotations = action.payload;
      })
      .addCase(fetchAnnotations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch single annotation
      .addCase(fetchAnnotation.fulfilled, (state, action) => {
        state.currentAnnotation = action.payload;
      })

      // Fetch all dataset annotation stats
      .addCase(getAllDatasetAnnotationStats.fulfilled, (state, action) => {
        state.datasetAnnotations = action.payload;
      })

      // Delete annotation
      .addCase(deleteAnnotation.fulfilled, (state, action) => {
        state.annotations = state.annotations.filter(
          (ann) => ann.id !== action.payload
        );
        if (state.currentAnnotation?.id === action.payload) {
          state.currentAnnotation = null;
        }
      });
  },
});

export const {
  setCurrentAnnotation,
  clearAnnotations,
  clearError,
  clearLastCreated,
} = annotationSlice.actions;

export default annotationSlice.reducer;
