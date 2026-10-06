/**
 * Club admin console writes. Hold create/move/delete are optimistic on the cached schedule days
 * and roll back on failure; every write invalidates schedule, bookings and dashboard on settle.
 * Errors toast with the server `code` mapped to the namespace errors.* keys — except codes the caller
 * handles itself (`silentCodes`, e.g. `holdOverlap` → "create anyway" dialog). Callers await
 * `mutateAsync` and close their sheet only on success.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CancelGameBody,
  CreateHoldBody,
  ScheduleHoldSlot,
  UpdateHoldBody,
} from '@shared/clubAdmin/contract';
import { clubLocalDate } from '@shared/clubAdmin/clubTime';
import { clubAdminApi } from '@/api/clubAdmin';
import type { ClubAdminErrorSuffix } from '@/api/clubAdminErrors';
import { toastClubAdminError } from './toastError';
import { invalidateAfterBookingChange } from './invalidation';
import {
  OPTIMISTIC_HOLD_PREFIX,
  findHold,
  insertSlot,
  patchHold,
  removeGame,
  removeHolds,
  restoreSchedule,
  snapshotSchedule,
  updateScheduleDay,
  updateScheduleDays,
  type OptimisticHoldSlot,
  type ScheduleSnapshot,
} from './scheduleCache';
import { clubAdminKeys } from './keys';
import { holdDeletePredicate, type DeleteHoldVars } from './holdPredicates';
import type { ClubScheduleResponseV2 } from '@shared/clubAdmin/contract';

let optimisticSeq = 0;

export function optimisticHoldSlot(body: CreateHoldBody): OptimisticHoldSlot {
  optimisticSeq += 1;
  return {
    type: 'hold',
    holdId: `${OPTIMISTIC_HOLD_PREFIX}${optimisticSeq}`,
    courtId: body.courtId,
    label: body.label,
    note: body.note ?? null,
    startTime: body.startTime,
    endTime: body.endTime,
    seriesId: null,
    customerName: body.customerName ?? null,
    customerPhone: body.customerPhone ?? null,
    billing: null,
    optimistic: true,
  };
}

type Ctx = { snapshot: ScheduleSnapshot };

export function useCreateHoldMutation(clubId: string, timeZone: string, silentCodes: readonly ClubAdminErrorSuffix[] = ['holdOverlap']) {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof clubAdminApi.createHold>>, unknown, CreateHoldBody, Ctx>({
    mutationFn: (body) => clubAdminApi.createHold(clubId, body),
    onMutate: async (body) => {
      const snapshot = await snapshotSchedule(qc, clubId);
      const date = clubLocalDate(new Date(body.startTime), timeZone);
      updateScheduleDay(qc, clubId, date, (d) => insertSlot(d, optimisticHoldSlot(body)));
      return { snapshot };
    },
    onError: (err, _body, ctx) => {
      restoreSchedule(qc, ctx?.snapshot);
      toastClubAdminError(err, silentCodes);
    },
    onSettled: () => invalidateAfterBookingChange(qc, clubId),
  });
}

export interface UpdateHoldVars {
  holdId: string;
  patch: UpdateHoldBody & { detectOverlap?: boolean };
}

export function useUpdateHoldMutation(clubId: string, timeZone: string, silentCodes: readonly ClubAdminErrorSuffix[] = ['holdOverlap']) {
  const qc = useQueryClient();
  return useMutation<void, unknown, UpdateHoldVars, Ctx>({
    mutationFn: ({ holdId, patch }) => clubAdminApi.updateHold(clubId, holdId, patch),
    onMutate: async ({ holdId, patch }) => {
      const snapshot = await snapshotSchedule(qc, clubId);
      let current: ScheduleHoldSlot | null = null;
      for (const [, data] of snapshot) {
        current = findHold(data, holdId);
        if (current) break;
      }
      if (current) {
        const next: ScheduleHoldSlot = {
          ...current,
          ...(patch.courtId !== undefined ? { courtId: patch.courtId } : {}),
          ...(patch.startTime !== undefined ? { startTime: patch.startTime } : {}),
          ...(patch.endTime !== undefined ? { endTime: patch.endTime } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
          ...(patch.customerPhone !== undefined ? { customerPhone: patch.customerPhone } : {}),
        };
        const fromDate = clubLocalDate(new Date(current.startTime), timeZone);
        const toDate = clubLocalDate(new Date(next.startTime), timeZone);
        if (fromDate === toDate) {
          updateScheduleDay(qc, clubId, toDate, (d) => patchHold(d, holdId, next));
        } else {
          updateScheduleDay(qc, clubId, fromDate, (d) => removeHolds(d, (h) => h.holdId === holdId));
          updateScheduleDay(qc, clubId, toDate, (d) => insertSlot(d, next));
        }
      }
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      restoreSchedule(qc, ctx?.snapshot);
      toastClubAdminError(err, silentCodes);
    },
    onSettled: () => invalidateAfterBookingChange(qc, clubId),
  });
}

export function useDeleteHoldMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation<void, unknown, DeleteHoldVars, Ctx>({
    mutationFn: ({ holdId, scope }) => clubAdminApi.deleteHold(clubId, holdId, scope),
    onMutate: async (vars) => {
      const snapshot = await snapshotSchedule(qc, clubId);
      const predicate = holdDeletePredicate(vars);
      updateScheduleDays(qc, clubId, (d) => removeHolds(d, predicate));
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      restoreSchedule(qc, ctx?.snapshot);
      toastClubAdminError(err);
    },
    onSettled: () => invalidateAfterBookingChange(qc, clubId),
  });
}

export interface GameActionVars {
  gameId: string;
  mode: 'cancel' | 'clear';
  body: CancelGameBody;
}

export function useGameCourtActionMutation(clubId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, GameActionVars, Ctx>({
    mutationFn: ({ gameId, mode, body }) =>
      mode === 'cancel' ? clubAdminApi.cancelGame(clubId, gameId, body) : clubAdminApi.clearCourt(clubId, gameId, body),
    onMutate: async ({ gameId, mode }) => {
      const snapshot = await snapshotSchedule(qc, clubId);
      if (mode === 'cancel') updateScheduleDays(qc, clubId, (d) => removeGame(d, gameId));
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      restoreSchedule(qc, ctx?.snapshot);
      toastClubAdminError(err);
    },
    onSettled: () => invalidateAfterBookingChange(qc, clubId),
  });
}

/** Read a cached day without subscribing (e.g. to resolve a hold for a sheet). */
export function peekScheduleDay(qc: ReturnType<typeof useQueryClient>, clubId: string, date: string) {
  return qc.getQueryData<ClubScheduleResponseV2>(clubAdminKeys.schedule(clubId, date));
}
