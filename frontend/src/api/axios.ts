import axios from 'axios';
import { store } from '../store/store';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
  withCredentials: true, // Important for refresh token cookie
});

// Request Interceptor: Attach Access Token
api.interceptors.request.use(
  (config) => {
    const token = store.getState().auth.accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

import { logout, setCredentials } from '../store/slices/authSlice';

// Response Interceptor: Handle Token Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If it's a 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const errorCode = error.response?.data?.code;

      if (errorCode === 'TOKEN_EXPIRED') {
        try {
          // Attempt to refresh the token using the httpOnly cookie
          const refreshResponse = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            {},
            { withCredentials: true }
          );

          const { access_token } = refreshResponse.data;

          // We don't have the user object from /refresh, so we keep the existing one
          // We will fetch /auth/me to sync later if needed
          const currentUser = store.getState().auth.user;
          if (currentUser) {
            store.dispatch(setCredentials({ user: currentUser, accessToken: access_token }));
          }

          // Update header and retry the original request
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError: any) {
          // If refresh fails or refresh token is expired, log out
          if (refreshError.response?.data?.code === 'REFRESH_TOKEN_EXPIRED' || refreshError.response?.status === 401) {
            store.dispatch(logout());
            window.location.href = '/login'; // Or use react-router-dom navigation if wired up outside components
          }
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
