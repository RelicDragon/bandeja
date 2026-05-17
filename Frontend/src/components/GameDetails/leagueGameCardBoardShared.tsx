import { Award } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { BasicUser } from '@/types';
import { RoundData } from '@/api/results';
import type { ScoringRules } from '@/utils/scoring';
import { isSuperTieBreakDeciderRow } from '@/utils/scoring';

export function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || '—';
}

export type LeagueScoreSet = {
  key: string;
  teamAScore: number;
  teamBScore: number;
  setIndex: number;
  isTieBreak?: boolean;
  role?: string;
};

export function collectScoreSets(allRounds: RoundData[] | null | undefined): LeagueScoreSet[] {
  if (!allRounds?.length) return [];
  const sets: LeagueScoreSet[] = [];
  allRounds.forEach((round, roundIndex) => {
    round.matches?.forEach((match, matchIndex) => {
      match.sets?.forEach((set, setIndex) => {
        if (set.teamAScore === 0 && set.teamBScore === 0) return;
        sets.push({
          key: `r${roundIndex}-m${matchIndex}-s${setIndex}`,
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
          setIndex,
          isTieBreak: set.isTieBreak,
          role: set.role,
        });
      });
    });
  });
  return sets;
}

export type LeagueBoardCoreProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  winner: 'teamA' | 'teamB' | null;
  isTie: boolean;
  isFinal: boolean;
  allRounds?: RoundData[] | null;
  leagueCardRules: ScoringRules;
  t: TFunction;
};

export function teamHighlightClass(
  team: 'teamA' | 'teamB',
  winner: 'teamA' | 'teamB' | null,
  isTie: boolean,
  variant: 'emerald' | 'yellow' = 'emerald',
) {
  if (winner === team) {
    if (variant === 'yellow') {
      return 'rounded-lg border-2 border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    }
    return 'rounded border border-emerald-200/90 bg-emerald-50/90 dark:border-emerald-800/50 dark:bg-emerald-950/35';
  }
  if (isTie) {
    return 'rounded-lg border-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20';
  }
  return '';
}

export function awardBadge(show: boolean, color: 'emerald' | 'yellow' | 'blue', size: 'sm' | 'md' = 'sm') {
  if (!show) return null;
  const colorClass =
    color === 'emerald'
      ? 'bg-emerald-500 dark:bg-emerald-600'
      : color === 'yellow'
        ? 'bg-yellow-400 dark:bg-yellow-500'
        : 'bg-blue-400 dark:bg-blue-500';
  const dim = size === 'md' ? 'h-6 w-6' : 'h-4 w-4';
  const icon = size === 'md' ? 14 : 9;
  return (
    <div
      className={`absolute -top-1.5 -right-1.5 z-10 flex ${dim} items-center justify-center rounded-full border-2 border-white shadow-lg dark:border-gray-800 ${colorClass}`}
    >
      <Award size={icon} className="text-white" fill="white" />
    </div>
  );
}

export function scoreTone(
  team: 'teamA' | 'teamB',
  set: LeagueScoreSet,
): 'win' | 'lose' | 'tie' | 'neutral' {
  const a = set.teamAScore;
  const b = set.teamBScore;
  const score = team === 'teamA' ? a : b;
  const opp = team === 'teamA' ? b : a;
  if (score > opp && score > 0) return 'win';
  if (score < opp && score >= 0 && opp > 0) return 'lose';
  if (score === opp && score > 0) return 'tie';
  return 'neutral';
}

export function scoreShellClass(tone: 'win' | 'lose' | 'tie' | 'neutral', isExtra: boolean, compact = false) {
  if (isExtra) {
    return 'border-violet-400 border-dashed bg-violet-50/80 dark:border-violet-500 dark:bg-violet-950/30';
  }
  switch (tone) {
    case 'win':
      return 'border-green-300/70 bg-gradient-to-br from-green-100/90 to-green-200/80 dark:border-green-700/50 dark:from-green-900/40 dark:to-green-800/30';
    case 'lose':
      return 'border-red-200/50 bg-gradient-to-br from-red-50/60 to-red-100/40 dark:border-red-700/40 dark:from-red-900/30 dark:to-red-800/20';
    case 'tie':
      return 'border-yellow-300/70 bg-gradient-to-br from-yellow-100/90 to-yellow-200/80 dark:border-yellow-700/50 dark:from-yellow-900/40 dark:to-yellow-800/30';
    default:
      return compact
        ? 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800'
        : 'border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-700 dark:from-gray-800 dark:to-gray-900';
  }
}

export function scoreTextClass(tone: 'win' | 'lose' | 'tie' | 'neutral') {
  switch (tone) {
    case 'win':
      return 'from-green-700 to-green-600 dark:from-green-300 dark:to-green-400';
    case 'lose':
      return 'from-red-700 to-red-600 dark:from-red-300 dark:to-red-400';
    case 'tie':
      return 'from-yellow-700 to-yellow-600 dark:from-yellow-300 dark:to-yellow-400';
    default:
      return 'from-gray-900 to-gray-700 dark:from-white dark:to-gray-300';
  }
}

export function renderSplitScoreCell(
  team: 'teamA' | 'teamB',
  set: LeagueScoreSet,
  leagueCardRules: ScoringRules,
  t: TFunction,
) {
  const isExtra = set.role === 'EXTRA_GAMES' || set.role === 'EXTRA_BALLS';
  const tone = scoreTone(team, set);
  const value = team === 'teamA' ? set.teamAScore : set.teamBScore;

  return (
    <div className="flex h-full min-h-[26px] items-center justify-center">
      <div className="relative">
        <div
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border shadow-sm ${scoreShellClass(tone, isExtra)}`}
        >
          <span
            className={`tabular-nums bg-gradient-to-br bg-clip-text text-sm font-bold leading-none text-transparent ${scoreTextClass(tone)}`}
          >
            {value}
          </span>
          {set.isTieBreak ? (
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-white px-0.5 text-[7px] font-bold leading-none text-primary-600 dark:bg-gray-800 dark:text-primary-400">
              {isSuperTieBreakDeciderRow(leagueCardRules, set.setIndex, set.isTieBreak)
                ? t('gameResults.superTieBreakAbbr')
                : t('gameResults.tieBreakAbbr')}
            </span>
          ) : null}
          {isExtra ? (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[6px] font-bold uppercase text-violet-600 dark:text-violet-400">
              {set.role === 'EXTRA_BALLS'
                ? t('gameResults.extraUnitBallsAbbr')
                : t('gameResults.extraUnitGamesAbbr')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
