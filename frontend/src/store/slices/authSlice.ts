import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface User {
  id: number;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  stream_key?: string;
  live_title?: string;
  live_description?: string;
  live_thumbnail_url?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

const getUserFromStorage = () => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

const initialState: AuthState = {
  user: getUserFromStorage(),
  accessToken: localStorage.getItem('accessToken') || null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{ user: User; accessToken: string }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      localStorage.setItem('user', JSON.stringify(action.payload.user));
      localStorage.setItem('accessToken', action.payload.accessToken);
    },
    updateLiveSettings: (
      state,
      action: PayloadAction<{ live_title: string; live_description: string; live_thumbnail_url: string }>
    ) => {
      if (state.user) {
        state.user.live_title = action.payload.live_title;
        state.user.live_description = action.payload.live_description;
        if (action.payload.live_thumbnail_url) {
          state.user.live_thumbnail_url = action.payload.live_thumbnail_url;
        }
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
    },
  },
});

export const { setCredentials, updateLiveSettings, logout } = authSlice.actions;
export default authSlice.reducer;
