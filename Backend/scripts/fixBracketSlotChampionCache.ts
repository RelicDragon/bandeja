/**
 * Repair stale `LeagueBracketSlot.leagueParticipantId` caches for a league
 * season's bracket playoff round by replaying `onGameFinalized` cache writes in
 * round order from authoritative game outcomes.
 *
 * Each FINAL game:
 *   1. pins its own winner on this slot
 *   2. pins the same winner on `winnerSlotId` (next match seed hint)
 * Later rounds overwrite earlier feeder hints on a slot via (1).
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/fixBracketSlotChampionCache.ts \
 *     --league-season-id=<seasonId> [--apply]
 *
 * Default is a dry run; pass --apply to write.
 */
import dotenv from 'dotenv';
dotenv.config();

import { PlayoffFormat, ResultsStatus, RoundType } from '@prisma/client';
import prisma from '../src/config/database';
import { BracketAdvancementService } from '../src/services/league/bracketAdvancement.service';

const dryRun = !process.argv.includes('--apply');
const seasonArg = process.argv.find((arg) => arg.startsWith('--league-season-id='));
const leagueSeasonId = seasonArg?.slice('--league-season-id='.length).trim();
if (!leagueSeasonId) {
  console.error(
    'Usage: npx ts-node --transpile-only scripts/fixBracketSlotChampionCache.ts --league-season-id=<id> [--apply]'
  );
  console.error('       (default is a dry run; pass --apply to write changes)');
  process.exit(1);
}

type SlotRow = {
  id: string;
  slotKey: string;
  slotKind: string;
  roundIndex: number;
  matchIndex: number;
  leagueGroupId: string | null;
  leagueParticipantId: string | null;
  winnerSlotId: string | null;
  gameId: string | null;
  game: { resultsStatus: ResultsStatus } | null;
};

async function main(): Promise<void> {
  const round = await prisma.leagueRound.findFirst({
    where: {
      leagueSeasonId,
      roundType: RoundType.PLAYOFF,
      playoffFormat: PlayoffFormat.BRACKET,
    },
    orderBy: { orderIndex: 'desc' },
    select: { id: true },
  });
  if (!round) {
    console.error(`No PLAYOFF/BRACKET round found for season ${leagueSeasonId}`);
    process.exit(1);
  }

  const slots: SlotRow[] = await prisma.leagueBracketSlot.findMany({
    where: { leagueRoundId: round.id },
    select: {
      id: true,
      slotKey: true,
      slotKind: true,
      roundIndex: true,
      matchIndex: true,
      leagueGroupId: true,
      leagueParticipantId: true,
      winnerSlotId: true,
      gameId: true,
      game: { select: { resultsStatus: true } },
    },
  });

  console.log(
    `Scanning ${slots.length} slots in round ${round.id} (season ${leagueSeasonId})…`
  );
  if (dryRun) {
    console.log('DRY RUN — no changes will be written. Pass --apply to write.\n');
  }

  const cache = new Map(slots.map((s) => [s.id, s.leagueParticipantId]));
  const reasons = new Map<string, string>();

  const finalized = slots
    .filter((s) => s.gameId && s.game?.resultsStatus === ResultsStatus.FINAL)
    .sort(
      (a, b) =>
        a.roundIndex - b.roundIndex ||
        a.matchIndex - b.matchIndex ||
        a.slotKey.localeCompare(b.slotKey)
    );

  for (const slot of finalized) {
    const winnerId = await prisma.$transaction((tx) =>
      BracketAdvancementService.resolveWinnerParticipantId(slot.gameId!, tx)
    );
    if (!winnerId) {
      console.warn(`  skip ${slot.slotKey}: could not resolve winner for ${slot.gameId}`);
      continue;
    }

    // Own slot always shows this game's winner after FINAL.
    if ((cache.get(slot.id) ?? null) !== winnerId) {
      cache.set(slot.id, winnerId);
      reasons.set(slot.id, `winner of own ${slot.slotKey} (${slot.gameId})`);
    }

    // Downstream seed hint (may be overwritten once that match is itself FINAL).
    if (slot.winnerSlotId) {
      cache.set(slot.winnerSlotId, winnerId);
      reasons.set(
        slot.winnerSlotId,
        `winner of feeder ${slot.slotKey} (${slot.gameId})`
      );
    }
  }

  const changes = slots
    .filter((s) => (cache.get(s.id) ?? null) !== s.leagueParticipantId)
    .map((s) => ({
      slotId: s.id,
      slotKey: s.slotKey,
      leagueGroupId: s.leagueGroupId,
      before: s.leagueParticipantId,
      after: cache.get(s.id) ?? null,
      reason: reasons.get(s.id) ?? 'replay',
    }));

  if (changes.length === 0) {
    console.log('No stale slot caches found — nothing to do.');
    return;
  }

  console.log(`Planned changes: ${changes.length}\n`);
  for (const c of changes) {
    console.log(
      `  [${c.leagueGroupId ?? 'cross'}] ${c.slotKey}: ` +
        `"${c.before ?? '∅'}" → "${c.after ?? '∅'}"  (${c.reason})`
    );
  }

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.leagueBracketSlot.update({
        where: { id: c.slotId },
        data: { leagueParticipantId: c.after },
      });
    }
  });
  console.log(`\nApplied ${changes.length} cache repairs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
