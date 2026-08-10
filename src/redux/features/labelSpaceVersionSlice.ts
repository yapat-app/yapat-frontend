/**
 * Team Label-Space Versions Redux Slice
 *
 * Backs the versioned team label-space flow on the pre-annotation screen:
 * reading the active version (any member), listing submitted versions and
 * promoting one to active (owner only). See the backend contract in
 * `docs/team_active_label_space_frontend.md`.
 */

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { getErrorMessage, teamApi } from "../../services/api";
import type { CustomTaxonomyVersion, TeamMember } from "../../types";

export interface LabelSpaceVersionState {
  /** The team's active version, or null when none has been promoted yet. */
  activeVersion: CustomTaxonomyVersion | null;
  /** Submitted (awaiting-promotion) versions — owner only. */
  submissions: CustomTaxonomyVersion[];
  /** Team members, used to resolve `created_by_user_id` → author name. */
  members: TeamMember[];
  /** Team id the above data was last loaded for. */
  loadedTeamId: number | null;
  loadingActive: boolean;
  loadingSubmissions: boolean;
  /** Version id currently being promoted (for per-row button spinners). */
  promotingId: number | null;
  promoteSuccess: boolean;
  error: string | null;
}

const initialState: LabelSpaceVersionState = {
  activeVersion: null,
  submissions: [],
  members: [],
  loadedTeamId: null,
  loadingActive: false,
  loadingSubmissions: false,
  promotingId: null,
  promoteSuccess: false,
  error: null,
};

export const fetchActiveLabelSpace = createAsyncThunk(
  "labelSpaceVersion/fetchActive",
  async (teamId: number, { rejectWithValue }) => {
    try {
      return await teamApi.getActiveLabelSpace(teamId);
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchLabelSpaceSubmissions = createAsyncThunk(
  "labelSpaceVersion/fetchSubmissions",
  async (teamId: number, { rejectWithValue }) => {
    try {
      const [subs, members] = await Promise.all([
        // `all` → every version (incl. the active one), flagged by status.
        teamApi.getLabelSpaceSubmissions(teamId, "all"),
        // Members resolve the "who made it" author name. A member without the
        // owner role can't reach this list anyway, so a failure here is benign.
        teamApi.getTeamMembers(teamId).catch(() => [] as TeamMember[]),
      ]);
      return { taxonomies: subs.taxonomies, members };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const promoteVersion = createAsyncThunk(
  "labelSpaceVersion/promote",
  async (
    params: { teamId: number; taxonomyDbId: number },
    { rejectWithValue },
  ) => {
    try {
      return await teamApi.promoteActiveLabelSpace(
        params.teamId,
        params.taxonomyDbId,
      );
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  },
);

export const labelSpaceVersionSlice = createSlice({
  name: "labelSpaceVersion",
  initialState,
  reducers: {
    clearPromoteSuccess: (state) => {
      state.promoteSuccess = false;
    },
    setLoadedTeamId: (state, action) => {
      state.loadedTeamId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchActiveLabelSpace.pending, (state) => {
        state.loadingActive = true;
        state.error = null;
      })
      .addCase(fetchActiveLabelSpace.fulfilled, (state, action) => {
        state.loadingActive = false;
        state.activeVersion = action.payload;
      })
      .addCase(fetchActiveLabelSpace.rejected, (state, action) => {
        state.loadingActive = false;
        state.error = action.payload as string;
      })
      .addCase(fetchLabelSpaceSubmissions.pending, (state) => {
        state.loadingSubmissions = true;
        state.error = null;
      })
      .addCase(fetchLabelSpaceSubmissions.fulfilled, (state, action) => {
        state.loadingSubmissions = false;
        state.submissions = action.payload.taxonomies;
        state.members = action.payload.members;
      })
      .addCase(fetchLabelSpaceSubmissions.rejected, (state, action) => {
        state.loadingSubmissions = false;
        state.error = action.payload as string;
      })
      .addCase(promoteVersion.pending, (state, action) => {
        state.promotingId = action.meta.arg.taxonomyDbId;
        state.error = null;
        state.promoteSuccess = false;
      })
      .addCase(promoteVersion.fulfilled, (state, action) => {
        state.promotingId = null;
        state.promoteSuccess = true;
        state.activeVersion = action.payload;
        // The list holds every version (status=all): flip the promoted one to
        // active and demote the previously-active one. A re-fetch reconciles.
        state.submissions = state.submissions.map((v) =>
          v.id === action.payload.id
            ? { ...v, status: "active" }
            : v.status === "active"
              ? { ...v, status: "submitted" }
              : v,
        );
      })
      .addCase(promoteVersion.rejected, (state, action) => {
        state.promotingId = null;
        state.error = action.payload as string;
      });
  },
});

export const { clearPromoteSuccess, setLoadedTeamId } =
  labelSpaceVersionSlice.actions;
export default labelSpaceVersionSlice.reducer;
