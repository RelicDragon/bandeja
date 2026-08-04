import {
  BracketSlotKind,
  EntityType,
  PlayoffFormat,
  Prisma,
  ResultsStatus,
  RoundType,
} from '@prisma/client';
import prisma from '../../config/database';
import {
  grantPodiumAchievementsForFinalizedGame,
  writePodiumUnlocksToGameOutcomes,
} from '../achievements/podiumGrant.service';
import { BracketAdvancementService } from './bracketAdvancement.service';
import {
  isBracketTreePodiumReady,
  selectChampionshipGame,
  type ChampionshipSlotLite,
} from './bracketChampionship.util';

type BracketConfigShape = {
  includeThirdPlace?: boolean;
  groups?: Record<string, { includeThirdPlace?: boolean } | undefined>;
};

function includeThirdPlaceForTree(
  groupId: string | null,
  slots: ChampionshipSlotLite[],
  config: BracketConfigShape | null
): boolean {
  return (
    (groupId != null
      ? config?.groups?.[groupId]?.includeThirdPlace
      : config?.includeThirdPlace) ??
    slots.some((s) => s.slotKind === BracketSlotKind.THIRD_PLACE)
  );
}

/**
 * Structural readiness without DE winners-champion identity. For pure unit tests /
 * single-elim paths. Double-elim first-GF without reset uses the async checker.
 */
export function allDecisiveBracketGamesFinal(
  slotsByGroup: Map<string | null, ChampionshipSlotLite[]>,
  config: BracketConfigShape | null
): boolean {
  if (slotsByGroup.size === 0) return false;
  for (const [groupId, slots] of slotsByGroup) {
    const includeThird = includeThirdPlaceForTree(groupId, slots, config);
    // first_grand_final_candidate without identity → not ready in pure mode
    if (!isBracketTreePodiumReady(slots, includeThird)) return false;
  }
  return true;
}

/**
 * DE first-GF: decided only when the shared championship resolver returns ids
 * (winners-bracket champion held; unused reset slot is ignored).
 */
async function resolveFirstGrandFinalFlag(
  slots: ChampionshipSlotLite[],
  tx: Prisma.TransactionClient | typeof prisma
): Promise<boolean | undefined> {
  const selection = selectChampionshipGame(slots);
  if (selection.kind !== 'first_grand_final_candidate') return undefined;
  const championship = await BracketAdvancementService.resolveChampionshipFromSlots(
    slots as Parameters<typeof BracketAdvancementService.resolveChampionshipFromSlots>[0],
    tx as Prisma.TransactionClient
  );
  return Boolean(
    championship.championParticipantId && championship.finalistParticipantId
  );
}

/**
 * Full readiness including double-elim "winners held first GF" (unused reset ok).
 */
export async function allBracketTreesPodiumReady(
  slotsByGroup: Map<string | null, ChampionshipSlotLite[]>,
  config: BracketConfigShape | null,
  tx: Prisma.TransactionClient | typeof prisma
): Promise<boolean> {
  if (slotsByGroup.size === 0) return false;
  for (const [groupId, slots] of slotsByGroup) {
    const includeThird = includeThirdPlaceForTree(groupId, slots, config);
    const firstGf = await resolveFirstGrandFinalFlag(slots, tx);
    if (
      !isBracketTreePodiumReady(slots, includeThird, {
        firstGrandFinalResolvedByWinnersChampion: firstGf,
      })
    ) {
      return false;
    }
  }
  return true;
}

/**
 * After a bracket game finalizes, checks whether the parent league season's
 * playoff bracket is fully decided (every group's final + third-place games are
 * FINAL — DE unused reset slots do not block). When it is, and the season isn't
 * already FINAL, marks the season FINAL and grants podium achievements in the
 * same transaction.
 *
 * Idempotent: no-op if the season is already FINAL or has no bracket round.
 * Runs inside the caller's transaction so a failure rolls back the season flip
 * and the trophy grants together.
 *
 * @returns the season id if it was finalized, null otherwise.
 */
