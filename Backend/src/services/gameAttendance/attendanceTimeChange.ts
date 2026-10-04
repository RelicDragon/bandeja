/**
 * Time change — attendance side.
 *
 * When a game's time moves, every PLAYING answer given for the old time is
 * cleared: "I'm coming" at 18:00 says nothing about 20:00. The owner keeps
 * reading `CONFIRMED` because that answer is derived, never stored
 * ({@link withOwnerImplicitAnswer}), and the editor keeps their own answer —
 * they picked the new time.
 *
 * Same product principle as the rest of this folder: the only write is the
 * allow-listed {@link buildAttendanceResetUpdate} patch. No seat, queue
 * position, no-show note or rating column moves.
 */
import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { emitGameAttendanceUpdated } from '../socketEmitFacade';
import {
  buildAttendanceResetUpdate,
  countAttendance,
  withOwnerImplicitAnswer,
} from './attendanceRules';
import { supportsAttendance } from './attendanceEntityTypes';

type Tx = Prisma.TransactionClient;

/**
 * Clears answers inside the caller's transaction (the game-update transaction
 * holds the `Game` row lock, so a concurrent answer cannot interleave).
 * Returns how many rows were reset.
 */
export async function resetAttendanceForTimeChangeInTx(
  tx: Tx,
  args: { gameId: string; entityType: string; keepUserId?: string | null },
): Promise<number> {
  if (!supportsAttendance(args.entityType)) return 0;
  const result = await tx.gameParticipant.updateMany({
    where: {
      gameId: args.gameId,
      status: 'PLAYING',
      attendance: { not: 'UNANSWERED' },
      ...(args.keepUserId ? { userId: { not: args.keepUserId } } : {}),
    },
    data: buildAttendanceResetUpdate(),
  });
  return result.count;
}

/**
 * Post-commit fan-out so open game pages and card stacks refetch. The payload
 * is about the editor (whose row did not move) — or the owner when a system
 * change (booking sync) has no editor; clients treat the event as
 * "attendance for this game changed" and refetch the whole summary.
 */
export async function emitAttendanceResetForTimeChange(
  gameId: string,
  editorUserId: string | null,
): Promise<void> {
  const rows = withOwnerImplicitAnswer(
    await prisma.gameParticipant.findMany({
      where: { gameId },
      select: { userId: true, status: true, role: true, attendance: true },
    }),
  );
  const counts = countAttendance(rows);
  const editorRow = editorUserId
    ? rows.find((row) => row.userId === editorUserId)
    : rows.find((row) => row.role === 'OWNER');
  const userId = editorRow?.userId ?? editorUserId;
  if (!userId) return;
  await emitGameAttendanceUpdated(gameId, {
    userId,
    attendance: editorRow?.attendance ?? 'UNANSWERED',
    confirmedCount: counts.confirmedCount,
    playingCount: counts.playingCount,
  });
}
