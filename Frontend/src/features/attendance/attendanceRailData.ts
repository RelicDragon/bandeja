/**
 * PRD 346 — the right-rail attendance stack's data and its structural comparison.
 *
 * Kept out of the component file so `GameCardRightRail`'s hand-written memo
 * comparator can import the equality check without pulling in a component.
 */

import type { AttendanceSummary } from '@/types/gameCardEnrichment';
import { resolveDotState, type AttendanceDotState } from './attendanceVisuals';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

export interface AttendanceRailPlayer {
  userId: string;
  initial: string;
  avatarUrl: string | null;
  state: AttendanceDotState;
}

export interface AttendanceRailData {
  confirmedCount: number;
  playingCount: number;
  players: AttendanceRailPlayer[];
}

/** Structural comparison for `rightRailPropsEqual`. */
export function attendanceRailDataEqual(
  a: AttendanceRailData | null | undefined,
  b: AttendanceRailData | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.confirmedCount !== b.confirmedCount) return false;
  if (a.playingCount !== b.playingCount) return false;
  if (a.players.length !== b.players.length) return false;
  return a.players.every((player, index) => {
    const other = b.players[index];
    return (
      player.userId === other.userId &&
      player.state === other.state &&
      player.avatarUrl === other.avatarUrl &&
      player.initial === other.initial
    );
  });
}

/** The most faces the rail shows before it stops adding avatars. */
export const ATTENDANCE_RAIL_MAX_PLAYERS = 4;

export interface AttendanceRailParticipant {
  userId: string;
  user?: { firstName?: string | null; avatar?: string | null } | null;
}

/**
 * Derives the rail from an enriched card.
 *
 * `summary` is `null` for every game the viewer is not PLAYING in — the
 * enricher refuses to project one (`gameAttendance.service.ts`), so a stranger's
 * game can never grow a stack. This returns `null` for that case too, which is
 * "show nothing", never an error state. A Find card *does* show the stack once
 * the viewer has joined the game: that is the same "viewer's own game" rule the
 * My tab uses, seen from the other list.
 */
export function buildAttendanceRailData(
  summary: AttendanceSummary | null | undefined,
  playingParticipants: AttendanceRailParticipant[],
): AttendanceRailData | null {
  if (!summary || summary.playingCount <= 0) return null;
  const byUserId = new Map(summary.entries?.map((entry) => [entry.userId, entry.attendance]));
  const players = playingParticipants.slice(0, ATTENDANCE_RAIL_MAX_PLAYERS).map((participant) => ({
    userId: participant.userId,
    initial: (participant.user?.firstName ?? '?').slice(0, 1).toUpperCase(),
    avatarUrl:
      userAvatarTinyUrlFromStandard(participant.user?.avatar) ?? participant.user?.avatar ?? null,
    state: resolveDotState(byUserId.get(participant.userId), null),
  }));
  return {
    confirmedCount: summary.confirmedCount,
    playingCount: summary.playingCount,
    players,
  };
}
