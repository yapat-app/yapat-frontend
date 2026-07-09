import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import api from "../../axios/axiosInstance";
import type { User } from "../../types";
import { getErrorMessage, adminApi } from "../../services/api";
import { normalizeUser } from "../../utils/normalizeUserRole";

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
  // null = not checked yet. Used to decide whether the "Admin" option should
  // be offered on the self-service registration form -- only meaningful
  // before the very first admin exists (see app/api/auth.py::admin_exists).
  adminExists: boolean | null;
  // Admin-only user management (see app/api/auth.py::admin_list_users /
  // admin_create_user). Separate from the login/register status fields
  // above so the AdminUsers page doesn't interfere with login state.
  allUsers: User[];
  usersLoading: boolean;
  userCreated: boolean;
  adminUserError?: string | ReactNode | null;
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
  adminExists: null,
  allUsers: [],
  usersLoading: false,
  userCreated: false,
  adminUserError: null,
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
    } catch (error: any) {
      return thunkApi.rejectWithValue(getErrorMessage(error));
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
    } catch (error: any) {
      return thunkApi.rejectWithValue(getErrorMessage(error));
    }
  },
);

export const checkAdminExistsAsync = createAsyncThunk<{ admin_exists: boolean }, void>(
  "auth/adminExists",
  async (_arg, thunkApi) => {
    try {
      const response = await api.get(`/api/auth/admin-exists`);
      return response.data;
    } catch (error: any) {
      return thunkApi.rejectWithValue(getErrorMessage(error));
    }
  },
);

export const fetchUsersAsync = createAsyncThunk<User[], void>(
  "auth/fetchUsers",
  async (_arg, thunkApi) => {
    try {
      return await adminApi.listUsers();
    } catch (error: any) {
      return thunkApi.rejectWithValue(getErrorMessage(error));
    }
  },
);

export const createUserAsync = createAsyncThunk<
  User,
  {
    username: string;
    password: string;
    role: "user" | "team_owner" | "admin";
    full_name?: string;
  }
>("auth/createUser", async (body, thunkApi) => {
  try {
    return await adminApi.createUser(body);
  } catch (error: any) {
    return thunkApi.rejectWithValue(getErrorMessage(error));
  }
});

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
    resetUserCreated: (state) => {
      state.userCreated = false;
      state.adminUserError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getLoggedInUser.fulfilled, (state, action) => {
        state.user = normalizeUser(action.payload);
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
        state.error = action.payload ?? "Unknown error";
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
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          "Unknown error";
        state.registerSuccess = false;
      })
      .addCase(checkAdminExistsAsync.fulfilled, (state, action) => {
        state.adminExists = action.payload.admin_exists;
      })
      .addCase(checkAdminExistsAsync.rejected, (state) => {
        // Fail closed: if we can't tell, don't offer self-service admin
        // registration -- the backend still enforces this regardless, this
        // is only about whether to show the option.
        state.adminExists = true;
      })
      .addCase(fetchUsersAsync.pending, (state) => {
        state.usersLoading = true;
        state.adminUserError = null;
      })
      .addCase(fetchUsersAsync.fulfilled, (state, action) => {
        state.usersLoading = false;
        state.allUsers = action.payload.map(normalizeUser);
      })
      .addCase(fetchUsersAsync.rejected, (state, action) => {
        state.usersLoading = false;
        state.adminUserError =
          (action.payload as string | undefined) ??
          action.error.message ??
          "Unknown error";
      })
      .addCase(createUserAsync.pending, (state) => {
        state.usersLoading = true;
        state.adminUserError = null;
        state.userCreated = false;
      })
      .addCase(createUserAsync.fulfilled, (state, action) => {
        state.usersLoading = false;
        state.userCreated = true;
        state.allUsers = [...state.allUsers, normalizeUser(action.payload)];
      })
      .addCase(createUserAsync.rejected, (state, action) => {
        state.usersLoading = false;
        state.userCreated = false;
        state.adminUserError =
          (action.payload as string | undefined) ??
          action.error.message ??
          "Unknown error";
      });
  },
});

// Export actions and reducer
export const { logout, clearError, resetAuth, resetUserCreated } = authSlice.actions;
export default authSlice.reducer;
