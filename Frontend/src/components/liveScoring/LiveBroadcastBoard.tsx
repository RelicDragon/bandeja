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
import type { LiveBroadcastContext } from '@/utils/liveBroadcastContext.util';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

function broadcastLineName(p: BasicUser): string {
  return p.lastName?.trim() || p.firstName?.trim() || p.id;
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
  overlay,
}: {
  side: LiveTeamSide;
  players: BasicUser[];
  serveIndicator?: LiveServeIndicator | null;
  nameClass: string;
  sport?: Sport | string | null;
  overlay?: boolean;
}) {
  const roster = players.length ? players : [null as BasicUser | null];
  const rowIsServing = (rowIndex: number) => {
    if (!serveIndicator || serveIndicator.serverTeam !== side) return false;
    const n = players.length;
    const target = n <= 1 ? 0 : Math.min(Math.max(0, serveIndicator.serverPlayerIndex), n - 1);
    return rowIndex === target;
  };

  return (
    <div
      className={`flex min-w-0 flex-col items-stretch text-left ${
        overlay ? 'min-w-[12.5rem] gap-2 sm:min-w-[15rem] sm:gap-2.5' : 'gap-1.5 sm:gap-2'
      } ${nameClass}`}
    >
      {roster.map((p, i) => (
        <span key={p?.id ?? `slot-${i}`} className={`flex min-w-0 items-center ${overlay ? 'gap-2.5' : 'gap-2'}`}>
          <div className={servingRosterAvatarWrapClassName(rowIsServing(i), overlay ? 'md' : 'sm')}>
            <PlayerAvatar
              player={p}
              showName={false}
              inlineFace
              inlineFacePlain
              inlineFaceSize={overlay ? 'md' : 'sm'}
              asDiv
              subscribePresence={false}
            />
          </div>
          <span
            className={`${servingPlayerNameClassName(rowIsServing(i), 'broadcast')} ${
              overlay ? 'text-[0.95rem] sm:text-base' : ''
            }`}
          >
            {p ? lineName(p) : '—'}
          </span>
          {rowIsServing(i) ? <LiveServeBallIndicator inline sport={sport} /> : null}
        </span>
      ))}
    </div>
  );
}, (prev, next) => {
  if (
    prev.side !== next.side ||
    prev.nameClass !== next.nameClass ||
    prev.sport !== next.sport ||
    prev.overlay !== next.overlay
  ) return false;
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
  broadcastContext?: LiveBroadcastContext | null;
  broadcastTimer?: string | null;
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
  broadcastContext,
  broadcastTimer,
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
  const overlay = !interactive;
  const showBroadcastHeader = overlay && Boolean(broadcastContext || broadcastTimer);
  const panelShape = embedded
    ? attachedFooter
      ? 'overflow-hidden rounded-t-xl'
      : ''
    : attachedFooter
      ? 'rounded-t-xl rounded-b-none border-b-0'
      : overlay
        ? 'overflow-hidden rounded-2xl'
        : 'overflow-hidden rounded-xl';
  const panelBorder = embedded ? '' : 'border';
  const panelPad = attachedFooter
    ? 'px-3 pt-2.5 pb-0 sm:px-4 sm:pt-3 sm:pb-0'
    : overlay
      ? 'px-4 py-3.5 sm:px-5 sm:py-4'
      : 'px-3 py-2.5 sm:px-4 sm:py-3';
  const panel = isLight
    ? embedSolid
      ? `${panelShape} ${panelBorder} border-zinc-200 bg-white ${embedded ? '' : 'shadow-sm'}`
      : `${panelShape} ${panelBorder} border-zinc-900/10 bg-gradient-to-br from-white/95 via-white/88 to-primary-50/82 ${embedded ? '' : 'shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-2xl backdrop-saturate-150'}`
    : embedSolid
      ? `${panelShape} ${panelBorder} border-zinc-700/90 bg-zinc-900 ${embedded ? '' : 'shadow-md'}`
      : `${panelShape} ${panelBorder} border-white/15 bg-gradient-to-br from-zinc-950/92 via-zinc-950/86 to-primary-950/72 ${embedded ? '' : 'shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-2xl backdrop-saturate-150'}`;
  const rowDivider = isLight ? 'border-b border-zinc-200/70' : 'border-b border-white/10';
  const nameClass = isLight ? 'text-zinc-800' : 'text-zinc-100';
  const cellBase = isLight
    ? embedSolid
      ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/90'
      : 'bg-zinc-950/[0.045] text-zinc-900 ring-1 ring-zinc-900/10'
    : embedSolid
      ? 'bg-zinc-800 text-zinc-50 ring-1 ring-zinc-600/70'
      : 'bg-white/[0.055] text-zinc-50 ring-1 ring-white/10';
  const cellEmphasis = isLight
    ? embedSolid
      ? 'bg-primary-100 text-zinc-900 ring-1 ring-primary-300/70'
      : 'bg-primary-500/12 text-zinc-900 ring-1 ring-primary-400/35'
    : embedSolid
      ? 'bg-primary-950 text-white ring-1 ring-primary-500/40'
      : 'bg-primary-400/15 text-white ring-1 ring-primary-300/30';
  const numClass = overlay
    ? 'text-center text-2xl font-black tabular-nums tracking-[-0.04em] sm:text-[1.75rem]'
    : 'text-center text-xl font-semibold tabular-nums tracking-tight sm:text-2xl';
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
      overlay={overlay}
    />
  );

  const scoreCellLayout =
    `flex items-center justify-center px-2 py-1 ${
      overlay ? 'min-w-[3rem] rounded-xl sm:min-w-[3.25rem] sm:px-3' : 'min-w-[2.25rem] rounded-lg sm:min-w-[2.5rem] sm:px-2.5'
    }`;
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

  if (overlay) {
    const compactBorder = isLight ? 'border-zinc-950/15' : 'border-white/15';
    const compactHeader = isLight
      ? 'border-zinc-950/10 bg-zinc-100/[0.95] text-zinc-950'
      : 'border-white/10 bg-zinc-900/[0.95] text-white';
    const compactBody = isLight ? 'bg-white/[0.96] text-zinc-950' : 'bg-zinc-950/[0.94] text-white';
    const compactMuted = isLight ? 'text-zinc-500' : 'text-zinc-400';
    const compactDivider = isLight ? 'border-zinc-950/10' : 'border-white/10';

    const compactRoster = (side: LiveTeamSide) => {
      const players = side === 'teamA' ? teamAPlayers : teamBPlayers;
      const roster = players.length ? players : [null as BasicUser | null];

      return (
        <div className="flex min-w-0 flex-col justify-center gap-px px-3 py-1.5">
          {roster.map((player, index) => {
            const serving = Boolean(
              player &&
                serveIndicator?.serverTeam === side &&
                index ===
                  (players.length <= 1
                    ? 0
                    : Math.min(Math.max(0, serveIndicator.serverPlayerIndex), players.length - 1)),
            );

            return (
              <div key={player?.id ?? `slot-${index}`} className="flex min-w-0 items-center gap-1.5 leading-none">
                <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.045em] sm:text-xs">
                  {player ? broadcastLineName(player) : '—'}
                </span>
                {serving ? <LiveServeBallIndicator inline sport={sport} /> : null}
              </div>
            );
          })}
        </div>
      );
    };

    const compactScoreCell = (col: ScoreCol, value: string | number) => {
      const activeClass = col.impact
        ? isLight
          ? 'bg-primary-600 text-white'
          : 'bg-primary-500 text-white'
        : col.isActiveSet
          ? isLight
            ? 'bg-zinc-950/[0.055] text-zinc-950'
            : 'bg-white/[0.07] text-white'
          : '';

      return (
        <div
          className={`flex min-w-[2.6rem] items-center justify-center border-l ${compactDivider} ${activeClass}`}
        >
          <span className="text-lg font-bold tabular-nums tracking-[-0.035em]">
            <AnimatedLiveBoardValue value={value} intensity={col.impact ? 'impact' : 'normal'} />
          </span>
        </div>
      );
    };

    const compactGridColumns = `minmax(10.5rem,13.5rem) repeat(${scoreColumns.length},2.6rem)`;

    return (
      <div
        className={`broadcast-score-overlay w-fit max-w-full min-w-0 shrink-0 overflow-hidden rounded-lg border ${compactBorder} ${compactBody} shadow-[0_10px_32px_rgba(0,0,0,0.32)] backdrop-blur-xl`}
      >
        {showBroadcastHeader ? (
          <div className={`flex min-h-8 min-w-0 items-center border-b ${compactHeader}`}>
            <span aria-hidden className="self-stretch w-[3px] shrink-0 bg-primary-400" />
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5 px-2.5 py-1.5 leading-none">
              {broadcastContext ? (
                <>
                  <span className="shrink-0 truncate text-[11px] font-bold tracking-[0.01em] sm:text-xs">
                    {broadcastContext.title}
                  </span>
                  {broadcastContext.details.length > 0 ? (
                    <span className={`truncate text-[9px] font-medium sm:text-[10px] ${compactMuted}`}>
                      · {broadcastContext.details.join(' · ')}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
            {broadcastTimer ? (
              <div
                className={`self-stretch border-l px-2.5 flex items-center font-mono text-[10px] font-bold tabular-nums ${compactDivider}`}
              >
                {broadcastTimer}
              </div>
            ) : null}
          </div>
        ) : null}

        <div dir="ltr" className="grid w-max max-w-full" style={{ gridTemplateColumns: compactGridColumns }}>
          <div aria-hidden className={`h-5 border-b ${compactDivider}`} />
          {scoreColumns.map((col) => (
            <div
              key={`compact-header-${col.key}`}
              className={`flex h-5 items-center justify-center border-b border-l text-[8px] font-bold uppercase tracking-[0.08em] ${compactDivider} ${
                col.impact ? (isLight ? 'text-primary-700' : 'text-primary-300') : compactMuted
              }`}
            >
              {columnHeaderText(col)}
            </div>
          ))}

          <div className={`min-w-0 border-b ${compactDivider}`}>{compactRoster('teamA')}</div>
          {scoreColumns.map((col) => (
            <div key={`compact-a-${col.key}`} className={`flex border-b ${compactDivider}`}>
              {compactScoreCell(col, col.a)}
            </div>
          ))}

          <div className="min-w-0">{compactRoster('teamB')}</div>
          {scoreColumns.map((col) => (
            <div key={`compact-b-${col.key}`} className="flex">
              {compactScoreCell(col, col.b)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activeSetCell =
    ' relative z-[1] ring-2 ring-inset ' +
    (isLight
      ? overlay
        ? 'ring-primary-500/60 shadow-[0_0_24px_rgba(14,165,233,0.12)]'
        : 'ring-primary-500/85'
      : embedSolid
        ? 'ring-primary-400/90'
        : 'ring-primary-300/60 shadow-[0_0_28px_rgba(56,189,248,0.14)]');

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
      : `minmax(0,max-content) repeat(${scoreColumns.length},minmax(${overlay ? '3rem' : '2.25rem'},auto))`;

  const row1Bottom = 'pb-1.5';
  const row2Pad = `pb-2.5 ${rowDivider}`;
  const row3Pad = attachedFooter ? 'pt-2.5 pb-2.5' : 'pt-2.5';

  return (
    <div className={`w-fit max-w-full min-w-0 shrink-0 ${overlay ? 'broadcast-score-overlay' : ''} ${panel}`}>
      {showBroadcastHeader ? (
        <div
          className={`relative flex min-w-0 items-center gap-3 border-b px-4 py-3 sm:px-5 sm:py-3.5 ${
            isLight ? 'border-zinc-900/10 bg-white/48' : 'border-white/10 bg-white/[0.035]'
          }`}
        >
          <span
            aria-hidden
            className="h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-400 via-cyan-400 to-emerald-400 shadow-[0_0_18px_rgba(56,189,248,0.45)]"
          />
          {broadcastContext ? (
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-bold tracking-tight sm:text-base ${isLight ? 'text-zinc-950' : 'text-white'}`}>
                {broadcastContext.title}
              </div>
              {broadcastContext.details.length > 0 ? (
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                  {broadcastContext.details.map((detail, index) => (
                    <span
                      key={`${detail}-${index}`}
                      className={`max-w-[13rem] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight sm:text-[11px] ${
                        isLight ? 'bg-zinc-900/[0.06] text-zinc-600' : 'bg-white/[0.08] text-zinc-300'
                      }`}
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {broadcastTimer ? (
            <div
              className={`shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums sm:text-sm ${
                isLight
                  ? 'bg-zinc-950 text-white shadow-sm'
                  : 'bg-white/10 text-white ring-1 ring-inset ring-white/10'
              }`}
            >
              {broadcastTimer}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={panelPad}>
        <div
          dir="ltr"
          className={`grid min-w-0 w-max max-w-full gap-y-0 ${overlay ? 'gap-x-3.5 sm:gap-x-5' : 'gap-x-3 sm:gap-x-5'}`}
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
    </div>
  );
}
