import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";
import type { User } from "../../types";

export interface Auth {
  name: string;
  password: string;
  access_token: string;
}

export interface AuthState {
  loginSuccess: boolean;
  user: User | null;
  registerSuccess: boolean;
  loginLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string | ReactNode | null;
}

const initialState: AuthState = {
  //   name: "",
  //   password: "",
  status: "idle",
  user: null,
  accessToken: localStorage.getItem("accessToken") || null,
  loginSuccess: false,
  registerSuccess: false,
  loginLoading: false,
  isAuthenticated: !!localStorage.getItem("accessToken"),
  error: null,
};

export const loginAsync = createAsyncThunk<
  Auth, // success return type
  { username: string; password: string } // argument type
>(
  // argument passed in
  "auth/login",
  async (body, thunkApi) => {
    try {
      const response = await api.post(`/api/auth/login`, body);
      return response.data;
    } catch (error: JSON | any) {
      return thunkApi.rejectWithValue(error.response.data);
    }
  },
);

export const registerAsync = createAsyncThunk<
  Auth, // success return type
  {
    username: string;
    password: string;
    role: string;
    team_invitation_token: string | null;
  } // argument type
>(
  // argument passed in
  "auth/register",
  async (body, thunkApi) => {
    try {
      const response = await api.post(`/api/auth/register`, body);
      return response.data;
    } catch (error: JSON | any) {
      return thunkApi.rejectWithValue(error.response.data);
    }
  },
);

export const getLoggedInUser = createAsyncThunk(
  "auth/me",
  async (accessToken, thunkAPI) => {
    try {
      const response = await api.get(`/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: JSON | any) {
      return thunkAPI.rejectWithValue(error.response.data);
    }
  },
);

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    // Your original sync login
    logout: (state) => {
      state.accessToken = null;
      state.loginSuccess = false;
      state.isAuthenticated = false;
      localStorage.removeItem("accessToken");
    },
    clearError: (state) => {
      state.error = null;
    },
    resetAuth: (state) => {
      state.loginSuccess = false;
      state.registerSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getLoggedInUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(loginAsync.pending, (state) => {
        state.status = "loading";
        state.loginLoading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        console.log(action.payload);
        state.loginLoading = false;
        state.status = "succeeded";
        state.accessToken = action.payload.access_token;
        localStorage.setItem("accessToken", action.payload.access_token);
        state.isAuthenticated = true;
        state.loginSuccess = true;
        // state.name = action.payload.name;
        // state.password = action.payload.password;
      })
      .addCase(loginAsync.rejected, (state, action: any) => {
        state.loginLoading = false;
        state.status = "failed";
        state.error = action.payload.detail ?? "Unknown error";
        state.loginSuccess = false;
      })
      .addCase(registerAsync.pending, (state) => {
        state.status = "loading";
        state.loginLoading = true;
        state.error = null;
      })
      .addCase(registerAsync.fulfilled, (state, action) => {
        state.loginLoading = false;
        state.status = "succeeded";
        state.accessToken = action.payload.access_token;
        localStorage.setItem("accessToken", action.payload.access_token);
        state.isAuthenticated = true;
        state.registerSuccess = true;
      })
      .addCase(registerAsync.rejected, (state, action) => {
        state.loginLoading = false;
        state.status = "failed";
        state.error = action.error.message ?? "Unknown error";
        state.registerSuccess = false;
      });
  },
});

// Export actions and reducer
export const { logout, clearError, resetAuth } = authSlice.actions;
export default authSlice.reducer;