export async function maybeFinalizeSeasonAfterBracketGame(
  gameId: string,
  tx: Prisma.TransactionClient
): Promise<string | null> {
  const slot = await tx.leagueBracketSlot.findFirst({
    where: { gameId },
    select: {
      leagueRoundId: true,
      leagueRound: {
        select: {
          leagueSeasonId: true,
          roundType: true,
          playoffFormat: true,
          bracketScope: true,
          bracketConfig: true,
        },
      },
    },
  });
  if (!slot) return null;
  const round = slot.leagueRound;
  if (
    round.roundType !== RoundType.PLAYOFF ||
    round.playoffFormat !== PlayoffFormat.BRACKET
  ) {
    return null;
  }

  const seasonId = round.leagueSeasonId;

  const season = await tx.game.findUnique({
    where: { id: seasonId },
    select: { id: true, entityType: true, resultsStatus: true },
  });
  if (!season) return null;
  if (season.entityType !== EntityType.LEAGUE_SEASON) return null;
  if (season.resultsStatus === ResultsStatus.FINAL) return null;

  const allSlots = await tx.leagueBracketSlot.findMany({
    where: { leagueRoundId: slot.leagueRoundId },
    select: {
      id: true,
      leagueGroupId: true,
      slotKind: true,
      roundIndex: true,
      winnerSlotId: true,
      feederSlotAId: true,
      gameId: true,
      game: { select: { resultsStatus: true } },
    },
  });

  const byGroup = new Map<string | null, typeof allSlots>();
  for (const s of allSlots) {
    const key = s.leagueGroupId;
    const list = byGroup.get(key) ?? [];
    list.push(s);
    byGroup.set(key, list);
  }

  const config = (round.bracketConfig ?? null) as BracketConfigShape | null;
  if (!(await allBracketTreesPodiumReady(byGroup, config, tx))) return null;

  await tx.game.update({
    where: { id: seasonId },
    data: { resultsStatus: ResultsStatus.FINAL, status: 'FINISHED' },
  });

  const podiumBatch = await grantPodiumAchievementsForFinalizedGame({
    gameId: seasonId,
    tx,
  });
  await writePodiumUnlocksToGameOutcomes({ db: tx, gameId: seasonId, batch: podiumBatch });

  return seasonId;
}

/**
 * Read-only check (outside a transaction) for scripts/tests: reports whether a
 * season's bracket is fully decided.
 */
export async function isSeasonBracketFullyDecided(
  seasonId: string
): Promise<{ hasBracket: boolean; fullyDecided: boolean }> {
  const round = await prisma.leagueRound.findFirst({
    where: {
      leagueSeasonId: seasonId,
      roundType: RoundType.PLAYOFF,
      playoffFormat: PlayoffFormat.BRACKET,
    },
    orderBy: { orderIndex: 'desc' },
    select: { id: true, bracketScope: true, bracketConfig: true },
  });
  if (!round) return { hasBracket: false, fullyDecided: false };

  const allSlots = await prisma.leagueBracketSlot.findMany({
    where: { leagueRoundId: round.id },
    select: {
      id: true,
      leagueGroupId: true,
      slotKind: true,
      roundIndex: true,
      winnerSlotId: true,
      feederSlotAId: true,
      gameId: true,
      game: { select: { resultsStatus: true } },
    },
  });
  const byGroup = new Map<string | null, typeof allSlots>();
  for (const s of allSlots) {
    const key = s.leagueGroupId;
    const list = byGroup.get(key) ?? [];
    list.push(s);
    byGroup.set(key, list);
  }
  const config = (round.bracketConfig ?? null) as BracketConfigShape | null;
  return {
    hasBracket: true,
    fullyDecided: await allBracketTreesPodiumReady(byGroup, config, prisma),
  };
}

// Structural helper used by tests; tree readiness uses selectChampionshipGame.
export function isDecisiveSlot(
  slot: {
    slotKind: BracketSlotKind;
    winnerSlotId: string | null;
  },
  includeThirdPlace: boolean
): boolean {
  if (slot.slotKind === BracketSlotKind.THIRD_PLACE) return includeThirdPlace;
  if (slot.slotKind === BracketSlotKind.MAIN && slot.winnerSlotId == null) return true;
  if (slot.slotKind === BracketSlotKind.GRAND_FINAL && slot.winnerSlotId == null) return true;
  return false;
}
