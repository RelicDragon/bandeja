/**
 * PRD 346 — the optimistic local patch for an attendance answer.
 *
 * Pure and dependency-free on purpose: it is the frontend half of the product
 * invariant, so it is unit tested without pulling in TanStack Query, axios or
 * the socket store. It may move the viewer's own `attendance` and the derived
 * counts — nothing else. No seat, no status, no other player's row.
 */
import type { AttendanceAnswer, GameAttendanceDetails } from '@/api/attendance';

export function patchViewerAnswer(
  current: GameAttendanceDetails,
  viewerUserId: string,
  state: AttendanceAnswer,
): GameAttendanceDetails {
  const participants = current.participants.map((row) =>
    row.userId === viewerUserId ? { ...row, attendance: state } : row,
  );
  const confirmedCount = participants.filter((row) => row.attendance === 'CONFIRMED').length;
  const unsureCount = participants.filter((row) => row.attendance === 'UNSURE').length;

  return {
    ...current,
    participants,
    entries: participants.map((row) => ({ userId: row.userId, attendance: row.attendance })),
    viewerAttendance: state,
    confirmedCount,
    unsureCount,
    unansweredCount: participants.length - confirmedCount - unsureCount,
  };
}
