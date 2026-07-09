import { addHours } from 'date-fns';
import type { BooktimeMyClubRow } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { Club, Court, Game } from '@/types';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import { resolveBooktimeClubTimezone } from '@shared/gameBooking/linkBookingToGame';
import { gamesApi } from '@/api/games';
import { gameCourtsApi } from '@/api/gameCourts';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import { clubToBooktimeRow, resolveCourtForBooking } from '@/components/booktime/booktimeBookingUtils';
import { linkBookingToGame } from '@/services/gameBooking/linkBookingToGame';
import { createDateFromClubTime } from '@/hooks/useGameTimeDuration';
import type { EditLocationTimeDraft } from './locationTimeDraft';
import { resolveEditBookingUnlinks } from './computePendingBookingUnlinks';
import {
  LocationTimePartialSaveError,
  type LocationTimeSaveStep,
} from './locationTimeSaveErrors';

export type LinkBookingSaveAdd = {
  booking: BooktimeBookingRecord;
  courtId?: string;
};

export type LinkBookingSaveContext = {
  game: Game;
  club: BooktimeMyClubRow;
  adds: LinkBookingSaveAdd[];
  skipGameDatetimePatch?: boolean;
};

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
  linkBookingContext?: LinkBookingSaveContext;
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

async function applyLinkBookingAdds(context: LinkBookingSaveContext): Promise<void> {
  let currentGame = context.game;
  const timeZone = resolveBooktimeClubTimezone({ club: context.club, game: currentGame });
  for (const add of context.adds) {
    await linkBookingToGame({
      gameId: currentGame.id!,
      game: currentGame,
      booking: add.booking,
      club: context.club,
      options: {
        courtId: add.courtId,
        timeZone,
        skipGameDatetimePatch: context.skipGameDatetimePatch,
      },
    });
    const refreshed = await gamesApi.getById(currentGame.id!);
    currentGame = refreshed.data;
  }
}

