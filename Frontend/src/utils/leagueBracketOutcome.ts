import { finalistFromChampionshipSides } from '@shared/achievements';
import type { BracketPlayoffGroupDto, BracketSlotDto, BracketSlotParticipantDto } from '@/api/leagues';
import type { Game } from '@/types';
import { isFullGame } from '@/utils/leagueBracketEnrich';
import { resolveSlotFeederParticipant, slotsById } from '@/utils/leagueBracketLayout';
import { isThirdPlaceSlot } from '@/utils/bracketThirdPlace.util';
import {
  bracketMatchStatusFromGame,
  isBracketMatchComplete,
} from '@/utils/leagueBracketMatchStatus';

export type BracketPodium = {
  championId: string | null;
  finalistId: string | null;
  thirdPlaceId: string | null;
  semifinalistIds: string[];
};

export type BracketSlotHighlight = {
  onChampionPath: boolean;
  winnerSide: 'A' | 'B' | null;
  loserSide: 'A' | 'B' | null;
  deEmphasize: boolean;
};

export function isPlayInPhaseComplete(group: BracketPlayoffGroupDto): boolean {
  if (group.playInGameCount <= 0) return true;
  const playInSlots = group.slots.filter((s) => s.slotKind === 'PLAY_IN');
  if (playInSlots.length === 0) return true;
  return playInSlots.every((slot) => {
    if (!slot.gameId) return false;
    return isBracketMatchComplete(bracketMatchStatusFromGame(slot.game));
  });
}

export function findFinalMainSlot(slots: BracketSlotDto[]): BracketSlotDto | null {
  const main = slots.filter((s) => s.slotKind === 'MAIN' && !isThirdPlaceSlot(s));
  if (main.length === 0) return null;
  const maxRound = Math.max(...main.map((s) => s.roundIndex));
  const finals = main.filter((s) => s.roundIndex === maxRound);
  return finals.find((s) => !s.winnerSlotId) ?? finals[0] ?? null;
}

export function participantIdFromSide(
  participant: BracketSlotDto['participant'] | null | undefined
): string | null {
  return participant?.id ?? null;
}

export function resolveSlotSides(
  slot: BracketSlotDto,
  lookup: Map<string, BracketSlotDto>
): { sideA: BracketSlotDto['participant'] | null; sideB: BracketSlotDto['participant'] | null } {
  const sideA =
    resolveSlotFeederParticipant(slot, 'A', lookup) ??
    (slot.slotKind === 'PLAY_IN' ? slot.participant ?? null : null);
  const sideB = resolveSlotFeederParticipant(slot, 'B', lookup);
  return { sideA, sideB };
}

export function winningTeamFromFinalGame(game: Game): 'teamA' | 'teamB' | null {
  if (game.resultsStatus !== 'FINAL' || !game.outcomes?.length) return null;
  const teamAIds =
    game.fixedTeams?.[0]?.players?.map((p) => p.user?.id).filter(Boolean) as string[] | undefined;
  const teamBIds =
    game.fixedTeams?.[1]?.players?.map((p) => p.user?.id).filter(Boolean) as string[] | undefined;
  if (!teamAIds?.length || !teamBIds?.length) return null;

  const teamAOutcomes = game.outcomes.filter((o) => teamAIds.includes(o.user?.id ?? o.userId ?? ''));
  const teamBOutcomes = game.outcomes.filter((o) => teamBIds.includes(o.user?.id ?? o.userId ?? ''));
  const teamAWins = teamAOutcomes[0]?.wins ?? 0;
  const teamBWins = teamBOutcomes[0]?.wins ?? 0;
  if (teamAWins > teamBWins) return 'teamA';
  if (teamBWins > teamAWins) return 'teamB';
  return null;
}

export function slotWinnerParticipantId(
  slot: BracketSlotDto,
  lookup: Map<string, BracketSlotDto>
): string | null {
  if (slot.slotKind === 'BYE') {
    return slot.leagueParticipantId ?? participantIdFromSide(slot.participant);
  }
  const game = slot.game;
  if (!game || !isFullGame(game) || game.resultsStatus !== 'FINAL') {
    // Non-BYE slot participants are only a navigation/cache hint. They must
    // never be presented as a winner before the slot's own game is final.
    return null;
  }
  const winnerTeam = winningTeamFromFinalGame(game);
  if (!winnerTeam) return slot.leagueParticipantId ?? null;
  const { sideA, sideB } = resolveSlotSides(slot, lookup);
  if (winnerTeam === 'teamA') return participantIdFromSide(sideA);
  return participantIdFromSide(sideB);
}

