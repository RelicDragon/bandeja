import api from './axios';
import type { ApiResponse } from '@/types';
import type { WeatherRiskSeverity } from '@/types/gameCardEnrichment';

/** PRD 357 — `GET /games/:id/weather-alert`. */
export interface GameWeatherAlertState {
  severity: WeatherRiskSeverity;
  /** Peak precipitation probability across the game window, 0–100. */
  pop: number;
  /** Peak wind across the game window, km/h. */
  windKph: number;
  /** ISO time the numbers describe — normally the hour the game is worst hit. */
  at: string;
  /** Wind, not rain, crossed the threshold: the banner reads slate, not amber. */
  windDriven: boolean;
  keptAsPlanned: boolean;
  keepAsPlannedAt: string | null;
  outdoor: boolean;
  outdoorCourtCount: number;
  totalCourtCount: number;
}

/** PRD 357 — `GET /games/:id/indoor-alternatives`. */
export interface IndoorAlternativeCourt {
  id: string;
  name: string;
  isFree: boolean;
  busyKind: 'game' | 'hold' | 'external' | null;
}

/** A court the game is currently on, in `gameCourts` order. */
export interface GameCurrentCourt {
  id: string;
  name: string;
  isIndoor: boolean;
}

export interface IndoorAlternatives {
  clubId: string | null;
  startTime: string;
  endTime: string;
  outdoorCourtCount: number;
  totalCourtCount: number;
  /** Swap the outdoor one being moved for the picked court; keep the rest. */
  currentCourts: GameCurrentCourt[];
  courts: IndoorAlternativeCourt[];
  /** A linked external booking sits on a court of this game and is not moved. */
  hasLinkedBooking: boolean;
  linkedBookingCourtNames: string[];
  isLoadingExternalSlots: boolean;
}

export const gameWeatherApi = {
  getAlertState: async (gameId: string) => {
    const response = await api.get<ApiResponse<GameWeatherAlertState>>(
      `/games/${gameId}/weather-alert`,
    );
    return response.data;
  },

  keepAsPlanned: async (gameId: string) => {
    const response = await api.post<ApiResponse<GameWeatherAlertState>>(
      `/games/${gameId}/weather-alert/keep`,
    );
    return response.data;
  },

  /** Posts the "Moved to Court 1 (indoor)" system message after the edit lands. */
  noteMovedIndoor: async (gameId: string, courtId: string) => {
    const response = await api.post<ApiResponse<{ posted: boolean }>>(
      `/games/${gameId}/weather-alert/moved-indoor`,
      { courtId },
    );
    return response.data;
  },

  getIndoorAlternatives: async (gameId: string) => {
    const response = await api.get<ApiResponse<IndoorAlternatives>>(
      `/games/${gameId}/indoor-alternatives`,
    );
    return response.data;
  },
};
