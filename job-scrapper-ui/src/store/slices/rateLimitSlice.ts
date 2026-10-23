/**
 * @file Redux Slice for Client Rate Limiting
 * @summary Tracks API request timestamps in the Redux store to enforce 10 requests per 1 minute window
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface RateLimitState {
  timestamps: number[];
  maxRequests: number;
  windowMs: number;
}

const initialState: RateLimitState = {
  timestamps: [],
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
};

export const rateLimitSlice = createSlice({
  name: 'rateLimit',
  initialState,
  reducers: {
    recordRequestTimestamp: (state, action: PayloadAction<number>) => {
      const now = action.payload;
      state.timestamps = [...state.timestamps.filter((t) => now - t < state.windowMs), now];
    },
    pruneOldTimestamps: (state) => {
      const now = Date.now();
      state.timestamps = state.timestamps.filter((t) => now - t < state.windowMs);
    },
    resetRateLimit: (state) => {
      state.timestamps = [];
    },
  },
});

export const { recordRequestTimestamp, pruneOldTimestamps, resetRateLimit } = rateLimitSlice.actions;
export default rateLimitSlice.reducer;