function resolvedChampionshipSlot(group: BracketPlayoffGroupDto): BracketSlotDto | null {
  const completedGrandFinals = group.slots
    .filter(
      (slot) =>
        slot.slotKind === 'GRAND_FINAL' &&
        slot.game?.resultsStatus === 'FINAL'
    )
    .sort((a, b) => b.roundIndex - a.roundIndex);
  if (group.championParticipantId && completedGrandFinals.length > 0) {
    return completedGrandFinals[0] ?? null;
  }
  if (group.slots.some((slot) => slot.slotKind === 'GRAND_FINAL')) return null;
  return findFinalMainSlot(group.slots);
}

export function collectChampionPathSlotIds(
  slots: BracketSlotDto[],
  championshipSlotId?: string | null
): Set<string> {
  const lookup = slotsById(slots);
  const finalSlot =
    (championshipSlotId ? lookup.get(championshipSlotId) : null) ??
    findFinalMainSlot(slots);
  if (!finalSlot) return new Set();

  const path = new Set<string>();
  const visit = (slotId: string) => {
    const slot = lookup.get(slotId);
    if (!slot || path.has(slotId)) return;
    path.add(slotId);
    if (slot.feederSlotAId) visit(slot.feederSlotAId);
    if (slot.feederSlotBId) visit(slot.feederSlotBId);
    for (const feeder of slots) {
      if (feeder.winnerSlotId === slot.id) visit(feeder.id);
    }
  };
  visit(finalSlot.id);
  return path;
}

function collectParticipantPathSlotIds(
  slots: BracketSlotDto[],
  championshipSlotId: string,
  participantId: string
): Set<string> {
  const lookup = slotsById(slots);
  const path = new Set<string>();
  const visit = (slotId: string) => {
    const slot = lookup.get(slotId);
    if (!slot || path.has(slotId)) return;
    path.add(slotId);
    const { sideA, sideB } = resolveSlotSides(slot, lookup);
    if (participantIdFromSide(sideA) === participantId && slot.feederSlotAId) {
      visit(slot.feederSlotAId);
    } else if (participantIdFromSide(sideB) === participantId && slot.feederSlotBId) {
      visit(slot.feederSlotBId);
    }
  };
  visit(championshipSlotId);
  return path;
}

export function bracketGroupHasPodium(group: BracketPlayoffGroupDto): boolean {
  const podium = buildBracketPodium(group);
  return !!(
    podium.championId ||
    podium.finalistId ||
    podium.thirdPlaceId ||
    podium.semifinalistIds.length > 0
  );
}

export function buildBracketPodium(group: BracketPlayoffGroupDto): BracketPodium {
  const lookup = slotsById(group.slots);
  const championId = group.championParticipantId ?? null;
  const finalSlot = resolvedChampionshipSlot(group);
  let finalistId: string | null = group.finalistParticipantId ?? null;
  const semifinalistIds: string[] = [];

  if (finalSlot && !finalistId) {
    const winnerId = slotWinnerParticipantId(finalSlot, lookup);
    const { sideA, sideB } = resolveSlotSides(finalSlot, lookup);
    finalistId = finalistFromChampionshipSides(
      winnerId,
      participantIdFromSide(sideA),
      participantIdFromSide(sideB),
    );
  }

  let thirdPlaceId: string | null = group.thirdPlaceParticipantId ?? null;
  const thirdSlot = group.slots.find(isThirdPlaceSlot);
  if (thirdSlot && !thirdPlaceId) {
    thirdPlaceId = slotWinnerParticipantId(thirdSlot, lookup);
  }

  const mainSlots = group.slots.filter((s) => s.slotKind === 'MAIN' && !isThirdPlaceSlot(s));
  if (mainSlots.length > 0) {
    const maxRound = Math.max(...mainSlots.map((s) => s.roundIndex));
    if (maxRound >= 1) {
      const sfRound = maxRound - 1;
      for (const slot of mainSlots.filter((s) => s.roundIndex === sfRound)) {
        const winnerId = slotWinnerParticipantId(slot, lookup);
        if (!winnerId) continue;
        const { sideA, sideB } = resolveSlotSides(slot, lookup);
        const idA = participantIdFromSide(sideA);
        const idB = participantIdFromSide(sideB);
        if (idA && idB) {
          const loserId = winnerId === idA ? idB : idA;
          if (loserId && !semifinalistIds.includes(loserId)) semifinalistIds.push(loserId);
        }
      }
    }
  }

  const semifinalists = semifinalistIds.filter(
    (id) => id !== thirdPlaceId && id !== finalistId && id !== championId
  );

  return {
    championId:
      championId ??
      (group.slots.some((slot) => slot.slotKind === 'GRAND_FINAL')
        ? null
        : finalSlot
          ? slotWinnerParticipantId(finalSlot, lookup)
          : null),
    finalistId,
    thirdPlaceId,
    semifinalistIds: semifinalists,
  };
}

