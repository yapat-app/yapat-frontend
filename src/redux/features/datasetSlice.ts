import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import api from "../../axios/axiosInstance";
import type { Dataset, ExportAnnotation, DatasetResponse } from "../../types";
import { datasetApi, teamApi } from "../../services/api";
import { getErrorMessage } from "../../services/api";

export interface DatasetState {
  allDatasets: Dataset[] | [];
  datasetDirectories: DatasetResponse | null;
  annotationExported: boolean;
  selectedDatasetId: number | null;
  loading: boolean;
}

interface AnnotationState {
  selectedDatasetId: number | null | string; // <-- allow null
}

const initialState: DatasetState = {
  allDatasets: [],
  datasetDirectories: null,
  annotationExported: false,
  selectedDatasetId: null,
  loading: false,
};

export const fetchAllDatasets = createAsyncThunk(
  "dataset/fetchAllDatasets",
  async () => {
    const response = await api.get("/api/datasets/");
    return response.data;
  },
);

export const fetchAllTeamDatasets = createAsyncThunk(
  "dataset/teams",
  async (_, { rejectWithValue }) => {
    try {
      return await teamApi.getAllTeamDatasets();
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const exploreDatasetDirectory = createAsyncThunk(
  "dataset/exploreDirectory",
  async ({ datasetId }: { datasetId: number }, { rejectWithValue }) => {
    try {
      return await datasetApi.explorer(datasetId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const exportAllAnnotations = createAsyncThunk(
  "dataset/export_annotations",
  async (data: ExportAnnotation) => {
    const response = await api.get(
      `/api/datasets/${data.dataset_id}/annotations/export?format=${data.format}`,
      { responseType: "blob" },
    );
    // Create a blob URL and trigger download
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `annotations-${data.dataset_id}.${data.format}`; // csv/tsv
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return;
  },
);

export const datasetSlice = createSlice({
  name: "dataset",
  initialState,
  reducers: {
    selectDataset: (
      state: AnnotationState,
      action: PayloadAction<number | null>,
    ) => {
      state.selectedDatasetId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAllDatasets.fulfilled, (state, action) => {
      state.allDatasets = action.payload;
    });
    builder.addCase(exportAllAnnotations.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(exportAllAnnotations.fulfilled, (state) => {
      state.annotationExported = true;
      state.loading = false;
    });
    builder.addCase(exportAllAnnotations.rejected, (state) => {
      state.loading = false;
      state.annotationExported = false;
    });
    builder.addCase(fetchAllTeamDatasets.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(fetchAllTeamDatasets.fulfilled, (state, action) => {
      state.allDatasets = action.payload;
      state.loading = false;
    });
    builder.addCase(fetchAllTeamDatasets.rejected, (state) => {
      state.loading = false;
      state.allDatasets = [];
    });
    builder.addCase(exploreDatasetDirectory.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(exploreDatasetDirectory.fulfilled, (state, action) => {
      state.datasetDirectories = action.payload;
      state.loading = false;
    });
    builder.addCase(exploreDatasetDirectory.rejected, (state) => {
      state.loading = false;
      state.datasetDirectories = null;
    });
  },
});

export const { selectDataset } = datasetSlice.actions;
export default datasetSlice.reducer;
