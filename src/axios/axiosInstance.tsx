import axios from "axios";
import store from "../redux/store";
import { logout } from "../redux/features/authSlice";

// Get base URL from runtime config (for Docker) or build-time env (for dev)
const getBaseURL = () => {
  // Check for runtime config (Docker/production)
  if (
    typeof window !== "undefined" &&
    (window as any).__ENV__?.VITE_YAPAT_BACKEND_URL
  ) {
    return (window as any).__ENV__.VITE_YAPAT_BACKEND_URL;
  }
  // Fall back to build-time env variable (development)
  return import.meta.env.VITE_YAPAT_BACKEND_URL || "http://localhost:8000";
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.auth.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      store.dispatch(logout());
    }
    return Promise.reject(error);
  },
);

export default api;
