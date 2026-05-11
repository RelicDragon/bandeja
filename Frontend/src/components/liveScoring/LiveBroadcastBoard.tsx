import { useMemo } from 'react';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import {
  activeSetScore,
  getClassicPointLabels,
  type LiveBoardTheme,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import { LiveServeBallIndicator } from './LiveServeBallIndicator';
import type { LiveServeIndicator } from './LiveTeamPanel';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

function BroadcastTeamRoster({
  side,
  players,
  serveIndicator,
  nameClass,
}: {
  side: LiveTeamSide;
  players: BasicUser[];
  serveIndicator?: LiveServeIndicator | null;
  nameClass: string;
}) {
  const roster = players.length ? players : [null as BasicUser | null];
  const rowIsServing = (rowIndex: number) => {
    if (!serveIndicator || serveIndicator.serverTeam !== side) return false;
    const n = players.length;
    const target = n <= 1 ? 0 : Math.min(Math.max(0, serveIndicator.serverPlayerIndex), n - 1);
    return rowIndex === target;
  };

  return (
    <div className={`flex min-w-0 flex-col items-stretch gap-1.5 text-left sm:gap-2 ${nameClass}`}>
      {roster.map((p, i) => (
        <span key={p?.id ?? `slot-${i}`} className="flex min-w-0 items-center gap-2">
          <PlayerAvatar
            player={p}
            showName={false}
            inlineFace
            inlineFacePlain
            asDiv
            subscribePresence={false}
          />
          <span className="min-w-0 truncate text-sm font-medium sm:text-[0.95rem]">{p ? lineName(p) : '—'}</span>
          {rowIsServing(i) ? <LiveServeBallIndicator inline /> : null}
        </span>
      ))}
    </div>
  );
}

type LiveBroadcastBoardProps = {
  state: LiveScoringState;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  revision: number;
  boardTheme?: LiveBoardTheme;
  serveIndicator?: LiveServeIndicator | null;
};

type ScoreCol = { key: string; a: string | number; b: string | number; impact?: boolean };

export function LiveBroadcastBoard({
  state,
  teamAPlayers,
  teamBPlayers,
  revision,
  boardTheme = 'dark',
  serveIndicator,
}: LiveBroadcastBoardProps) {
  void revision;
  const active = activeSetScore(state);
  const labels = getClassicPointLabels(state.classic);

  const scoreColumns = useMemo((): ScoreCol[] => {
    const cols: ScoreCol[] = [];
    const priorSets = state.sets.slice(0, state.activeSetIndex);
    const classicPts = state.mode === 'classic' && state.classic;
    if (classicPts) {
      cols.push({
        key: 'game',
        a: labels.teamA,
        b: labels.teamB,
        impact: true,
      });
    }
    cols.push({
      key: `set-${state.activeSetIndex}`,
      a: active.teamA,
      b: active.teamB,
      impact: !classicPts,
    });
    priorSets.forEach((s, i) => {
      cols.push({
        key: `prior-${i}`,
        a: s.teamA,
        b: s.teamB,
      });
    });
    return cols;
  }, [
    state.mode,
    state.classic,
    state.activeSetIndex,
    state.sets,
    labels.teamA,
    labels.teamB,
    active.teamA,
    active.teamB,
  ]);

  const isLight = boardTheme === 'light';
  const panel =
    isLight
      ? 'rounded-xl border border-zinc-200/75 bg-gradient-to-br from-white/52 via-primary-50/10 to-white/44 px-3 py-2.5 shadow-sm backdrop-blur-xl backdrop-saturate-150 sm:px-4 sm:py-3'
      : 'rounded-xl border border-white/10 bg-gradient-to-br from-zinc-950/44 via-primary-950/8 to-zinc-900/44 px-3 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150 sm:px-4 sm:py-3';
  const rowDivider = isLight ? 'border-b border-zinc-200/70' : 'border-b border-white/10';
  const nameClass = isLight ? 'text-zinc-800' : 'text-zinc-100';
  const cellBase = isLight ? 'bg-white/48 text-zinc-900 ring-1 ring-zinc-200/45 backdrop-blur-md' : 'bg-black/22 text-zinc-50 ring-1 ring-white/10 backdrop-blur-md';
  const cellEmphasis = isLight
    ? 'bg-primary-50/28 text-zinc-900 ring-1 ring-primary-200/22 backdrop-blur-md'
    : 'bg-white/12 text-white ring-1 ring-primary-400/12 backdrop-blur-md';
  const numClass = 'text-center text-xl font-semibold tabular-nums tracking-tight sm:text-2xl';

  return (
    <div className={`w-fit max-w-full min-w-0 shrink-0 ${panel}`}>
      <div className="flex min-w-0 flex-col">
        <div className={`flex min-w-0 items-center gap-3 pb-2.5 sm:gap-5 sm:pb-3 ${rowDivider}`}>
          <div className="min-w-0 flex-1">
            <BroadcastTeamRoster
              side="teamA"
              players={teamAPlayers}
              serveIndicator={serveIndicator}
              nameClass={nameClass}
            />
          </div>
          <div className="flex shrink-0 items-stretch gap-1.5 sm:gap-2">
            {scoreColumns.map((col) => (
              <div
                key={`${col.key}-a`}
                className={`flex min-w-[2.25rem] items-center justify-center rounded-lg px-2 py-1 sm:min-w-[2.5rem] sm:px-2.5 ${col.impact ? cellEmphasis : cellBase}`}
              >
                <span className={numClass}>
                  <AnimatedLiveBoardValue value={col.a} intensity={col.impact ? 'impact' : 'normal'} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 pt-2.5 sm:gap-5 sm:pt-3">
          <div className="min-w-0 flex-1">
            <BroadcastTeamRoster
              side="teamB"
              players={teamBPlayers}
              serveIndicator={serveIndicator}
              nameClass={nameClass}
            />
          </div>
          <div className="flex shrink-0 items-stretch gap-1.5 sm:gap-2">
            {scoreColumns.map((col) => (
              <div
                key={`${col.key}-b`}
                className={`flex min-w-[2.25rem] items-center justify-center rounded-lg px-2 py-1 sm:min-w-[2.5rem] sm:px-2.5 ${col.impact ? cellEmphasis : cellBase}`}
              >
                <span className={numClass}>
                  <AnimatedLiveBoardValue value={col.b} intensity={col.impact ? 'impact' : 'normal'} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
