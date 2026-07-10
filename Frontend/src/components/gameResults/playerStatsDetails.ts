import { Game } from '@/types';
import { Round, SetResult } from '@/types/gameResults';
import { getRules } from '@/utils/scoring/rulebook';
import {
  automaticSetScoreSuffix,
  resolveAutomaticSetScoreKindForDisplay,
} from '@/utils/scoring/setScoreDelta';
import type { AutomaticSetScoringKind } from '@/utils/scoring/automaticRelaxedScoring';

export interface PlayerSetDetail {
  myScore: number;
  oppScore: number;
  isTieBreak: boolean;
  scoreKind?: AutomaticSetScoringKind;
}

export interface PlayerMatchDetail {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  setsSummary: string;
  result: 'W' | 'L' | 'T' | null;
  statsPlayerId: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAPlayers: string[];
  teamBPlayers: string[];
  sets: PlayerSetDetail[];
}

function getPlayedSets(sets: SetResult[]): SetResult[] {
  return sets.filter((set) => !(set.teamA === 0 && set.teamB === 0));
}

function formatSetsSummary(sets: PlayerSetDetail[]): string {
  if (!sets || sets.length === 0) return '';

  return sets
    .map((set) => {
      return `${set.myScore}-${set.oppScore}${automaticSetScoreSuffix(set.scoreKind, set.isTieBreak)}`;
    })
    .join(' · ');
}

function resolveMatchResult(
  sets: PlayerSetDetail[]
): 'W' | 'L' | 'T' | null {
  if (!sets || sets.length === 0) return null;

  let wonSets = 0;
  let lostSets = 0;

  for (const set of sets) {
    if (set.myScore > set.oppScore) wonSets += 1;
    if (set.myScore < set.oppScore) lostSets += 1;
  }

  if (wonSets === 0 && lostSets === 0) return null;
  if (wonSets > lostSets) return 'W';
  if (lostSets > wonSets) return 'L';
  return 'T';
}

function buildSetDetails(
  sets: SetResult[],
  isInTeamA: boolean,
  matchMetadata: Record<string, unknown> | undefined,
  rules: ReturnType<typeof getRules> | undefined,
): PlayerSetDetail[] {
  const played = getPlayedSets(sets);
  return played.map((set, index) => ({
    myScore: isInTeamA ? set.teamA : set.teamB,
    oppScore: isInTeamA ? set.teamB : set.teamA,
    isTieBreak: !!set.isTieBreak,
    scoreKind: rules
      ? resolveAutomaticSetScoreKindForDisplay(index, played, matchMetadata, rules)
      : undefined,
  }));
}

function resolvePlayerName(playerId: string, playerNameById: Record<string, string>): string {
  return playerNameById[playerId] || playerId.slice(0, 8);
}

export function buildPlayerMatchDetails(
  rounds: Round[],
  playerId: string,
  playerNameById: Record<string, string>,
  game?: Game,
): PlayerMatchDetail[] {
  const rules = game ? getRules(game) : undefined;
  const details: PlayerMatchDetail[] = [];

  rounds.forEach((round, roundIdx) => {
    round.matches.forEach((match, matchIdx) => {
      const inTeamA = match.teamA.includes(playerId);
      const inTeamB = match.teamB.includes(playerId);
      if (!inTeamA && !inTeamB) return;

      const isInTeamA = inTeamA;
      const sets = buildSetDetails(match.sets, isInTeamA, match.metadata, rules);
      const setsSummary = formatSetsSummary(sets);
      if (!setsSummary) return;

      details.push({
        matchId: match.id,
        roundNumber: roundIdx + 1,
        matchNumber: matchIdx + 1,
        setsSummary,
        result: resolveMatchResult(sets),
        statsPlayerId: playerId,
        teamAPlayerIds: [...match.teamA],
        teamBPlayerIds: [...match.teamB],
        teamAPlayers: match.teamA.map((id) => resolvePlayerName(id, playerNameById)),
        teamBPlayers: match.teamB.map((id) => resolvePlayerName(id, playerNameById)),
        sets,
      });
    });
  });

  return details;
}
