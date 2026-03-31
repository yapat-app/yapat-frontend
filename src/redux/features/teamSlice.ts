import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../axios/axiosInstance";
// import { reset } from "./customTaxonomySlice";
import { teamApi } from "../../services/api";
import { getErrorMessage } from "../../services/api";
import type { Invitation } from "../../types";

export interface TeamState {
  status: "idle" | "loading" | "succeeded" | "failed";
  allTeams: any[] | null;
  loading: boolean;
  teamCreated: boolean;
  teamDeleted: boolean;
  invitation: Invitation | null;
  allTeamDatasets: any[];
  error: any;
}

const initialState: TeamState = {
  allTeams: [] as any[],
  loading: false,
  allTeamDatasets: [] as any[],
  teamCreated: false,
  teamDeleted: false,
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

export const deleteTeam = createAsyncThunk(
  "team/delete",
  async (teamId: number, { rejectWithValue }) => {
    try {
      await teamApi.deleteTeam(teamId);
      return teamId;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
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
    resetDeleteTeam: (state) => {
      state.teamDeleted = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAllteams.fulfilled, (state, action) => {
      state.allTeams = action.payload;
    });
    builder.addCase(createTeam.fulfilled, (state) => {
      state.teamCreated = true;
    });
    builder.addCase(deleteTeam.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(deleteTeam.fulfilled, (state, action) => {
      state.loading = false;
      state.teamDeleted = true;
      state.allTeams =
        state.allTeams?.filter((t: any) => t.id !== action.payload) ?? null;
    });
    builder.addCase(deleteTeam.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
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

export const { resetCreateTeam, resetDeleteTeam } = teamSlice.actions;
export default teamSlice.reducer;
