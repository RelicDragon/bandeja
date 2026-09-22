import { getEntityCapabilities, isEntityTypeId } from '@shared/entityCapabilities';
import {
  ORGANIZER_VISIBLE_HINT_LIMIT,
  type OrganizerHint,
  type OrganizerNextActionsInput,
} from './organizerNextActionsTypes';

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
 * - booking coverage is separate from the roster and is read from the game
 *   payload only; nothing here talks to a booking provider.
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
    const needed = Math.max(0, (game.maxParticipants ?? 0) - playing);
    const waiting = game.joinQueues?.length ?? 0;
    const boundedRoster = caps ? !caps.unboundedRoster : true;

    if (boundedRoster && needed > 0) {
      if (viewerRole === 'inviter') {
        // A participant with invite rights gets the seats fact and Invite, nothing else.
        if (input.canInvite) hints.push({ key: 'seats', needed, waiting, action: 'invite' });
        return hints;
      }
      if (waiting > 0 && input.canManageQueue) {
        hints.push({ key: 'seats', needed, waiting, action: 'reviewQueue' });
      } else if (input.canInvite) {
        hints.push({ key: 'seats', needed, waiting, action: 'invite' });
      }
      // No possible action → no hint. A fact without a button is not a next step.
    }

    if (viewerRole === 'inviter') return hints;

    const hasBooking = caps?.hasBooking ?? false;
    if (hasBooking && game.timeIsSet === true && game.hasClub && input.bookingCoverage) {
      if (input.bookingCoverage === 'none') {
        hints.push({
          key: 'booking',
          state: 'none',
          action: game.linkedBookingCount > 0 ? 'seeBookings' : 'editCourt',
        });
      } else if (input.bookingCoverage === 'external_partial') {
        hints.push({ key: 'booking', state: 'partial', action: 'seeBookings' });
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

/** The two rows that are always on screen, and the ones behind "+N more". */
export function splitOrganizerHints(
  hints: readonly OrganizerHint[],
  expanded: boolean,
  limit: number = ORGANIZER_VISIBLE_HINT_LIMIT,
): { visible: OrganizerHint[]; hidden: OrganizerHint[] } {
  if (expanded || hints.length <= limit) return { visible: [...hints], hidden: [] };
  return { visible: hints.slice(0, limit), hidden: hints.slice(limit) };
}
