import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Check, ChevronRight, Medal, Play, Trophy, WifiOff } from 'lucide-react';
import type { LiveRailGame } from '@/api/live';
import { ClubAvatar } from '@/components/ClubAvatar';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LiveGameSummarySide } from '@/types';
import { minutesSince, sidePlayerNames } from '@/features/live/liveSummaryUpdate';
import {
  liveFinishedLabel,
  liveScoreLabel,
  liveStartedLabel,
  matchPositionLabel,
} from '@/features/live/liveScoreText';
import { LiveScoreDigits } from './LiveScoreDigits';

/**
 * PRD 349 — one game on the rail, drawn as a compact broadcast scoreboard.
 *
 * The same layout as the watch board it opens (`LiveTvScoreboard`): one row
 * per side — faces, names, a column per set, the point score highlighted on
 * the end — so the card previews exactly what a tap leads to.
 *
 * Three phases share the layout. `live` highlights the running set and point
 * and offers **Watch**; `finished` (results went final today) shows every set
 * as completed, ticks the winner and offers **Results**; `inProgress` (a league
 * fixture or a followed player's tournament scored by hand) shows the sets
 * entered so far — none yet is fine — and also offers **Results**. League
 * fixtures carry an amber outline and a ribbon naming the league and round;
 * tournaments a ribbon with their name and round. A multi-match game says which
 * match the card shows ("Match 3/3").
 *
 * The whole card is the tap target. Avatars are plain faces (`asDiv`), never
 * buttons, so nothing interactive nests inside it. `carousel` is the fixed
 * width snap card; `full` fills the rail when the city has one game.
 */

export const LIVE_CARD_WIDTH_PX = 264;

export interface LiveScoreCardProps {
  game: LiveRailGame;
  variant?: 'carousel' | 'full';
  /** Socket is down: the scores are frozen and captioned, never blanked. */
  isReconnecting?: boolean;
  /** Epoch ms the "Started / Finished … ago" line is measured against; the rail ticks it. */
  now: number;
  onOpen: (game: LiveRailGame) => void;
}

interface SideRowProps {
  side: LiveGameSummarySide;
  other: LiveGameSummarySide;
  setCount: number;
  showPoints: boolean;
  finished: boolean;
  /** Only a live board has a set being played right now. */
  live: boolean;
}

