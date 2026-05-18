import type { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import type { LiveBoardTheme, LiveTeamSide } from '@/utils/liveScoring';
import { AnimatedLiveBoardValue } from './AnimatedLiveBoardValue';
import { LiveServeBallIndicator } from './LiveServeBallIndicator';
import { servingPlayerNameClassName } from './servingRosterStyles';

export type LiveServeIndicator = {
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
};

type LiveTeamPanelProps = {
  side: LiveTeamSide;
  players: BasicUser[];
  games: number;
  point?: string;
  tv?: boolean;
  boardTheme?: LiveBoardTheme;
  serveIndicator?: LiveServeIndicator | null;
  disabled?: boolean;
  onScore?: (side: LiveTeamSide) => void;
  onUndo?: (side: LiveTeamSide) => void;
};

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

export const LiveTeamPanel = ({
  side,
  players,
  games,
  point,
  tv,
  boardTheme = 'dark',
  serveIndicator,
  disabled,
  onScore,
  onUndo,
}: LiveTeamPanelProps) => {
  const roster = players.length ? players : [null];
  const nonInteractive = Boolean(tv);
  const scoreLabelIsPoint = Boolean(!tv && onScore && point != null && point !== '');
  const rowIsServing = (rowIndex: number) => {
    if (!serveIndicator || serveIndicator.serverTeam !== side) return false;
    const n = players.length;
    const target = n <= 1 ? 0 : Math.min(Math.max(0, serveIndicator.serverPlayerIndex), n - 1);
    return rowIndex === target;
  };

  return (
    <section
      aria-label={side === 'teamA' ? 'Team A' : 'Team B'}
      className={
        tv
          ? boardTheme === 'light'
            ? 'flex min-h-0 flex-1 flex-col items-stretch justify-center rounded-[2rem] border border-gray-200 bg-gray-100/70 p-4 text-left md:p-5'
            : 'flex min-h-0 flex-1 flex-col items-stretch justify-center rounded-[2rem] border border-white/10 bg-white/5 p-4 text-left md:p-5'
          : 'flex min-h-[12rem] flex-col rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900'
      }
    >
      <div className={`flex flex-col gap-2 ${tv ? 'gap-3' : ''}`}>
        {roster.map((p, i) => (
          <div key={p?.id ?? `empty-${i}`} className="flex min-w-0 items-center gap-3">
            {tv ? (
              <>
                <PlayerAvatar
                  player={p}
                  showName={false}
                  inlineFace
                  inlineFacePlain
                  inlineFaceSize="md"
                  asDiv={nonInteractive}
                  subscribePresence={false}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={servingPlayerNameClassName(
                      rowIsServing(i),
                      boardTheme === 'light' ? 'tvLight' : 'tvDark'
                    )}
                  >
                    {p ? lineName(p) : '—'}
                  </span>
                  {rowIsServing(i) ? <LiveServeBallIndicator inline /> : null}
                </div>
              </>
            ) : (
              <>
                <PlayerAvatar
                  player={p}
                  showName={false}
                  extrasmall
                  asDiv={nonInteractive}
                  subscribePresence={false}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={servingPlayerNameClassName(rowIsServing(i), 'panel')}>
                    {p ? lineName(p) : '—'}
                  </span>
                  {rowIsServing(i) ? <LiveServeBallIndicator inline /> : null}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex w-full items-end justify-center gap-4 pt-4 md:pt-6">
        <div>
          <div
            className={
              tv
                ? boardTheme === 'light'
                  ? 'text-[clamp(4rem,16vw,13rem)] font-black leading-none text-gray-900'
                  : 'text-[clamp(4rem,16vw,13rem)] font-black leading-none'
                : 'text-7xl font-black leading-none'
            }
          >
            {tv ? <AnimatedLiveBoardValue value={games} intensity="impact" /> : games}
          </div>
          {point && !scoreLabelIsPoint ? (
            <div
              className={
                tv
                  ? boardTheme === 'light'
                    ? 'mt-2 text-[clamp(1.7rem,5vw,5rem)] font-bold text-gray-700'
                    : 'mt-2 text-[clamp(1.7rem,5vw,5rem)] font-bold text-white/80'
                  : 'mt-2 text-3xl font-bold'
              }
            >
              {tv ? <AnimatedLiveBoardValue value={point} intensity="impact" /> : point}
            </div>
          ) : null}
        </div>
      </div>
      {!tv ? (
        <div className="mt-5 flex w-full min-w-0 gap-2">
          {scoreLabelIsPoint ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onScore?.(side)}
              className="min-w-0 flex-1 rounded-2xl bg-primary-600 py-5 text-4xl font-black tabular-nums leading-none text-white active:scale-[0.99] disabled:opacity-50 sm:text-5xl"
              aria-label="Add point"
            >
              {point}
            </button>
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 rounded-2xl bg-primary-600 py-5 text-lg font-black text-white active:scale-[0.99] disabled:opacity-50"
              disabled={disabled}
              onClick={() => onScore?.(side)}
            >
              + Point
            </button>
          )}
          <button
            type="button"
            className="shrink-0 self-stretch rounded-2xl border border-gray-300 px-4 text-sm font-semibold dark:border-gray-700"
            disabled={disabled}
            onClick={() => onUndo?.(side)}
          >
            Undo
          </button>
        </div>
      ) : null}
    </section>
  );
};
