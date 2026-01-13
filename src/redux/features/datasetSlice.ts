import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";

export interface DatasetState {
  allDatasets: { id: string; name: string }[];
  selectedDatasetId: number | null;
}

const initialState: DatasetState = {
  allDatasets: [],
  selectedDatasetId: null,
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
  },
});

export const { selectDataset } = datasetSlice.actions;
export default datasetSlice.reducer;