export async function saveLocationTime(gameId: string, draft: LocationTimeSaveDraft): Promise<Game> {
  const completedSteps: LocationTimeSaveStep[] = [];

  if (draft.removeBookingIds.length > 0) {
    await runSaveStep('bookings', completedSteps, async () => {
      await gamesApi.patchBookings(gameId, { remove: draft.removeBookingIds });
    });
  }

  if (draft.linkBookingContext && draft.linkBookingContext.adds.length > 0) {
    await runSaveStep('bookings', completedSteps, async () => {
      await applyLinkBookingAdds(draft.linkBookingContext!);
    });
  }

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

  if (draft.addBookingIds.length > 0) {
    await runSaveStep('bookings', completedSteps, async () => {
      await gamesApi.patchBookings(gameId, { add: draft.addBookingIds });
    });
  }

  if (draft.snapshots && draft.snapshots.length > 0) {
    await runSaveStep('snapshots', completedSteps, async () => {
      await gamesApi.putBookingSnapshots(gameId, { snapshots: draft.snapshots! });
    });
  }

  if (draft.courtIds !== undefined) {
    await runSaveStep('courts', completedSteps, async () => {
      await gameCourtsApi.setGameCourts(gameId, draft.courtIds!);
    });
  }

  if (
    draft.removeBookingIds.length > 0 ||
    draft.addBookingIds.length > 0 ||
    Boolean(draft.linkBookingContext?.adds.length)
  ) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
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

function bookingRecordForAddId(
  id: string,
  locationTimeDraft: EditLocationTimeDraft | null,
  bookingOverrides: BuildEditSaveDraftArgs['bookingOverrides'],
): BooktimeBookingRecord | undefined {
  const fromPicker = locationTimeDraft?.selectedBookingRecords.find((b) => b.uuid === id);
  if (fromPicker) return fromPicker;
  const snap = bookingOverrides?.bookingSnapshots.find((s) => s.externalBookingId === id);
  if (!snap) return undefined;
  return {
    uuid: id,
    bookingStart: snap.bookingStart ?? '',
    bookingEnd: snap.bookingEnd ?? '',
  };
}

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
  const editAction = locationTimeDraft?.editReservationAction;
  const preservesLinkedBookings =
    editAction === 'keepCurrent' || editAction === 'changeGameTimeOnly';
  const removesAllLinkedBookings = editAction === 'unlink' || editAction === 'gameOnly';
  const bookingSelectionAuthoritative = Boolean(locationTimeDraft) && !preservesLinkedBookings && (
    removesAllLinkedBookings ||
    locationTimeDraft?.locationTimeMode === 'bookings' ||
    initialLinked.length > 0
  );
  const removeBookingIds = resolveEditBookingUnlinks({
    initialLinkedIds: initialLinked,
    pendingRemoveBookingIds,
    selectedBookingIds: removesAllLinkedBookings
      ? []
      : preservesLinkedBookings
        ? initialLinked
        : locationTimeDraft?.selectedBookingIds ?? initialLinked,
    bookingsMode: bookingSelectionAuthoritative,
    bookFlowBookingIds: bookingOverrides?.externalBookingIds,
  });

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
  const clubRow = club ? clubToBooktimeRow(club) : undefined;
  const linkAdds: LinkBookingSaveAdd[] = [];

  if (clubRow) {
    for (const id of addBookingIds) {
      const record = bookingRecordForAddId(id, locationTimeDraft, bookingOverrides);
      if (!record) continue;
      const snap = bookingOverrides?.bookingSnapshots.find((s) => s.externalBookingId === id);
      const courtIdForLink =
        snap?.courtId ?? resolveCourtForBooking(record, clubRow, '').courtId;
      linkAdds.push({ booking: record, courtId: courtIdForLink });
    }
  }

  const useAtomicLink = linkAdds.length > 0 && Boolean(clubRow);
  const effectiveAddBookingIds = useAtomicLink ? [] : addBookingIds;

  let snapshots: BookingSnapshotInput[] | undefined;
  if (!useAtomicLink) {
    if (bookingOverrides?.bookingSnapshots.length) {
      snapshots = bookingOverrides.bookingSnapshots;
    } else if (effectiveAddBookingIds.length > 0 && locationTimeDraft) {
      const records = locationTimeDraft.selectedBookingRecords.filter((b) =>
        effectiveAddBookingIds.includes(b.uuid),
      );
      if (records.length > 0) {
        snapshots = buildBookingSnapshots(records, courts);
      }
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
  const remainingLinkedCount =
    initialLinked.length - removeBookingIds.length + addBookingIds.length;

  let startTime: string | undefined;
  let endTime: string | undefined;
  let timeOverride = locationTimeDraft?.timeOverride ?? game.timeOverride ?? false;

  if (
    locationTimeDraft?.locationTimeMode === 'bookings' &&
    (addBookingIds.length > 0 || remainingLinkedCount > 0) &&
    unionSnapshots.length > 0
  ) {
    const derived = deriveGameTimeFromBookings(unionSnapshots);
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
  const initialCourtIds =
    game.gameCourts?.map((gc) => gc.courtId) ?? (game.courtId ? [game.courtId] : []);
  const courtIdsChanged = courtIds.join(',') !== initialCourtIds.join(',');

  const resolvedCourtId = courtIds[0] ?? courtId;
  const resolvedHasBookedCourt =
    remainingLinkedCount > 0
      ? true
      : editAction === 'gameOnly' || editAction === 'unlink'
        ? false
        : hasBookedCourt;

  return {
    clubId: clubId || undefined,
    courtId: resolvedCourtId,
    courtIds: courtIdsChanged ? courtIds : undefined,
    startTime,
    endTime,
    timeOverride,
    hasBookedCourt: resolvedHasBookedCourt,
    addBookingIds: effectiveAddBookingIds,
    removeBookingIds,
    snapshots: useAtomicLink ? undefined : snapshots,
    linkBookingContext:
      useAtomicLink && clubRow
        ? {
            game,
            club: clubRow,
            adds: linkAdds,
            skipGameDatetimePatch: timeOverride,
          }
        : undefined,
  };
}
