import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../axios/axiosInstance";
// import { reset } from "./customTaxonomySlice";
import { teamApi } from "../../services/api";
import { getErrorMessage } from "../../services/api";
import type { Invitation, Team, TeamMember } from "../../types";

export interface TeamState {
  status: "idle" | "loading" | "succeeded" | "failed";
  allTeams: Team[] | null;
  currentTeam: Team | null;
  teamMembers: TeamMember[];
  loading: boolean;
  teamCreated: boolean;
  teamUpdated: boolean;
  teamDeleted: boolean;
  invitation: Invitation | null;
  allTeamDatasets: [];
  error: any;
}

const initialState: TeamState = {
  allTeams: [],
  currentTeam: null,
  teamMembers: [],
  loading: false,
  allTeamDatasets: [],
  teamCreated: false,
  teamUpdated: false,
  teamDeleted: false,
  invitation: null,
  status: "idle",
  error: null,
};

export const fetchAllteams = createAsyncThunk("teams/all", async () => {
  const response = await api.get("/api/teams/");
  return response.data;
});

export const fetchTeamById = createAsyncThunk(
  "team/fetchById",
  async (teamId: string | number, { rejectWithValue }) => {
    try {
      return await teamApi.getTeamById(teamId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const createTeam = createAsyncThunk(
  "team/createNew",
  async (body: any) => {
    const response = await api.post("/api/teams/", body);
    return response.data;
  },
);

export const updateTeam = createAsyncThunk(
  "team/update",
  async (
    { teamId, body }: { teamId: string | number; body: { name?: string; description?: string } },
    { rejectWithValue },
  ) => {
    try {
      return await teamApi.updateTeam(teamId, body);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const deleteTeam = createAsyncThunk(
  "team/delete",
  async (teamId: string | number, { rejectWithValue }) => {
    try {
      await teamApi.deleteTeam(teamId);
      return teamId;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchTeamMembers = createAsyncThunk(
  "team/fetchMembers",
  async (teamId: string | number, { rejectWithValue }) => {
    try {
      return await teamApi.getTeamMembers(teamId);
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const removeTeamMember = createAsyncThunk(
  "team/removeMember",
  async (
    { teamId, userId }: { teamId: string | number; userId: number },
    { rejectWithValue },
  ) => {
    try {
      await teamApi.removeMember(teamId, userId);
      return userId;
    } catch (error: any) {
      return rejectWithValue(getErrorMessage(error));
    }
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
    resetTeamUpdated: (state) => {
      state.teamUpdated = false;
      state.error = null;
    },
    resetTeamDeleted: (state) => {
      state.teamDeleted = false;
      state.error = null;
    },
    clearInvitation: (state) => {
      state.invitation = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAllteams.fulfilled, (state, action) => {
      state.allTeams = action.payload;
    });

    builder.addCase(fetchTeamById.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchTeamById.fulfilled, (state, action) => {
      state.currentTeam = action.payload;
      state.loading = false;
    });
    builder.addCase(fetchTeamById.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    builder.addCase(createTeam.fulfilled, (state) => {
      state.teamCreated = true;
    });

    builder.addCase(updateTeam.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(updateTeam.fulfilled, (state, action) => {
      state.currentTeam = action.payload;
      state.teamUpdated = true;
      state.loading = false;
    });
    builder.addCase(updateTeam.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    builder.addCase(deleteTeam.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(deleteTeam.fulfilled, (state, action) => {
      state.teamDeleted = true;
      state.currentTeam = null;
      state.loading = false;
      state.allTeams = state.allTeams?.filter((t) => t.id !== String(action.payload)) ?? null;
    });
    builder.addCase(deleteTeam.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });

    builder.addCase(fetchTeamMembers.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(fetchTeamMembers.fulfilled, (state, action) => {
      state.teamMembers = action.payload;
      state.loading = false;
    });
    builder.addCase(fetchTeamMembers.rejected, (state) => {
      state.loading = false;
    });

    builder.addCase(removeTeamMember.fulfilled, (state, action) => {
      state.teamMembers = state.teamMembers.filter(
        (m) => m.user_id !== action.payload,
      );
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

export const { resetCreateTeam, resetTeamUpdated, resetTeamDeleted, clearInvitation } =
  teamSlice.actions;
export default teamSlice.reducer;
