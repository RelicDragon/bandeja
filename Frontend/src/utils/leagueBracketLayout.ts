import type { BracketSlotDto, BracketSlotKind } from '@/api/leagues';
import { isThirdPlaceSlot } from '@/utils/bracketThirdPlace.util';
import type { BasicUser } from '@/types';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';

export type BracketColumn = {
  id: string;
  label: string;
  kind: BracketSlotKind | 'BYE' | 'THIRD_PLACE' | 'CONSOLATION' | 'LOSERS' | 'GRAND_FINAL';
  roundIndex?: number;
  slots: BracketSlotDto[];
};

export function hasConsolationSlots(slots: BracketSlotDto[]): boolean {
  return slots.some((s) => s.slotKind === 'CONSOLATION');
}

export function hasDoubleEliminationSlots(slots: BracketSlotDto[]): boolean {
  return slots.some((s) => s.slotKind === 'GRAND_FINAL');
}

export function buildLosersBracketColumns(
  slots: BracketSlotDto[],
  roundFallback: (roundIndex: number) => string
): BracketColumn[] {
  const losByRound = new Map<number, BracketSlotDto[]>();
  for (const s of slots.filter((x) => x.slotKind === 'LOSERS')) {
    const list = losByRound.get(s.roundIndex) ?? [];
    list.push(s);
    losByRound.set(s.roundIndex, list);
  }
  const cols: BracketColumn[] = [];
  for (const roundIndex of [...losByRound.keys()].sort((a, b) => a - b)) {
    const roundSlots = (losByRound.get(roundIndex) ?? []).sort(
      (a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey)
    );
    const label =
      roundSlots.find((s) => s.roundLabel)?.roundLabel ?? roundFallback(roundIndex);
    cols.push({
      id: `los-${roundIndex}`,
      label,
      kind: 'LOSERS',
      roundIndex,
      slots: roundSlots,
    });
  }
  return cols;
}

export function buildGrandFinalColumns(
  slots: BracketSlotDto[],
  grandFinalLabel: string
): BracketColumn[] {
  const gf = slots
    .filter((s) => s.slotKind === 'GRAND_FINAL')
    .sort((a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey));
  if (gf.length === 0) return [];
  return [
    {
      id: 'grand-final',
      label: gf[0]?.roundLabel ?? grandFinalLabel,
      kind: 'GRAND_FINAL',
      slots: gf,
    },
  ];
}

export function buildBracketColumns(
  slots: BracketSlotDto[],
  columnLabels: {
    playIn: string;
    byes: string;
    thirdPlace: string;
    mainFallback: (roundIndex: number) => string;
  }
): BracketColumn[] {
  const thirdPlace = slots
    .filter(isThirdPlaceSlot)
    .sort((a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey));
  const playIn = slots
    .filter((s) => s.slotKind === 'PLAY_IN')
    .sort((a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey));
  const byes = slots
    .filter((s) => s.slotKind === 'BYE')
    .sort((a, b) => (a.seedRank ?? 999) - (b.seedRank ?? 999));
  const mainByRound = new Map<number, BracketSlotDto[]>();
  for (const s of slots.filter((x) => x.slotKind === 'MAIN' && !isThirdPlaceSlot(x))) {
    const list = mainByRound.get(s.roundIndex) ?? [];
    list.push(s);
    mainByRound.set(s.roundIndex, list);
  }

  const cols: BracketColumn[] = [];
  if (playIn.length > 0) {
    const playInLabel =
      playIn.find((s) => s.roundLabel?.trim())?.roundLabel?.trim() ?? columnLabels.playIn;
    cols.push({ id: 'play-in', label: playInLabel, kind: 'PLAY_IN', slots: playIn });
  }
  if (byes.length > 0) {
    const byeLabel = byes.find((s) => s.roundLabel?.trim())?.roundLabel?.trim() ?? columnLabels.byes;
    cols.push({ id: 'bye', label: byeLabel, kind: 'BYE', slots: byes });
  }
  for (const roundIndex of [...mainByRound.keys()].sort((a, b) => a - b)) {
    const roundSlots = (mainByRound.get(roundIndex) ?? []).sort(
      (a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey)
    );
    const label =
      roundSlots.find((s) => s.roundLabel)?.roundLabel ??
      columnLabels.mainFallback(roundIndex);
    cols.push({
      id: `main-${roundIndex}`,
      label,
      kind: 'MAIN',
      roundIndex,
      slots: roundSlots,
    });
  }
  if (thirdPlace.length > 0) {
    cols.push({
      id: 'third-place',
      label: thirdPlace[0]?.roundLabel ?? columnLabels.thirdPlace,
      kind: 'THIRD_PLACE',
      slots: thirdPlace,
    });
  }
  return cols;
}

