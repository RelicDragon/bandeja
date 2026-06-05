import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import {
  activeSetScore,
  getClassicPointLabels,
  liveSetLabelForRow,
  type LiveBoardTheme,
  type LiveScoringState,
  type LiveSetLabel,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import type { Sport } from '@/types';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import { LiveServeBallIndicator } from './LiveServeBallIndicator';
import type { LiveServeIndicator } from './LiveTeamPanel';
import { servingPlayerNameClassName, servingRosterAvatarWrapClassName } from './servingRosterStyles';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

function samePlayerLineup(a: BasicUser[], b: BasicUser[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

const BroadcastTeamRoster = memo(function BroadcastTeamRoster({
  side,
  players,
  serveIndicator,
  nameClass,
  sport,
}: {
  side: LiveTeamSide;
  players: BasicUser[];
  serveIndicator?: LiveServeIndicator | null;
  nameClass: string;
  sport?: Sport | string | null;
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
          <div className={servingRosterAvatarWrapClassName(rowIsServing(i))}>
            <PlayerAvatar
              player={p}
              showName={false}
              inlineFace
              inlineFacePlain
              asDiv
              subscribePresence={false}
            />
          </div>
          <span className={servingPlayerNameClassName(rowIsServing(i), 'broadcast')}>
            {p ? lineName(p) : '—'}
          </span>
          {rowIsServing(i) ? <LiveServeBallIndicator inline sport={sport} /> : null}
        </span>
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.side !== next.side || prev.nameClass !== next.nameClass || prev.sport !== next.sport) return false;
  if (!samePlayerLineup(prev.players, next.players)) return false;
  const ps = prev.serveIndicator;
  const ns = next.serveIndicator;
  if (!ps && !ns) return true;
  if (!ps || !ns) return false;
  return ps.serverTeam === ns.serverTeam && ps.serverPlayerIndex === ns.serverPlayerIndex;
});

type LiveBroadcastBoardProps = {
  state: LiveScoringState;
  rules?: ScoringRules;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  revision: number;
  boardTheme?: LiveBoardTheme;
  serveIndicator?: LiveServeIndicator | null;
  sport?: Sport | string | null;
  interactive?: boolean;
  disabled?: boolean;
  /** Serve guide strip sits flush below — square off bottom corners and border. */
  attachedFooter?: boolean;
  /** Outer border/rounding handled by parent shell (serve footer attached). */
  embedded?: boolean;
  onScore?: (side: LiveTeamSide) => void;
  onUndo?: (side: LiveTeamSide) => void;
};

type ScoreCol = {
  key: string;
  a: string | number;
  b: string | number;
  impact?: boolean;
  /** classic current-points column */
  headerKind: 'game' | 'set';
  setOneBased?: number;
  setLabel?: LiveSetLabel | null;
  /** current set column (games won in this set) */
  isActiveSet: boolean;
};

export function LiveBroadcastBoard({
  state,
  rules,
  teamAPlayers,
  teamBPlayers,
  revision,
  boardTheme = 'dark',
  serveIndicator,
  sport,
  interactive,
  disabled,
  attachedFooter,
  embedded,
  onScore,
  onUndo,
}: LiveBroadcastBoardProps) {
  void revision;
  const { t } = useTranslation();
  const active = activeSetScore(state);
  const labels = getClassicPointLabels(state.classic, rules);

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
        headerKind: 'game',
        isActiveSet: false,
      });
    }
    priorSets.forEach((s, i) => {
      cols.push({
        key: `prior-${i}`,
        a: s.teamA,
        b: s.teamB,
        headerKind: 'set',
        setOneBased: i + 1,
        setLabel: rules ? liveSetLabelForRow(s, i, rules) : null,
        isActiveSet: false,
      });
    });
    cols.push({
      key: `set-${state.activeSetIndex}`,
      a: active.teamA,
      b: active.teamB,
      impact: !classicPts,
      headerKind: 'set',
      setOneBased: state.activeSetIndex + 1,
      setLabel: rules ? liveSetLabelForRow(active, state.activeSetIndex, rules) : null,
      isActiveSet: true,
    });
    return cols;
  }, [state.mode, state.classic, state.activeSetIndex, state.sets, active, labels.teamA, labels.teamB, rules]);

  const isLight = boardTheme === 'light';
  const embedSolid = Boolean(interactive);
  const panelShape = embedded ? '' : attachedFooter ? 'rounded-t-xl rounded-b-none border-b-0' : 'rounded-xl';
  const panelBorder = embedded ? '' : 'border';
  const panelPad = attachedFooter ? 'px-3 pt-2.5 pb-0 sm:px-4 sm:pt-3 sm:pb-0' : 'px-3 py-2.5 sm:px-4 sm:py-3';
  const panel = isLight
    ? embedSolid
      ? `${panelShape} ${panelBorder} border-zinc-200 bg-white ${panelPad} ${embedded ? '' : 'shadow-sm'}`
      : `${panelShape} ${panelBorder} border-zinc-200/75 bg-gradient-to-br from-white/52 via-primary-50/10 to-white/44 ${panelPad} ${embedded ? '' : 'shadow-sm backdrop-blur-xl backdrop-saturate-150'}`
    : embedSolid
      ? `${panelShape} ${panelBorder} border-zinc-700/90 bg-zinc-900 ${panelPad} ${embedded ? '' : 'shadow-md'}`
      : `${panelShape} ${panelBorder} border-white/10 bg-gradient-to-br from-zinc-950/44 via-primary-950/8 to-zinc-900/44 ${panelPad} ${embedded ? '' : 'shadow-[0_4px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl backdrop-saturate-150'}`;
  const rowDivider = isLight ? 'border-b border-zinc-200/70' : 'border-b border-white/10';
  const nameClass = isLight ? 'text-zinc-800' : 'text-zinc-100';
  const cellBase = isLight
    ? embedSolid
      ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/90'
      : 'bg-white/48 text-zinc-900 ring-1 ring-zinc-200/45 backdrop-blur-md'
    : embedSolid
      ? 'bg-zinc-800 text-zinc-50 ring-1 ring-zinc-600/70'
      : 'bg-black/22 text-zinc-50 ring-1 ring-white/10 backdrop-blur-md';
  const cellEmphasis = isLight
    ? embedSolid
      ? 'bg-primary-100 text-zinc-900 ring-1 ring-primary-300/70'
      : 'bg-primary-50/28 text-zinc-900 ring-1 ring-primary-200/22 backdrop-blur-md'
    : embedSolid
      ? 'bg-primary-950 text-white ring-1 ring-primary-500/40'
      : 'bg-white/12 text-white ring-1 ring-primary-400/12 backdrop-blur-md';
  const numClass = 'text-center text-xl font-semibold tabular-nums tracking-tight sm:text-2xl';
  const undoCell = isLight
    ? embedSolid
      ? 'flex min-h-[2.5rem] min-w-[2.75rem] max-w-[4rem] items-center justify-center rounded-lg border border-zinc-300 bg-zinc-100 px-1 py-1 text-[10px] font-semibold leading-tight text-zinc-800 sm:min-h-[2.75rem] sm:min-w-[3rem] sm:text-xs'
      : 'flex min-h-[2.5rem] min-w-[2.75rem] max-w-[4rem] items-center justify-center rounded-lg border border-zinc-300/80 bg-white/60 px-1 py-1 text-[10px] font-semibold leading-tight text-zinc-800 backdrop-blur-md sm:min-h-[2.75rem] sm:min-w-[3rem] sm:text-xs'
    : embedSolid
      ? 'flex min-h-[2.5rem] min-w-[2.75rem] max-w-[4rem] items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 px-1 py-1 text-[10px] font-semibold leading-tight text-zinc-100 sm:min-h-[2.75rem] sm:min-w-[3rem] sm:text-xs'
      : 'flex min-h-[2.5rem] min-w-[2.75rem] max-w-[4rem] items-center justify-center rounded-lg border border-white/15 bg-black/30 px-1 py-1 text-[10px] font-semibold leading-tight text-zinc-100 backdrop-blur-md sm:min-h-[2.75rem] sm:min-w-[3rem] sm:text-xs';

  const rosterBlock = (side: LiveTeamSide) => (
    <BroadcastTeamRoster
      side={side}
      players={side === 'teamA' ? teamAPlayers : teamBPlayers}
      serveIndicator={serveIndicator}
      nameClass={nameClass}
      sport={sport}
    />
  );

  const scoreCellLayout =
    'flex min-w-[2.25rem] items-center justify-center rounded-lg px-2 py-1 sm:min-w-[2.5rem] sm:px-2.5';
  const scoreCellInteractive =
    ' cursor-pointer transition-transform enabled:active:scale-[0.99] enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary-500/45 disabled:opacity-45';

  const headerLabelClass = isLight
    ? 'text-center text-[10px] font-semibold leading-tight text-zinc-500 sm:text-xs'
    : 'text-center text-[10px] font-semibold leading-tight text-zinc-400 sm:text-xs';
  const headerLabelActiveClass = isLight
    ? 'text-center text-[10px] font-bold leading-tight text-primary-700 sm:text-xs'
    : 'text-center text-[10px] font-bold leading-tight text-primary-300 sm:text-xs';
  const columnHeaderText = (col: ScoreCol) => {
    if (col.headerKind === 'game') return t('gameDetails.liveScoring.game');
    const n = col.setOneBased ?? 1;
    if (col.setLabel?.kind === 'SUPER_TIE_BREAK') return t('gameDetails.liveScoring.superTieBreakShort');
    if (col.setLabel?.kind === 'TIE_BREAK') return `${t('gameDetails.liveScoring.setShort')} ${n} · ${t('gameDetails.liveScoring.tieBreakShort')}`;
    return t('gameDetails.liveScoring.setN', { n });
  };

  const activeSetCell =
    ' relative z-[1] ring-2 ring-inset ' +
    (isLight ? 'ring-primary-500/85' : embedSolid ? 'ring-primary-400/90' : 'ring-primary-400/75');

  const scoreCell = (side: LiveTeamSide, col: ScoreCol, rowKey: 'a' | 'b') => {
    const impact = Boolean(col.impact);
    const shell = `${scoreCellLayout} ${impact ? cellEmphasis : cellBase}${col.isActiveSet ? ` ${activeSetCell}` : ''}${
      interactive && onScore ? scoreCellInteractive : ''
    }`;
    const inner = (
      <span className={numClass}>
        <AnimatedLiveBoardValue value={rowKey === 'a' ? col.a : col.b} intensity={impact ? 'impact' : 'normal'} />
      </span>
    );
    if (interactive && onScore) {
      return (
        <button type="button" disabled={disabled} className={shell} onClick={() => onScore(side)}>
          {inner}
        </button>
      );
    }
    return <div className={shell}>{inner}</div>;
  };

  const showUndo = Boolean(interactive && onUndo);
  const gridTemplateColumns =
    showUndo
      ? `minmax(0,max-content) repeat(${scoreColumns.length},minmax(2.25rem,auto)) minmax(2.75rem,auto)`
      : `minmax(0,max-content) repeat(${scoreColumns.length},minmax(2.25rem,auto))`;

  const row1Bottom = 'pb-1.5';
  const row2Pad = `pb-2.5 ${rowDivider}`;
  const row3Pad = attachedFooter ? 'pt-2.5 pb-2.5' : 'pt-2.5';

  return (
    <div className={`w-fit max-w-full min-w-0 shrink-0 ${panel}`}>
      <div
        dir="ltr"
        className="grid min-w-0 w-max max-w-full gap-x-3 gap-y-0 sm:gap-x-5"
        style={{ gridTemplateColumns }}
      >
        <div aria-hidden className={`min-w-0 ${row1Bottom}`} />
        {scoreColumns.map((col) => (
          <div key={`hdr-${col.key}`} className={`flex min-w-0 items-end justify-center self-stretch px-0.5 ${row1Bottom}`}>
            <span className={`${col.isActiveSet ? headerLabelActiveClass : headerLabelClass} line-clamp-2 text-center`}>
              {columnHeaderText(col)}
            </span>
          </div>
        ))}
        {showUndo ? <div className={`min-h-[1.25rem] min-w-0 ${row1Bottom}`} aria-hidden /> : null}

        <div className={`flex min-w-0 items-center ${row2Pad}`}>
          {interactive && onScore ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onScore('teamA')}
              className="w-full rounded-lg text-left outline-none transition-transform enabled:active:scale-[0.99] enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary-500/45 disabled:opacity-45"
            >
              {rosterBlock('teamA')}
            </button>
          ) : (
            rosterBlock('teamA')
          )}
        </div>
        {scoreColumns.map((col) => (
          <div key={`wa-${col.key}`} className={`flex min-w-0 items-stretch justify-center self-stretch ${row2Pad}`}>
            {scoreCell('teamA', col, 'a')}
          </div>
        ))}
        {showUndo ? (
          <div className={`flex min-w-0 items-stretch justify-center self-stretch ${row2Pad}`}>
            <button
              type="button"
              className={undoCell}
              disabled={disabled}
              aria-label="Undo"
              onClick={() => onUndo?.('teamA')}
            >
              <Undo2 className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ) : null}

        <div className={`flex min-w-0 items-center ${row3Pad}`}>
          {interactive && onScore ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onScore('teamB')}
              className="w-full rounded-lg text-left outline-none transition-transform enabled:active:scale-[0.99] enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary-500/45 disabled:opacity-45"
            >
              {rosterBlock('teamB')}
            </button>
          ) : (
            rosterBlock('teamB')
          )}
        </div>
        {scoreColumns.map((col) => (
          <div key={`wb-${col.key}`} className={`flex min-w-0 items-stretch justify-center self-stretch ${row3Pad}`}>
            {scoreCell('teamB', col, 'b')}
          </div>
        ))}
        {showUndo ? (
          <div className={`flex min-w-0 items-stretch justify-center self-stretch ${row3Pad}`}>
            <button
              type="button"
              className={undoCell}
              disabled={disabled}
              aria-label="Undo"
              onClick={() => onUndo?.('teamB')}
            >
              <Undo2 className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
