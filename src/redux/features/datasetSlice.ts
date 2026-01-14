import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";
import type { ExportAnnotation } from "../../types";

export interface DatasetState {
  allDatasets: { id: string; name: string }[];
  annotationExported: boolean;
  selectedDatasetId: number | null;
  loading: boolean;
}

const initialState: DatasetState = {
  allDatasets: [],
  annotationExported: false,
  selectedDatasetId: null,
  loading: false,
};

export const fetchAllDatasets = createAsyncThunk(
  "dataset/fetchAllDatasets",
  async () => {
    const response = await api.get("/api/datasets");
    return response.data.map((dataset: any) => ({
      id: dataset.id,
      name: dataset.name,
    }));
  }
);

export const exportAllAnnotations = createAsyncThunk(
  "dataset/export_annotations",
  async (data: ExportAnnotation) => {
    const response = await api.get(
      `/api/datasets/${data.dataset_id}/annotations/export?format=${data.format}`,
      { responseType: "blob" }
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
  }
);

export const datasetSlice = createSlice({
  name: "dataset",
  initialState,
  reducers: {
    selectDataset: (state, action: PayloadAction<number | null>) => {
      state.selectedDatasetId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAllDatasets.fulfilled, (state, action) => {
      state.allDatasets = action.payload;
    });
    builder.addCase(exportAllAnnotations.pending, (state, action) => {
      state.loading = true;
    });
    builder.addCase(exportAllAnnotations.fulfilled, (state, action) => {
      state.annotationExported = true;
      state.loading = false;
    });
    builder.addCase(exportAllAnnotations.rejected, (state, action) => {
      state.loading = false;
      state.annotationExported = false;
    });
  },
});

export const { selectDataset } = datasetSlice.actions;
export default datasetSlice.reducer;
