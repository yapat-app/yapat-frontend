import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";

export interface InvitationState {
  status: "idle" | "loading" | "succeeded" | "failed";
  invitationCreated: boolean;
  invitationLoading: boolean;
  invitationLinkToken: string | null;
  error: any;
}

const initialState: InvitationState = {
  status: "idle",
  invitationCreated: false,
  invitationLoading: false,
  invitationLinkToken: null,
  error: null,
};

export const createInvitation = createAsyncThunk(
  "invitation/createInvitation",
  async (body: any, thunkApi) => {
    try {
      const response = await api.post(
        `${import.meta.env.VITE_YAPAT_BACKEND_URL}/api/invitations`,
        body
      );
      return response.data;
    } catch (error: JSON | any) {
      return thunkApi.rejectWithValue(error.response.data);
    }
  }
);

export const invitationSlice = createSlice({
  name: "invitation",
  initialState,
  reducers: {
    resetInvitationState: (state) => {
      state.status = "idle";
      state.invitationCreated = false;
      state.invitationLoading = false;
      state.invitationLinkToken = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createInvitation.pending, (state) => {
        state.status = "loading";
        state.invitationLoading = true;
        state.error = null;
      })
      .addCase(createInvitation.fulfilled, (state, action) => {
        state.invitationLoading = false;
        state.status = "succeeded";
        state.invitationCreated = true;
        state.invitationLinkToken = action.payload.token;
      })
      .addCase(createInvitation.rejected, (state, action) => {
        state.invitationLoading = false;
        state.invitationCreated = false;
        state.status = "failed";
        state.error = action.error.message ?? "Unknown error";
      });
  },
});

export const { resetInvitationState } = invitationSlice.actions;
export default invitationSlice.reducer;
