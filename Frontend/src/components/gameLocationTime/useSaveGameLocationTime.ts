import { addHours } from 'date-fns';
import type { Club, Court, Game } from '@/types';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { gamesApi } from '@/api/games';
import { gameCourtsApi } from '@/api/gameCourts';
import { createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';
import type { EditLocationTimeDraft } from './locationTimeDraft';
import { computePendingBookingUnlinks } from './computePendingBookingUnlinks';
import {
  LocationTimePartialSaveError,
  type LocationTimeSaveStep,
} from './locationTimeSaveErrors';

export type LocationTimeSaveDraft = {
  clubId?: string;
  courtId?: string;
  courtIds?: string[];
  startTime?: string;
  endTime?: string;
  timeOverride?: boolean;
  hasBookedCourt?: boolean;
  addBookingIds: string[];
  removeBookingIds: string[];
  snapshots?: BookingSnapshotInput[];
};

async function runSaveStep(
  step: LocationTimeSaveStep,
  completedSteps: LocationTimeSaveStep[],
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    completedSteps.push(step);
  } catch (cause) {
    throw new LocationTimePartialSaveError(step, completedSteps, cause);
  }
}

export async function saveLocationTime(gameId: string, draft: LocationTimeSaveDraft): Promise<Game> {
  const completedSteps: LocationTimeSaveStep[] = [];
  const updateData: Partial<Game> = {};
  if (draft.clubId !== undefined) updateData.clubId = draft.clubId;
  if (draft.courtId !== undefined) updateData.courtId = draft.courtId;
  if (draft.startTime) updateData.startTime = draft.startTime;
  if (draft.endTime) updateData.endTime = draft.endTime;
  if (draft.timeOverride !== undefined) updateData.timeOverride = draft.timeOverride;
  if (draft.hasBookedCourt !== undefined) updateData.hasBookedCourt = draft.hasBookedCourt;
  if (draft.startTime && draft.endTime) updateData.timeIsSet = true;

  if (Object.keys(updateData).length > 0) {
    await runSaveStep('gameFields', completedSteps, async () => {
      await gamesApi.update(gameId, updateData);
    });
  }

  if (draft.addBookingIds.length > 0 || draft.removeBookingIds.length > 0) {
    await runSaveStep('bookings', completedSteps, async () => {
      await gamesApi.patchBookings(gameId, {
        add: draft.addBookingIds.length > 0 ? draft.addBookingIds : undefined,
        remove: draft.removeBookingIds.length > 0 ? draft.removeBookingIds : undefined,
      });
    });
  }

  if (draft.snapshots && draft.snapshots.length > 0) {
    await runSaveStep('snapshots', completedSteps, async () => {
      await gamesApi.putBookingSnapshots(gameId, { snapshots: draft.snapshots! });
    });
  }

  if (draft.courtIds && draft.courtIds.length > 0) {
    await runSaveStep('courts', completedSteps, async () => {
      await gameCourtsApi.setGameCourts(gameId, draft.courtIds!);
    });
  }

  const response = await gamesApi.getById(gameId);
  return response.data;
}

type BuildEditSaveDraftArgs = {
  game: Game;
  clubId: string;
  courtId: string;
  selectedCourtIds: string[];
  whenSelectedDate: Date;
  whenSelectedTime: string;
  whenDuration: number;
  hasBookedCourt: boolean;
  club: Club | undefined;
  courts: Court[];
  pendingRemoveBookingIds: string[];
  locationTimeDraft: EditLocationTimeDraft | null;
  bookingOverrides?: {
    externalBookingIds: string[];
    bookingSnapshots: BookingSnapshotInput[];
  };
};

