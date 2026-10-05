/**
 * Court slots + reservation changes (booking redesign).
 *
 * Every write the new court-reservation UI makes passes `?timePolicy=explicit`:
 * booking writes never derive or move the game's time; only an explicit save
 * does, and with it the server refuses a court clash (409 `court.clash`).
 * Shipped apps keep calling the old endpoints without it.
 */
import api from './axios';
import type { ApiResponse } from '@/types';
import type { BookingSnapshotInput, LinkBookingToGameBody } from '@shared/gameBooking/contracts';
import type { CourtSlotReservation } from '@shared/gameBooking/courtReservations';
import type { GameCourtPayload, LinkedBookingPayload } from '@/features/court-reservations/courtReservationsInput';

const EXPLICIT = { params: { timePolicy: 'explicit' } } as const;

export type CourtSlotsBody = {
  slots: Array<{ courtId: string; reservation: CourtSlotReservation }>;
  reportedAnyCourtCount: number;
  courtSlotCount?: number;
};

/** `PUT /games/:id/court-slots` response. */
export type CourtSlotsView = {
  gameId?: string;
  courtId?: string | null;
  hasBookedCourt: boolean;
  bookingStatus: 'NONE' | 'MANUAL' | 'EXTERNAL_PARTIAL' | 'EXTERNAL_FULL';
  reportedAnyCourtCount: number;
  courtSlotCount?: number | null;
  gameCourts: GameCourtPayload[];
  linkedBookings: LinkedBookingPayload[];
};

export type LinkBookingToSlotBody = LinkBookingToGameBody & { gameCourtId?: string };

/* ---------------- reservation-change journal ---------------- */

export type ReservationChangeState = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK' | 'ABANDONED';
export type ReservationChangeStepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED' | 'NEEDS_CLUB';

export type ReservationChangeStep = {
  id: string;
  idempotencyKey: string;
  kind: string;
  status: ReservationChangeStepStatus;
  result?: unknown;
  error?: unknown;
  updatedAt?: string;
};

export type ReservationChange = {
  id: string;
  gameId: string;
  createdById: string;
  state: ReservationChangeState;
  /** Older than the server's staleness window; the next create abandons it. */
  stale?: boolean;
  plan: { steps?: Array<{ idempotencyKey: string; kind: string } & Record<string, unknown>> } | null;
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
  createdAt: string;
  updatedAt: string;
  steps: ReservationChangeStep[];
};

export type CreateReservationChangeBody = {
  plan: { steps: Array<{ idempotencyKey: string; kind: string } & Record<string, unknown>> };
  fromStart: string;
  fromEnd: string;
  toStart: string;
  toEnd: string;
};

/** `POST /reservation-changes/:id/save-game` — atomic, replay-safe. */
export type ReservationChangeSaveBody = {
  startTime: string;
  endTime: string;
  /** Full court-slots body (same as `PUT /games/:id/court-slots`). */
  slotUpdates?: CourtSlotsBody;
  /** `POST /games/:id/link-booking` bodies. */
  linksToAdd?: LinkBookingToSlotBody[];
  /** Link ids or provider booking ids. */
  linksToRemove?: string[];
};

export type ReservationChangeSaveResult = {
  replayed: boolean;
  result: { startTime: string; endTime: string; addedLinkIds: string[]; removedLinks: unknown[] };
  change: ReservationChange;
  linkedBookings: LinkedBookingPayload[];
};

/** A club-side step left for organizers (`GET /games/:id` → `pendingClubFollowUps`). */
export type PendingClubFollowUp = {
  changeId: string;
  changeState: ReservationChangeState;
  idempotencyKey: string;
  kind: string;
  error?: unknown;
  updatedAt?: string;
  step?: Record<string, unknown> | null;
};

export type UpstreamAcceptMode = 'move_game' | 'keep_game';

export const courtSlotsApi = {
  putCourtSlots: async (gameId: string, body: CourtSlotsBody) => {
    const response = await api.put<ApiResponse<CourtSlotsView>>(`/games/${gameId}/court-slots`, body, EXPLICIT);
    return response.data.data!;
  },

  linkBooking: async (gameId: string, body: LinkBookingToSlotBody) => {
    const response = await api.post<ApiResponse<LinkedBookingPayload[]>>(`/games/${gameId}/link-booking`, body, EXPLICIT);
    return response.data.data ?? [];
  },

  unlinkBookings: async (gameId: string, externalBookingIds: string[]) => {
    const response = await api.patch<ApiResponse<LinkedBookingPayload[]>>(
      `/games/${gameId}/bookings`,
      { remove: externalBookingIds },
      EXPLICIT,
    );
    return response.data.data ?? [];
  },

  putBookingSnapshots: async (gameId: string, snapshots: BookingSnapshotInput[]) => {
    const response = await api.put<ApiResponse<LinkedBookingPayload[]>>(
      `/games/${gameId}/booking-snapshots`,
      { snapshots },
      EXPLICIT,
    );
    return response.data.data ?? [];
  },

  /** `PUT /games/:id` with only the time (explicit policy: may 409 `court.clash`). */
  saveGameTime: async (gameId: string, window: { startTime: string; endTime: string }) => {
    const response = await api.put<ApiResponse<unknown>>(`/games/${gameId}`, window, EXPLICIT);
    return response.data;
  },

  createReservationChange: async (gameId: string, body: CreateReservationChangeBody) => {
    const response = await api.post<ApiResponse<ReservationChange> & { resumed?: boolean; abandonedId?: string | null }>(
      `/games/${gameId}/reservation-changes`,
      body,
    );
    return { change: response.data.data!, resumed: Boolean(response.data.resumed), abandonedId: response.data.abandonedId ?? null };
  },

  getActiveReservationChange: async (gameId: string): Promise<ReservationChange | null> => {
    const response = await api.get<ApiResponse<ReservationChange | null>>(`/games/${gameId}/reservation-changes/active`);
    return response.data.data ?? null;
  },

  patchReservationChangeStep: async (
    changeId: string,
    idempotencyKey: string,
    patch: { status: ReservationChangeStepStatus; result?: unknown; error?: unknown },
  ) => {
    await api.patch(
      `/reservation-changes/${encodeURIComponent(changeId)}/steps/${encodeURIComponent(idempotencyKey)}`,
      patch,
    );
  },

  saveReservationChangeGame: async (changeId: string, body: ReservationChangeSaveBody) => {
    const response = await api.post<ApiResponse<ReservationChangeSaveResult>>(
      `/reservation-changes/${encodeURIComponent(changeId)}/save-game`,
      body,
    );
    return response.data.data!;
  },

  finishReservationChange: async (changeId: string, state: Exclude<ReservationChangeState, 'RUNNING'>) => {
    await api.post(`/reservation-changes/${encodeURIComponent(changeId)}/finish`, { state });
  },

  /* ---------------- upstream drift ---------------- */

  acceptUpstream: async (
    gameId: string,
    linkId: string,
    body: { mode: UpstreamAcceptMode; startTime?: string; endTime?: string },
  ) => {
    const response = await api.post<ApiResponse<unknown>>(
      `/games/${gameId}/bookings/${encodeURIComponent(linkId)}/accept-upstream`,
      body,
    );
    return response.data;
  },

  reportUpstreamCheck: async (
    gameId: string,
    linkId: string,
    body: { present: boolean; start?: string; end?: string },
  ) => {
    const response = await api.post<ApiResponse<unknown>>(
      `/games/${gameId}/bookings/${encodeURIComponent(linkId)}/upstream-check`,
      body,
    );
    return response.data;
  },
};
