/**
 * PRD 346 — the right-rail attendance stack's data and its structural comparison.
 *
 * Kept out of the component file so `GameCardRightRail`'s hand-written memo
 * comparator can import the equality check without pulling in a component.
 */

import type { AttendanceDotState } from './attendanceVisuals';

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
