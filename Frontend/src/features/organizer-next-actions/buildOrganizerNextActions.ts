import { getEntityCapabilities, isEntityTypeId } from '@shared/entityCapabilities';
import type { OrganizerHint, OrganizerNextActionsInput } from './organizerNextActionsTypes';

/**
 * PRD 364 — pure resolver: `(input) → Hint[]`, in priority order.
 *
 * Before results: seats → booking → attendance → cost.
 * Once results exist (`IN_PROGRESS` / `FINAL`): cost only — a setup prompt
 * about a game that has been played is noise, not help.
 *
 * Rules carried over from the surfaces this block replaces:
 * - only `PLAYING` fills a seat (`docs/product/constraints.md`);
 * - an unanswered attendance is not a no-show, so the attendance row is a
 *   count with a Nudge, never a warning;
 * - court reservation is separate from the roster and is read from the game
 *   payload only (`utils/courtReservationView`); nothing here talks to a
 *   booking provider.
 */

/** Entity types whose organizer shapes seats, court and attendance. */
export function organizerNextActionsSupportsEntity(entityType: string): boolean {
  return (
    entityType === 'GAME' ||
    entityType === 'TOURNAMENT' ||
    entityType === 'TRAINING' ||
    entityType === 'BAR'
  );
}

function capabilities(entityType: string) {
  return isEntityTypeId(entityType) ? getEntityCapabilities(entityType) : null;
}

export function buildOrganizerNextActions(input: OrganizerNextActionsInput): OrganizerHint[] {
  const { game, viewerRole } = input;

  if (viewerRole !== 'organizer' && viewerRole !== 'inviter') return [];
  if (!organizerNextActionsSupportsEntity(game.entityType)) return [];
  if (game.status === 'ARCHIVED') return [];

  const caps = capabilities(game.entityType);
  const hints: OrganizerHint[] = [];
  const beforeResults = game.resultsStatus === 'NONE';

  if (beforeResults) {
    const playing = game.participants.filter((p) => p.status === 'PLAYING').length;
    const capacity = game.maxParticipants ?? 0;
    const needed = Math.max(0, capacity - playing);
    const waiting = game.joinQueues?.length ?? 0;
    const boundedRoster = caps ? !caps.unboundedRoster : true;

    if (boundedRoster && needed > 0) {
      if (viewerRole === 'inviter') {
        // A participant with invite rights gets the seats fact and Invite, nothing else.
        if (input.canInvite) hints.push({ key: 'seats', needed, capacity, waiting, action: 'invite' });
        return hints;
      }
      if (waiting > 0 && input.canManageQueue) {
        hints.push({ key: 'seats', needed, capacity, waiting, action: 'reviewQueue' });
      } else if (input.canInvite) {
        hints.push({ key: 'seats', needed, capacity, waiting, action: 'invite' });
      }
      // No possible action → no hint. A fact without a button is not a next step.
    }

    if (viewerRole === 'inviter') return hints;

    const hasBooking = caps?.hasBooking ?? false;
    const reservation = input.reservation;
    if (hasBooking && game.timeIsSet === true && game.hasClub && reservation) {
      const hasLinks = game.linkedBookingCount > 0;
      const base = { key: 'booking' as const, reserved: reservation.reserved, total: reservation.total };
      if (reservation.kind === 'planned') {
        hints.push({ ...base, state: 'none', gapTime: null, action: hasLinks ? 'seeBookings' : 'editCourt' });
      } else if (reservation.kind === 'partial') {
        hints.push({ ...base, state: 'partial', gapTime: null, action: hasLinks ? 'seeBookings' : 'editCourt' });
      } else if (reservation.kind === 'reserved_with_gap') {
        // Only linked bookings can leave a gap, so the fix is in the bookings section.
        hints.push({ ...base, state: 'gap', gapTime: reservation.gapTime, action: 'seeBookings' });
      }
    }

    const attendance = input.attendance;
    if (
      attendance &&
      attendance.enabled &&
      attendance.answersOpen &&
      attendance.playingCount > 0 &&
      attendance.confirmedCount < attendance.playingCount
    ) {
      hints.push({
        key: 'attendance',
        confirmed: attendance.confirmedCount,
        total: attendance.playingCount,
        nudgeAllowed: attendance.nudgeAllowed,
        nudgeRemainingHours: attendance.nudgeRemainingHours,
      });
    }
  } else if (viewerRole === 'inviter') {
    return [];
  }

  const cost = input.cost;
  if (cost && cost.unpaidCount > 0) {
    hints.push({
      key: 'cost',
      unpaid: cost.unpaidCount,
      action: cost.viewerOwesUnpaid ? 'settle' : 'review',
    });
  }

  return hints;
}

