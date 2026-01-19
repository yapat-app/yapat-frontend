import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../axios/axiosInstance";

export interface TeamState {
  status: "idle" | "loading" | "succeeded" | "failed";
  allTeams: [] | null;
  teamCreated: boolean;
  allTeamDatasets: [];
  error: any;
}

const initialState: TeamState = {
  allTeams: [],
  allTeamDatasets: [],
  teamCreated: false,
  status: "idle",
  error: null,
};

export const fetchAllteams = createAsyncThunk("teams/all", async () => {
  const response = await api.get("/api/teams");
  return response.data;
});

export const createTeam = createAsyncThunk(
  "team/createNew",
  async (body: any) => {
    const response = await api.post("/api/teams", body);
    return response.data;
  },
);

export const fetchTeamDatasets = createAsyncThunk(
  "team/getAllDatasets",
  async (body: any) => {
    const response = await api.post("/api/teams/available-datasets", body);
    return response.data;
  },
);

export const teamSlice = createSlice({
  name: "team",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchAllteams.fulfilled, (state, action) => {
      state.allTeams = action.payload;
    });
    builder.addCase(createTeam.fulfilled, (state) => {
      state.teamCreated = true;
    });
    builder.addCase(fetchTeamDatasets.fulfilled, (state) => {
      state.teamCreated = true;
    });
  },
});

export default teamSlice.reducer;