export function bracketHasPodium(group: BracketPlayoffGroupDto): boolean {
  const podium = buildBracketPodium(group);
  return Boolean(
    podium.championId ||
      podium.finalistId ||
      podium.thirdPlaceId ||
      podium.semifinalistIds.length > 0
  );
}

export function buildBracketSlotHighlights(
  group: BracketPlayoffGroupDto
): Map<string, BracketSlotHighlight> {
  const playInDone = isPlayInPhaseComplete(group);
  const championshipSlot = resolvedChampionshipSlot(group);
  const pathIds =
    championshipSlot && group.championParticipantId
    ? collectParticipantPathSlotIds(
        group.slots,
        championshipSlot.id,
        group.championParticipantId
      )
    : championshipSlot
      ? collectChampionPathSlotIds(group.slots, championshipSlot.id)
    : new Set<string>();
  const lookup = slotsById(group.slots);
  const map = new Map<string, BracketSlotHighlight>();

  for (const slot of group.slots) {
    const onChampionPath = pathIds.has(slot.id);
    let winnerSide: 'A' | 'B' | null = null;
    let loserSide: 'A' | 'B' | null = null;

    if (slot.slotKind !== 'BYE') {
      const game = slot.game;
      if (game && isFullGame(game) && game.resultsStatus === 'FINAL') {
        const team = winningTeamFromFinalGame(game);
        const { sideA, sideB } = resolveSlotSides(slot, lookup);
        const hasA = !!participantIdFromSide(sideA);
        const hasB = !!participantIdFromSide(sideB);
        if (team === 'teamA' && hasA) {
          winnerSide = 'A';
          if (hasB) loserSide = 'B';
        } else if (team === 'teamB' && hasB) {
          winnerSide = 'B';
          if (hasA) loserSide = 'A';
        }
      }
    }

    const deEmphasize =
      !playInDone && group.playInGameCount > 0 && slot.slotKind === 'MAIN';
    map.set(slot.id, { onChampionPath, winnerSide, loserSide, deEmphasize });
  }

  for (const slot of group.slots) {
    if (slot.slotKind === 'BYE' && pathIds.has(slot.id)) {
      map.set(slot.id, {
        onChampionPath: true,
        winnerSide: 'A',
        loserSide: null,
        deEmphasize: false,
      });
    }
  }

  return map;
}

/**
 * Builds a display label from a single resolved participant object (prefers
 * `displayName`, else joins the team players' names). Returns '' when no label
 * can be derived.
 */
export function participantLabel(participant: BracketSlotParticipantDto | null | undefined): string {
  if (!participant) return '';
  const name = participant.displayName?.trim();
  if (name) return name;
  const players = participant.leagueTeam?.players ?? [];
  const names = players
    .map((p) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim())
    .filter(Boolean);
  if (names.length) return names.join(' / ');
  return '';
}

/**
 * Resolves a display label for a participant id. When the backend provides a
 * resolved participant object (e.g. group.champion/finalist/thirdPlace), that is
 * preferred so a label renders even if the bracket slot cache is stale and the
 * participant isn't attached to any slot. Falls back to scanning slot participants.
 */
export function participantLabelFromSlots(
  participantId: string,
  slots: BracketSlotDto[],
  resolved?: BracketSlotParticipantDto | null
): string {
  if (resolved?.id === participantId) {
    const label = participantLabel(resolved);
    if (label) return label;
  }
  for (const slot of slots) {
    if (slot.participant?.id === participantId) {
      const label = participantLabel(slot.participant);
      if (label) return label;
    }
  }
  return '';
}