function SideRow({ side, other, setCount, showPoints, finished, live }: SideRowProps) {
  const names = sidePlayerNames(side).join(' / ');
  // Without a live board every column is a completed (or entered) set.
  const runningSet = live ? setCount - 1 : -1;

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="live-score-row">
      <div className="flex shrink-0 -space-x-1.5 rtl:space-x-reverse">
        {side.players.slice(0, 2).map((player) => (
          <span key={player.id} className="flex rounded-full ring-2 ring-gray-50 dark:ring-gray-800">
            <PlayerAvatar
              player={player}
              subscribePresence={false}
              inlineFace
              inlineFacePlain
              inlineFaceFlatStack
              asDiv
            />
          </span>
        ))}
      </div>

      <span
        className={`min-w-0 flex-1 truncate text-[13px] leading-tight ${
          other.leading
            ? 'font-medium text-gray-500 dark:text-gray-400'
            : 'font-semibold text-gray-900 dark:text-white'
        }`}
      >
        {names}
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: setCount }, (_, i) => {
          const mine = side.setScores[i] ?? 0;
          const theirs = other.setScores[i] ?? 0;
          const running = i === runningSet;
          const lostSet = !running && mine < theirs;
          return (
            <span
              key={i}
              className={`flex h-6 w-5 items-center justify-center rounded text-sm font-semibold ${
                running
                  ? 'bg-white text-gray-900 dark:bg-white/10 dark:text-white'
                  : lostSet
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              <LiveScoreDigits value={String(mine)} />
            </span>
          );
        })}
      </div>

      {finished ? (
        <span className="flex h-6 w-5 shrink-0 items-center justify-center" data-testid={side.leading ? 'live-winner-mark' : undefined}>
          {side.leading ? (
            <Check size={16} strokeWidth={3} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : null}
        </span>
      ) : showPoints ? (
        <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-md bg-primary-600 text-sm font-bold text-white dark:bg-primary-500">
          <LiveScoreDigits value={side.currentGameScore || '0'} />
        </span>
      ) : null}
    </div>
  );
}

function LeagueRibbon({ league }: { league: NonNullable<LiveRailGame['league']> }) {
  const { t } = useTranslation();
  const stage = league.isPlayoff
    ? t('live.leaguePlayoff')
    : league.roundNumber
      ? t('live.leagueRound', { round: league.roundNumber })
      : null;
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
      data-testid="live-league-ribbon"
    >
      <Trophy size={13} className="shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{league.name}</span>
      {stage ? <span className="shrink-0 text-amber-600/80 dark:text-amber-300/70">· {stage}</span> : null}
    </div>
  );
}

function TournamentRibbon({ name, position }: { name: string | null; position: string | null }) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300"
      data-testid="live-tournament-ribbon"
    >
      <Medal size={13} className="shrink-0" aria-hidden />
      {name ? <span className="min-w-0 truncate">{name}</span> : null}
      {position ? (
        <span className="shrink-0 text-primary-600/80 dark:text-primary-300/70">
          {name ? '· ' : ''}
          {position}
        </span>
      ) : null}
    </div>
  );
}

function LiveScoreCardView({
  game,
  variant = 'carousel',
  isReconnecting = false,
  now,
  onOpen,
}: LiveScoreCardProps) {
  const { t } = useTranslation();
  const summary = game.liveSummary;
  const [sideA, sideB] = summary.sides;
  const finished = game.phase === 'finished';
  const live = game.phase === 'live';
  // Only a live card is in a socket room; nothing else can freeze.
  const frozen = isReconnecting && live;

  // In progress with nothing entered yet draws no set columns at all.
  const setCount = Math.max(live || finished ? 1 : 0, sideA.setScores.length, sideB.setScores.length);
  // `points`-mode sports have no sub-game score; their running set is the live number.
  const showPoints = live && Boolean(sideA.currentGameScore || sideB.currentGameScore);

  const scoreLabel = liveScoreLabel(t, summary, finished);
  const timeText = finished
    ? liveFinishedLabel(t, minutesSince(game.finishedAt, now))
    : liveStartedLabel(t, minutesSince(summary.startedAt, now));
  const position = matchPositionLabel(t, game.matchPosition);
  const tournament = !game.league && game.entityType === 'TOURNAMENT';
  // A tournament names its round in the ribbon; everything else in the footer.
  const footerPosition = tournament ? null : position;
  const statusText = frozen
    ? t('live.reconnecting')
    : [timeText, footerPosition].filter(Boolean).join(' · ');
  const venue = [game.clubName, game.courtName].filter(Boolean).join(' · ') || game.name || game.cityName;
  const leagueName = game.league
    ? `${game.league.name}. `
    : tournament && game.name
      ? `${game.name}. `
      : '';

  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      data-testid="live-score-card"
      data-variant={variant}
      data-phase={game.phase}
      data-league={game.league ? 'true' : undefined}
      aria-label={`${leagueName}${venue}. ${scoreLabel}. ${statusText}`}
      style={variant === 'carousel' ? { width: LIVE_CARD_WIDTH_PX } : undefined}
      className={`flex shrink-0 flex-col gap-2.5 rounded-xl bg-gray-50 p-3 text-start transition-colors hover:bg-gray-100 active:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800 dark:active:bg-gray-800 ${
        variant === 'carousel' ? 'snap-start' : 'w-full'
      } ${game.league ? 'ring-1 ring-inset ring-amber-400/70 dark:ring-amber-400/40' : ''}`}
    >
      {game.league ? <LeagueRibbon league={game.league} /> : null}
      {tournament ? <TournamentRibbon name={game.name} position={position} /> : null}
      <div className="flex w-full min-w-0 items-center gap-2">
        {/* The tile variant fills its positioned parent. */}
        <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
          <ClubAvatar
            club={{ id: game.clubId ?? undefined, name: game.clubName ?? game.cityName, avatar: game.clubAvatar }}
            variant="tile"
            fallbackLetterClassName="text-[10px] font-bold"
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
          {venue}
        </span>
        {game.affectsRating ? (
          <Award
            size={14}
            className="shrink-0 text-amber-500"
            aria-label={t('live.ratedGame')}
            role="img"
          />
        ) : null}
        {game.viewerIsPlaying ? (
          <span className="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
            {t('live.youTag')}
          </span>
        ) : null}
      </div>

      <div
        className={`flex w-full flex-col gap-1.5 transition-opacity ${frozen ? 'opacity-60' : ''}`}
        role="img"
        aria-label={scoreLabel}
        data-testid="live-score-block"
      >
        <SideRow side={sideA} other={sideB} setCount={setCount} showPoints={showPoints} finished={finished} live={live} />
        <SideRow side={sideB} other={sideA} setCount={setCount} showPoints={showPoints} finished={finished} live={live} />
      </div>

      {/* `mt-auto` pins the footer to the bottom when a league ribbon makes a neighbour taller. */}
      <div className="mt-auto flex w-full min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
          {frozen ? (
            <WifiOff size={12} className="shrink-0" aria-hidden />
          ) : finished ? (
            <span className="shrink-0 rounded bg-gray-200/80 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {t('live.final')}
            </span>
          ) : !live ? (
            <span
              className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
              data-testid="live-in-progress-chip"
            >
              {t('live.inProgress')}
            </span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
          )}
          <span className="truncate">{statusText}</span>
        </span>
        {!live ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gray-200/70 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200"
            data-testid="live-results-cta"
            aria-hidden
          >
            {t('live.results')}
            <ChevronRight size={14} className="rtl:rotate-180" />
          </span>
        ) : (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-600/10 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-400/15 dark:text-primary-300"
            data-testid="live-watch-cta"
            aria-hidden
          >
            <Play size={12} className="fill-current" />
            {t('live.watch')}
          </span>
        )}
      </div>
    </button>
  );
}

export const LiveScoreCard = memo(LiveScoreCardView);
