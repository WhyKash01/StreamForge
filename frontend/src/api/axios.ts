import axios from 'axios';
import { store } from '../store/store';

const api = axios.create({
  baseURL: 'http://localhost:8080/api',
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

// Response Interceptor: Handle Token Refresh (Optional extension for later)
// api.interceptors.response.use(...) 

export default api;
