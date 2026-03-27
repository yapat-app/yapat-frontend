import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../axios/axiosInstance";
// import { reset } from "./customTaxonomySlice";
import { teamApi } from "../../services/api";
import { getErrorMessage } from "../../services/api";
import type { Invitation } from "../../types";

export interface TeamState {
  status: "idle" | "loading" | "succeeded" | "failed";
  allTeams: [] | null;
  loading: boolean;
  teamCreated: boolean;
  invitation: Invitation | null;
  allTeamDatasets: [];
  error: any;
}

const initialState: TeamState = {
  allTeams: [],
  loading: false,
  allTeamDatasets: [],
  teamCreated: false,
  invitation: null,
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

export const createInvitationLink = createAsyncThunk(
  "team/invite",
  async (body: any, { rejectWithValue }) => {
    try {
      return await teamApi.createInvitation(body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const teamSlice = createSlice({
  name: "team",
  initialState,
  reducers: {
    resetCreateTeam: () => {
      return {
        ...initialState,
        teamCreated: false,
      };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAllteams.fulfilled, (state, action) => {
      state.allTeams = action.payload;
    });
    builder.addCase(createTeam.fulfilled, (state) => {
      state.teamCreated = true;
    });
    builder.addCase(createInvitationLink.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(createInvitationLink.fulfilled, (state, action) => {
      state.invitation = action.payload;
      state.loading = false;
    });
    builder.addCase(createInvitationLink.rejected, (state) => {
      state.loading = false;
      state.invitation = null;
    });
  },
});

export const { resetCreateTeam } = teamSlice.actions;
export default teamSlice.reducer;