export function buildConsolationBracketColumns(
  slots: BracketSlotDto[],
  roundFallback: (roundIndex: number) => string
): BracketColumn[] {
  const consByRound = new Map<number, BracketSlotDto[]>();
  for (const s of slots.filter((x) => x.slotKind === 'CONSOLATION')) {
    const list = consByRound.get(s.roundIndex) ?? [];
    list.push(s);
    consByRound.set(s.roundIndex, list);
  }
  const cols: BracketColumn[] = [];
  for (const roundIndex of [...consByRound.keys()].sort((a, b) => a - b)) {
    const roundSlots = (consByRound.get(roundIndex) ?? []).sort(
      (a, b) => a.matchIndex - b.matchIndex || a.slotKey.localeCompare(b.slotKey)
    );
    const label =
      roundSlots.find((s) => s.roundLabel)?.roundLabel ?? roundFallback(roundIndex);
    cols.push({
      id: `cons-${roundIndex}`,
      label,
      kind: 'CONSOLATION',
      roundIndex,
      slots: roundSlots,
    });
  }
  return cols;
}

export function participantDisplayName(
  participant: BracketSlotDto['participant'] | undefined | null
): string {
  if (!participant) return '';
  if (participant.displayName?.trim()) return participant.displayName.trim();
  const players = participant.leagueTeam?.players ?? [];
  const names = players
    .map((p) => formatFixtureMatrixPlayerName(p.user))
    .filter(Boolean);
  if (names.length > 0) return names.join(' / ');
  return '';
}

export function teamUsersFromParticipant(
  participant: BracketSlotDto['participant'] | undefined | null
): BasicUser[] {
  if (!participant?.leagueTeam?.players) return [];
  return participant.leagueTeam.players.filter((p) => p.user).map((p) => p.user!);
}

export function slotsById(slots: BracketSlotDto[]): Map<string, BracketSlotDto> {
  return new Map(slots.map((s) => [s.id, s]));
}

export function resolveFeederParticipant(
  feederId: string | null | undefined,
  lookup: Map<string, BracketSlotDto>
): BracketSlotDto['participant'] | null {
  if (!feederId) return null;
  const feeder = lookup.get(feederId);
  if (!feeder) return null;
  return feeder.participant ?? null;
}

export function resolveSlotSideParticipants(
  slot: BracketSlotDto,
  lookup: Map<string, BracketSlotDto>
): { participantAId: string | null; participantBId: string | null } {
  const sideA =
    resolveFeederParticipant(slot.feederSlotAId, lookup) ??
    (slot.slotKind === 'PLAY_IN' ? null : slot.participant);
  const sideB = resolveFeederParticipant(slot.feederSlotBId, lookup);
  return {
    participantAId: sideA?.id ?? null,
    participantBId: sideB?.id ?? null,
  };
}

export function resolveByeAdvanceRoundLabel(
  byeSlot: BracketSlotDto,
  allSlots: BracketSlotDto[],
  mainFallback: (roundIndex: number) => string
): string | null {
  if (!byeSlot.winnerSlotId) return null;
  const winner = allSlots.find((s) => s.id === byeSlot.winnerSlotId);
  if (!winner) return null;
  return winner.roundLabel ?? mainFallback(winner.roundIndex);
}
