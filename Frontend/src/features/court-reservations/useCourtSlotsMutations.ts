/**
 * Court-slot edits from the Courts card / slot sheet:
 *  - mark reserved / not reserved, give an "Any court" slot a court
 *    → `PUT /games/:id/court-slots` with the whole slot list;
 *  - link a provider reservation to a slot → `POST /games/:id/link-booking`
 *    with `gameCourtId` (`?timePolicy=explicit`: linking never moves the game);
 *  - unlink → `PATCH /games/:id/bookings` `{ remove }` (explicit).
 * `onChanged` gets the write's response (`CourtSlotsWriteResult`) so the
 * caller can patch the game at once (`applyCourtSlotsWrite`) and refresh in
 * the background — this hook owns no cache. Every call resolves to
 * `{ ok }` so a sheet can close on success and stay open on failure.
 */
import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CourtSlotView, GameCourtSlotInput } from '@shared/gameBooking/courtReservations';
import type { LinkBookingToGameBody } from '@shared/gameBooking/contracts';
import { courtSlotsApi } from '@/api/courtSlots';
import type { CourtSlotsWriteResult } from './courtSlotsCache';
import { buildCourtSlotsBody, reportedAnyCourtCountOf, type CourtSlotsChange } from './courtReservationsModel';
import { isSyntheticGameCourtId } from './courtReservationsInput';

export type CourtSlotsMutationKind =
  | 'mark_reserved'
  | 'mark_not_reserved'
  | 'assign_court'
  | 'set_count'
  | 'link'
  | 'unlink'
  | 'follow_up_done';

export type UseCourtSlotsMutationsOptions = {
  gameId: string;
  gameCourts: readonly GameCourtSlotInput[];
  slots: readonly CourtSlotView[];
  /** `Game.courtSlotCount` (null = default count). */
  courtSlotCount?: number | null;
  onChanged?: (result: CourtSlotsWriteResult) => void;
  onError?: (error: unknown, kind: CourtSlotsMutationKind) => void;
};

export type CourtSlotsMutationOutcome = { ok: true; result: CourtSlotsWriteResult } | { ok: false; error: unknown };

type Vars =
  | { kind: 'slots'; change: CourtSlotsChange; label: CourtSlotsMutationKind }
  | { kind: 'link'; slot: Pick<CourtSlotView, 'gameCourtId'>; body: LinkBookingToGameBody }
  | { kind: 'unlink'; externalBookingIds: string[] }
  | { kind: 'follow_up_done'; changeId: string; idempotencyKey: string };

/** `gameCourtId` to send with a link: real slots only. */
export function linkTargetGameCourtId(slot: Pick<CourtSlotView, 'gameCourtId'>): string | undefined {
  return slot.gameCourtId && !isSyntheticGameCourtId(slot.gameCourtId) ? slot.gameCourtId : undefined;
}

export function useCourtSlotsMutations({
  gameId,
  gameCourts,
  slots,
  courtSlotCount,
  onChanged,
  onError,
}: UseCourtSlotsMutationsOptions) {
  const [pending, setPending] = useState<CourtSlotsMutationKind | null>(null);

  const mutation = useMutation({
    mutationFn: async (vars: Vars): Promise<CourtSlotsWriteResult> => {
      if (vars.kind === 'slots') {
        const body = buildCourtSlotsBody(
          { gameCourts, reportedAnyCourtCount: reportedAnyCourtCountOf(slots), courtSlotCount },
          vars.change,
        );
        return { kind: 'slots', view: await courtSlotsApi.putCourtSlots(gameId, body) };
      }
      if (vars.kind === 'link') {
        const gameCourtId = linkTargetGameCourtId(vars.slot);
        const links = await courtSlotsApi.linkBooking(gameId, { ...vars.body, ...(gameCourtId ? { gameCourtId } : {}) });
        return { kind: 'links', links };
      }
      if (vars.kind === 'follow_up_done') {
        await courtSlotsApi.patchReservationChangeStep(vars.changeId, vars.idempotencyKey, { status: 'DONE' });
        return { kind: 'none' };
      }
      return { kind: 'links', links: await courtSlotsApi.unlinkBookings(gameId, vars.externalBookingIds) };
    },
    onSuccess: (result) => onChanged?.(result),
    onError: (error, vars) => onError?.(error, vars.kind === 'slots' ? vars.label : vars.kind),
    onSettled: () => setPending(null),
  });

  const run = useCallback(
    (vars: Vars, label: CourtSlotsMutationKind): Promise<CourtSlotsMutationOutcome> => {
      setPending(label);
      return mutation.mutateAsync(vars).then(
        (result): CourtSlotsMutationOutcome => ({ ok: true, result }),
        (error: unknown): CourtSlotsMutationOutcome => ({ ok: false, error }),
      );
    },
    [mutation],
  );

  return {
    pending,
    markReserved: (slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>, courtId?: string | null) =>
      run({ kind: 'slots', label: 'mark_reserved', change: { kind: 'mark_reserved', slot, courtId } }, 'mark_reserved'),
    markNotReserved: (slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>) =>
      run({ kind: 'slots', label: 'mark_not_reserved', change: { kind: 'mark_not_reserved', slot } }, 'mark_not_reserved'),
    assignCourt: (slot: Pick<CourtSlotView, 'gameCourtId' | 'courtId'>, courtId: string) =>
      run({ kind: 'slots', label: 'assign_court', change: { kind: 'assign_court', slot, courtId } }, 'assign_court'),
    linkBooking: (slot: Pick<CourtSlotView, 'gameCourtId'>, body: LinkBookingToGameBody) =>
      run({ kind: 'link', slot, body }, 'link'),
    unlink: (externalBookingIds: string[]) => run({ kind: 'unlink', externalBookingIds }, 'unlink'),
    /** "Courts: − N +". */
    setCourtCount: (count: number) =>
      run({ kind: 'slots', label: 'set_count', change: { kind: 'set_count', count } }, 'set_count'),
    /** A server follow-up handled at the club (marks its run step DONE). */
    markFollowUpDone: (followUp: { changeId?: string; idempotencyKey?: string }) =>
      followUp.changeId && followUp.idempotencyKey
        ? run(
            { kind: 'follow_up_done', changeId: followUp.changeId, idempotencyKey: followUp.idempotencyKey },
            'follow_up_done',
          )
        : Promise.resolve<CourtSlotsMutationOutcome>({ ok: true, result: { kind: 'none' } }),
  };
}
