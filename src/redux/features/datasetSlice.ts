import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";

export interface DatasetState {
  allDatasets: { id: string; name: string }[];
}

const initialState: DatasetState = {
  allDatasets: [],
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
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchAllDatasets.fulfilled, (state, action) => {
      state.allDatasets = action.payload;
    });
  },
});

export default datasetSlice.reducer;
