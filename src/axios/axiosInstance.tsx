import axios from "axios";
import store from "../redux/store";

const api = axios.create({
  baseURL: import.meta.env.VITE_YAPAT_BACKEND_URL,
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
  (error) => Promise.reject(error)
);

export default api;
