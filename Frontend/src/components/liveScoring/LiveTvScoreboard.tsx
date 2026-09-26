import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { isGoldenPointActive } from '@shared/gameFormat/goldenPoint';
import type { BasicUser } from '@/types';
import {
  getClassicPointLabels,
  liveSetLabelForRow,
  type LiveBoardTheme,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import type { LiveServeIndicator } from './LiveTeamPanel';

/**
 * The big-screen padel / tennis scoreboard for TV mode and the spectator
 * watch board: one row per side, a column per set, and the current game's
 * points in a highlighted column on the end — the layout every tennis
 * broadcast uses. Everything is sized in `em` off one viewport-driven font
 * size, so the same board fills a portrait phone and a 1080p TV.
 */
export type LiveTvScoreboardProps = {
  state: LiveScoringState;
  rules: ScoringRules;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  boardTheme: LiveBoardTheme;
  serveIndicator?: LiveServeIndicator | null;
  matchDecided: boolean;
  /** "Set 2" / "Set 3 · TB" — already localized by the caller. */
  setTitle: string;
  timer?: string | null;
};

type SetColumn = { key: string; a: number; b: number; header: string; active: boolean };

// Width drives the size on a phone, height on a TV; the clamp keeps both sane.
const BOARD_FONT_SIZE = 'clamp(15px, min(5vw, 4.6vh), 64px)';

function playerLine(p: BasicUser | null): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

function servingIndex(side: LiveTeamSide, players: BasicUser[], serve?: LiveServeIndicator | null): number {
  if (!serve || serve.serverTeam !== side) return -1;
  if (players.length <= 1) return 0;
  return Math.min(Math.max(0, serve.serverPlayerIndex), players.length - 1);
}

export function LiveTvScoreboard({
  state,
  rules,
  teamAPlayers,
  teamBPlayers,
  boardTheme,
  serveIndicator,
  matchDecided,
  setTitle,
  timer,
}: LiveTvScoreboardProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const light = boardTheme === 'light';
  const showPoints = state.mode === 'classic' && !matchDecided;
  const points = getClassicPointLabels(state.classic, rules);

  const setColumns = useMemo((): SetColumn[] => {
    const count = Math.max(1, state.activeSetIndex + 1);
    return Array.from({ length: count }, (_, i) => {
      const row = state.sets[i] ?? { teamA: 0, teamB: 0 };
      const label = liveSetLabelForRow(row, i, rules);
      return {
        key: `set-${i}`,
        a: row.teamA ?? 0,
        b: row.teamB ?? 0,
        header: label.kind === 'SUPER_TIE_BREAK' ? t('gameDetails.liveScoring.superTieBreakShort') : String(i + 1),
        active: i === state.activeSetIndex && !matchDecided,
      };
    });
  }, [state.sets, state.activeSetIndex, rules, matchDecided, t]);

  // Sets already decided, for the winner/loser emphasis and the final result.
  const setsWon = useMemo(() => {
    let teamA = 0;
    let teamB = 0;
    for (const col of setColumns) {
      if (col.active) continue;
      if (col.a > col.b) teamA += 1;
      else if (col.b > col.a) teamB += 1;
    }
    return { teamA, teamB };
  }, [setColumns]);

  const inTieBreak = showPoints && Boolean(state.classic?.withinSetTieBreak);

  const status = useMemo((): string | null => {
    if (!showPoints || !state.classic) return null;
    if (state.classic.withinSetTieBreak) return t('live.board.tieBreak');
    const point = state.classic.pointState;
    if (point.kind === 'advantage') return t('live.board.advantage');
    // The engine keeps 40–40 as a regular score (`deuce` is legacy), so level at 40 is the deuce.
    const level40 = point.kind === 'deuce' || (point.teamA === 40 && point.teamB === 40);
    if (!level40) return null;
    return isGoldenPointActive(rules.deucesBeforeGoldenPoint, state.classic.deuceCount ?? 0)
      ? t('live.board.goldenPoint')
      : t('live.board.deuce');
  }, [showPoints, state.classic, rules.deucesBeforeGoldenPoint, t]);

  // In points mode (americano) the running set total is the number to watch.
  const highlightActiveSet = !showPoints && !matchDecided;

  const card = light
    ? 'border-zinc-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]'
    : 'border-white/10 bg-zinc-900 shadow-[0_24px_60px_rgba(0,0,0,0.5)]';
  const muted = light ? 'text-zinc-500' : 'text-zinc-400';
  const divider = light ? 'border-zinc-200' : 'border-white/10';
  const strong = light ? 'text-zinc-950' : 'text-white';
  const dim = light ? 'text-zinc-400' : 'text-zinc-500';
  const highlight = light ? 'bg-primary-600 text-white' : 'bg-primary-500 text-white';
  const activeSetTint = light ? 'bg-zinc-100' : 'bg-white/[0.06]';

  const teamRow = (side: LiveTeamSide, isLast: boolean) => {
    const players = side === 'teamA' ? teamAPlayers : teamBPlayers;
    const roster: (BasicUser | null)[] = players.length ? players : [null];
    const server = servingIndex(side, players, serveIndicator);
    const won = side === 'teamA' ? setsWon.teamA > setsWon.teamB : setsWon.teamB > setsWon.teamA;
    const lost = matchDecided && !won;
    const rowBorder = isLast ? '' : `border-b ${divider}`;

    return (
      <tr key={side} className={rowBorder}>
        <th scope="row" className="py-[0.65em] ps-[0.9em] pe-[0.4em] text-start font-normal">
          <div className="flex min-w-0 flex-col gap-[0.2em]">
            {roster.map((p, i) => (
              <div key={p?.id ?? `slot-${i}`} className="flex min-w-0 items-center gap-[0.45em]">
                <span
                  className={`min-w-0 truncate text-[1.05em] font-semibold leading-tight ${lost ? dim : strong}`}
                >
                  {playerLine(p)}
                </span>
                {i === server && !matchDecided ? (
                  <span
                    role="img"
                    aria-label={t('live.board.serving')}
                    className="inline-block size-[0.55em] shrink-0 rounded-full bg-lime-300 shadow-[0_0_0_0.08em_rgba(77,124,15,0.45)]"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </th>
        {setColumns.map((col) => {
          const mine = side === 'teamA' ? col.a : col.b;
          const theirs = side === 'teamA' ? col.b : col.a;
          const isHighlight = col.active && highlightActiveSet;
          const tone = col.active ? strong : mine > theirs ? strong : dim;
          return (
            <td
              key={col.key}
              className={`px-[0.1em] text-center ${col.active && !isHighlight ? activeSetTint : ''}`}
            >
              <span
                className={`inline-flex min-w-[1.6em] items-center justify-center rounded-[0.35em] px-[0.15em] py-[0.05em] text-[1.6em] font-bold leading-none tabular-nums ${
                  isHighlight ? highlight : tone
                }`}
              >
                <AnimatedLiveBoardValue value={mine} intensity={col.active ? 'impact' : 'normal'} />
              </span>
            </td>
          );
        })}
        {showPoints ? (
          <td className="px-[0.35em] text-center">
            <span
              className={`inline-flex min-w-[1.75em] items-center justify-center rounded-[0.35em] px-[0.2em] py-[0.1em] text-[1.6em] font-black leading-none tabular-nums ${highlight}`}
            >
              <AnimatedLiveBoardValue value={side === 'teamA' ? points.teamA : points.teamB} intensity="impact" />
            </span>
          </td>
        ) : null}
      </tr>
    );
  };

  return (
    <div className="flex w-full flex-col items-center gap-[0.9em]" style={{ fontSize: BOARD_FONT_SIZE }}>
      <div className={`w-full max-w-[36em] overflow-hidden rounded-[1em] border ${card}`} data-testid="live-tv-scoreboard">
        <table dir="ltr" className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            {setColumns.map((col) => (
              <col key={col.key} className="w-[2.3em]" />
            ))}
            {showPoints ? <col className="w-[3.3em]" /> : null}
          </colgroup>
          <thead>
            <tr className={`border-b ${divider}`}>
              <th scope="col" className="py-[0.5em] ps-[1.1em] pe-[0.4em] text-start font-normal">
                <span className="sr-only">{t('live.board.players')} · </span>
                <span className={`inline-flex items-baseline gap-[0.6em] text-[0.62em] font-semibold uppercase tracking-[0.18em] ${muted}`}>
                  <AnimatedLiveBoardValue value={setTitle} />
                  {timer ? (
                    <span className={`font-mono font-bold normal-case tracking-normal tabular-nums ${strong}`}>{timer}</span>
                  ) : null}
                </span>
              </th>
              {setColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`py-[0.35em] text-center text-[0.6em] font-bold uppercase tracking-[0.12em] ${
                    col.active ? strong : muted
                  }`}
                >
                  {col.header}
                </th>
              ))}
              {showPoints ? (
                <th
                  scope="col"
                  className={`py-[0.35em] text-center text-[0.6em] font-bold uppercase tracking-[0.12em] ${
                    light ? 'text-primary-700' : 'text-primary-300'
                  }`}
                >
                  {inTieBreak ? t('gameDetails.liveScoring.tieBreakShort') : t('gameDetails.liveScoring.game')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {teamRow('teamA', false)}
            {teamRow('teamB', true)}
          </tbody>
        </table>
      </div>

      <div className="flex min-h-[1.9em] items-center justify-center" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {status ? (
            <motion.span
              key={status}
              initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`rounded-full px-[0.9em] py-[0.3em] text-[0.8em] font-bold uppercase tracking-[0.14em] ${
                light ? 'bg-amber-100 text-amber-900' : 'bg-amber-400/15 text-amber-200'
              }`}
            >
              {status}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