export function buildEditLocationTimeSaveDraft({
  game,
  clubId,
  courtId,
  selectedCourtIds,
  whenSelectedDate,
  whenSelectedTime,
  whenDuration,
  hasBookedCourt,
  club,
  courts,
  pendingRemoveBookingIds,
  locationTimeDraft,
  bookingOverrides,
}: BuildEditSaveDraftArgs): LocationTimeSaveDraft {
  const initialLinked = game.linkedBookings?.map((b) => b.externalBookingId) ?? [];
  const removeBookingIds = computePendingBookingUnlinks(
    initialLinked,
    pendingRemoveBookingIds,
    locationTimeDraft?.selectedBookingIds ?? initialLinked,
    locationTimeDraft?.locationTimeMode === 'bookings',
  );

  const pickerAddIds =
    locationTimeDraft?.locationTimeMode === 'bookings'
      ? locationTimeDraft.selectedBookingIds.filter(
          (id) => !initialLinked.includes(id) && !removeBookingIds.includes(id),
        )
      : [];

  const bookFlowAddIds =
    bookingOverrides?.externalBookingIds.filter(
      (id) => !initialLinked.includes(id) && !removeBookingIds.includes(id),
    ) ?? [];

  const addBookingIds = [...new Set([...pickerAddIds, ...bookFlowAddIds])];

  const clubTimezone = getClubTimezone(club);

  let snapshots: BookingSnapshotInput[] | undefined;
  if (bookingOverrides?.bookingSnapshots.length) {
    snapshots = bookingOverrides.bookingSnapshots;
  } else if (addBookingIds.length > 0 && locationTimeDraft) {
    const records = locationTimeDraft.selectedBookingRecords.filter((b) =>
      addBookingIds.includes(b.uuid),
    );
    if (records.length > 0) {
      snapshots = buildBookingSnapshots(records, courts, { timeZone: clubTimezone });
    }
  }

  const remainingSnapshots = (game.linkedBookings ?? [])
    .filter((b) => !removeBookingIds.includes(b.externalBookingId))
    .map((b) => ({
      externalBookingId: b.externalBookingId,
      courtId: b.courtId,
      bookingStart: b.bookingStart,
      bookingEnd: b.bookingEnd,
    }))
    .filter((s) => s.bookingStart && s.bookingEnd);

  const unionSnapshots = [...remainingSnapshots, ...(snapshots ?? [])];
  const remainingLinkedCount = initialLinked.length - removeBookingIds.length + addBookingIds.length;

  let startTime: string | undefined;
  let endTime: string | undefined;
  let timeOverride = locationTimeDraft?.timeOverride ?? game.timeOverride ?? false;

  if (
    locationTimeDraft?.locationTimeMode === 'bookings' &&
    (addBookingIds.length > 0 || remainingLinkedCount > 0) &&
    unionSnapshots.length > 0
  ) {
    const derived = deriveGameTimeFromBookings(unionSnapshots, { timeZone: clubTimezone });
    if (timeOverride && locationTimeDraft.overrideStartTime && locationTimeDraft.overrideEndTime) {
      startTime = locationTimeDraft.overrideStartTime;
      endTime = locationTimeDraft.overrideEndTime;
    } else {
      startTime = derived.startTime ?? undefined;
      endTime = derived.endTime ?? undefined;
      timeOverride = false;
    }
  } else if (clubId && whenSelectedTime) {
    const start = createDateFromClubTime(whenSelectedDate, whenSelectedTime, club);
    const end = addHours(start, whenDuration);
    startTime = start.toISOString();
    endTime = end.toISOString();
  }

  const snapshotCourtIds = unionSnapshots
    .map((s) => s.courtId)
    .filter((id): id is string => Boolean(id));
  const courtIds = [
    ...new Set([
      ...selectedCourtIds,
      ...snapshotCourtIds,
      ...(courtId ? [courtId] : []),
    ]),
  ].filter(Boolean);

  const resolvedCourtId = courtIds[0] ?? courtId ?? undefined;
  const resolvedHasBookedCourt =
    remainingLinkedCount > 0 ? true : courtIds.length > 0 ? hasBookedCourt : hasBookedCourt;

  return {
    clubId: clubId || undefined,
    courtId: resolvedCourtId,
    courtIds: courtIds.length > 0 ? courtIds : undefined,
    startTime,
    endTime,
    timeOverride,
    hasBookedCourt: resolvedHasBookedCourt,
    addBookingIds,
    removeBookingIds,
    snapshots,
  };
}
