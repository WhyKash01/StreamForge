import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DBVideo {
  ID: number;
  title: string;
  description: string;
  url: string;
  type: string;
  status: string;
  thumbnail_url: string;
  views?: number;
  duration?: number;
  category?: string;
  tags?: string;
  CreatedAt: string;
  User?: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

interface AppState {
  isLoading: boolean;
  videos: DBVideo[];
}

const initialState: AppState = {
  isLoading: true,
  videos: [],
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setVideos: (state, action: PayloadAction<DBVideo[]>) => {
      state.videos = action.payload;
    },
  },
});

export const { setLoading, setVideos } = appSlice.actions;
export default appSlice.reducer;
