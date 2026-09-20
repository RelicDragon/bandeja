/**
 * PRD 346 — attendance confirmation and no-show notes.
 *
 * Every call here is informative. Nothing in this file can remove a player,
 * change a seat or reorder a queue — the backend refuses to do so.
 */
import api from './axios';
import type { ApiResponse } from '@/types';
import type { AttendanceSummary, ParticipantAttendance } from '@/types/gameCardEnrichment';

export type AttendanceAnswer = Extract<ParticipantAttendance, 'CONFIRMED' | 'UNSURE'>;

export interface AttendanceNudgeState {
  allowed: boolean;
  remainingMs: number;
  /** Whole hours left, rounded up — what the cooldown caption shows. */
  remainingHours: number;
  nextAllowedAt: string | null;
}

export interface AttendanceParticipantRow {
  userId: string;
  attendance: ParticipantAttendance;
  attendanceUpdatedAt: string | null;
  noShowNotedAt: string | null;
  noShowNotedById: string | null;
}

export interface GameAttendanceDetails extends AttendanceSummary {
  participants: AttendanceParticipantRow[];
  /** `false` when the game has no time set or has already started. */
  answersOpen: boolean;
  /** `true` while an organizer can still note or undo a no-show. */
  noShowWindowOpen: boolean;
  nudge: AttendanceNudgeState;
}

export interface AttendanceRateSummary {
  /** Whole-percent rate, or `null` below the sample floor. */
  rate: number | null;
  attendedCount: number;
  noShowCount: number;
  sampleSize: number;
  minSample: number;
}

export interface AttendanceMonthPoint {
  /** `YYYY-MM` in UTC. */
  monthKey: string;
  attended: number;
  noShow: number;
}

export interface MyAttendanceStats extends AttendanceRateSummary {
  monthly: AttendanceMonthPoint[];
}

export interface MyNoShowNote {
  gameId: string;
  gameName: string | null;
  entityType: string;
  startTime: string;
  clubName: string | null;
  notedAt: string;
}

export const attendanceApi = {
  async get(gameId: string): Promise<GameAttendanceDetails> {
    const { data } = await api.get<ApiResponse<GameAttendanceDetails>>(
      `/games/${gameId}/attendance`,
    );
    return data.data;
  },

  async answer(
    gameId: string,
    state: AttendanceAnswer,
  ): Promise<{ attendance: ParticipantAttendance; summary: AttendanceSummary }> {
    const { data } = await api.post<
      ApiResponse<{ attendance: ParticipantAttendance; summary: AttendanceSummary }>
    >(`/games/${gameId}/attendance`, { state });
    return data.data;
  },

  async nudge(gameId: string): Promise<{ nudgedUserIds: string[]; cooldown: AttendanceNudgeState }> {
    const { data } = await api.post<
      ApiResponse<{ nudgedUserIds: string[]; cooldown: AttendanceNudgeState }>
    >(`/games/${gameId}/attendance/nudge`);
    return data.data;
  },

  async noteNoShow(
    gameId: string,
    userId: string,
  ): Promise<{ summary: AttendanceSummary; noShowNotedAt: string }> {
    const { data } = await api.post<
      ApiResponse<{ summary: AttendanceSummary; noShowNotedAt: string }>
    >(`/games/${gameId}/participants/${userId}/no-show`);
    return data.data;
  },

  async undoNoShow(gameId: string, userId: string): Promise<{ summary: AttendanceSummary }> {
    const { data } = await api.delete<ApiResponse<{ summary: AttendanceSummary }>>(
      `/games/${gameId}/participants/${userId}/no-show`,
    );
    return data.data;
  },

  async myNoShowNotes(): Promise<MyNoShowNote[]> {
    const { data } = await api.get<ApiResponse<MyNoShowNote[]>>('/games/me/no-show-notes');
    return data.data;
  },

  async myStats(sport?: string): Promise<MyAttendanceStats> {
    const { data } = await api.get<ApiResponse<MyAttendanceStats>>('/games/me/attendance-rate', {
      params: sport ? { sport } : undefined,
    });
    return data.data;
  },
};
