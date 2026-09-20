import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  Check,
  Flame,
  MessageSquare,
  Percent,
  Repeat,
  Trophy,
} from 'lucide-react';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { GameCard } from '@/components/GameCard';
import { GameCardSkeleton } from '@/components/home/GameCardSkeleton';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { StatTile } from '@/components/ui/StatTile';
import { StatTileRow } from '@/components/ui/StatTileRow';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/queries/queryKeys';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { formatIntlPercent } from '@/utils/intlPercent';
import { seriesApi, type SeriesRegular, type SeriesRegularUser } from '@/api/series';
import type { Game } from '@/types';
import {
  cadenceLabelKey,
  formatDayKey,
  formatLocalTime,
  formatShortDate,
  formatShortDateTime,
  formatWeekdayName,
} from '@/features/game-series/seriesFormat';
import { useSeriesDetail } from '@/features/game-series/useSeries';
import {
  seriesRegularAction,
  seriesRegularCandidates,
  seriesRegularName,
  type SeriesRegularAction,
} from '@/features/game-series/seriesRosterActions';

/**
 * PRD 345 — `/series/:id`, the series destination.
 *
 * Hero (club backdrop + gradient + next-occurrence tile + regulars stack with
 * confirmation checks) → stats band of three `StatTile`s with `CountUpNumber` →
 * `SegmentedSwitch` tabs Upcoming / History / Regulars.
 *
 * Every animation has a reduced-motion path, every colour-coded state also
 * carries text, and all spacing uses logical properties so `ar` mirrors.
 */

type SeriesTab = 'upcoming' | 'history' | 'regulars';

const SeriesHeroSkeleton = () => (
  <div className="mb-4" aria-hidden>
    <div className={`${shimmerBlock} h-36 w-full rounded-2xl`} />
    <div className={`${shimmerBlock} mt-3 h-20 w-full rounded-2xl`} />
  </div>
);

const RegularRow = ({
  regular,
  action,
  onRemove,
  onLeave,
}: {
  regular: SeriesRegular;
  action: SeriesRegularAction;
  onRemove: (userId: string) => void;
  onLeave: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const name = [regular.user?.firstName, regular.user?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <li className="flex min-h-[44px] items-center gap-3 rounded-xl bg-white/70 p-2 dark:bg-gray-800/50">
      {regular.user?.avatar ? (
        <img
          src={regular.user.avatar}
          alt=""
          loading="lazy"
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700 dark:bg-gray-600 dark:text-gray-100"
          aria-hidden
        >
          {name ? [...name][0].toLocaleUpperCase('und') : '?'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{name}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {t('series.regularGames', { count: regular.gamesPlayed })}
          {/* The `%` is the locale's, not the translator's — `cs` wants a space
              before it and `ar` wants its own numerals and isolation. */}
          {regular.winRate !== null
            ? ` · ${t('series.regularWinRate', {
                value: formatIntlPercent(regular.winRate, i18n.language),
              })}`
            : ''}
          {regular.attendanceRate !== null
            ? ` · ${t('series.regularAttendance', {
                value: formatIntlPercent(regular.attendanceRate, i18n.language),
              })}`
            : ''}
        </p>
      </div>
      {regular.confirmedForNext && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
          <Check className="h-3 w-3" aria-hidden />
          {t('series.nextWeekTitle')}
        </span>
      )}
      {action === 'remove' && regular.user && (
        <button
          type="button"
          onClick={() => onRemove(regular.user!.id)}
          className="min-h-[44px] shrink-0 rounded-lg px-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t('series.removeRegular')}
        </button>
      )}
      {/* Own row: "not next week". Deliberately different copy from the
          organizer's "Remove", and confirmed, because it is easy to read as
          "leave tonight's game" — which it is not (PRD 345, user story 18). */}
      {action === 'leave' && (
        <button
          type="button"
          onClick={onLeave}
          className="min-h-[44px] shrink-0 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          {t('series.leaveRegulars')}
        </button>
      )}
    </li>
  );
};

const CandidateRow = ({
  user,
  busy,
  onAdd,
}: {
  user: SeriesRegularUser;
  busy: boolean;
  onAdd: (userId: string) => void;
}) => {
  const { t } = useTranslation();
  const name = seriesRegularName(user, t('series.organizer'));

  return (
    <li className="flex min-h-[44px] items-center gap-3 rounded-xl bg-white/70 p-2 dark:bg-gray-800/50">
      {user.avatar ? (
        <img
          src={user.avatar}
          alt=""
          loading="lazy"
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700 dark:bg-gray-600 dark:text-gray-100"
          aria-hidden
        >
          {[...name][0].toLocaleUpperCase('und')}
        </span>
      )}
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
        {name}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAdd(user.id)}
        className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50 dark:text-primary-300 dark:hover:bg-primary-900/30"
      >
        {t('series.addRegularAction')}
      </button>
    </li>
  );
};

export const SeriesPage = () => {
  const { id: seriesId } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = usePrefersReducedMotion();
  const currentUser = useAuthStore((state) => state.user);

  const [tab, setTab] = useState<SeriesTab>('upcoming');
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useSeriesDetail(seriesId);
  const locale = i18n.language;

  const refresh = useCallback(() => {
    if (!seriesId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
    // Ending, renaming or re-rostering a series also changes the my-series list
    // that feeds the cadence chip on Create Game — invalidate what changed.
    void queryClient.invalidateQueries({ queryKey: queryKeys.series.mine });
  }, [queryClient, seriesId]);

  const handleUndoSkip = useCallback(
    async (dayKey: string) => {
      if (!seriesId) return;
      try {
        await seriesApi.undoSkip(seriesId, dayKey);
        toast.success(t('series.undone'));
        refresh();
      } catch {
        toast.error(t('series.undoError'));
      }
    },
    [refresh, seriesId, t],
  );

  const handleRemoveRegular = useCallback(
    async (userId: string) => {
      if (!seriesId) return;
      try {
        await seriesApi.removeRegular(seriesId, userId);
        toast.success(t('series.removed'));
        refresh();
      } catch {
        toast.error(t('series.regularError'));
      }
    },
    [refresh, seriesId, t],
  );

  /**
   * PRD 345, user story 18 — "not next week", which is **not** "not tonight".
   * `DELETE /series/:id/regulars/:userId` only clears the roster row; the
   * current occurrence's seat is left exactly as it was.
   */
  const handleLeaveRegulars = useCallback(async () => {
    if (!seriesId || !currentUser?.id) return;
    setLeaving(true);
    try {
      await seriesApi.removeRegular(seriesId, currentUser.id);
      toast.success(t('series.leftRegulars'));
      setLeaveOpen(false);
      refresh();
    } catch {
      toast.error(t('series.regularError'));
    } finally {
      setLeaving(false);
    }
  }, [currentUser?.id, refresh, seriesId, t]);

  const handleAddRegular = useCallback(
    async (userId: string) => {
      if (!seriesId) return;
      setAddingUserId(userId);
      try {
        await seriesApi.addRegular(seriesId, userId);
        toast.success(t('series.added'));
        refresh();
      } catch {
        toast.error(t('series.regularError'));
      } finally {
        setAddingUserId(null);
      }
    },
    [refresh, seriesId, t],
  );

  const handleEndSeries = useCallback(async () => {
    if (!seriesId) return;
    setEnding(true);
    try {
      const response = await seriesApi.end(seriesId);
      toast.success(t('series.ended'));
      if (response.data.data.keptGameIds.length > 0) {
        toast(t('series.keptGamesNote', { count: response.data.data.keptGameIds.length }));
      }
      setEndOpen(false);
      refresh();
    } catch {
      toast.error(t('series.endError'));
    } finally {
      setEnding(false);
    }
  }, [refresh, seriesId, t]);

  const handleOpenChat = useCallback(async () => {
    if (!seriesId) return;
    try {
      const response = await seriesApi.openChat(seriesId);
      navigate(`/group-chat/${response.data.data.groupChannelId}`);
    } catch {
      toast.error(t('series.loadError'));
    }
  }, [navigate, seriesId, t]);

  const skippedUpcoming = useMemo(
    () => (data?.skips ?? []).filter((skip) => skip.undoable),
    [data?.skips],
  );

  /**
   * The organizer's "add a regular" offer. There is no people search on this
   * surface and the endpoint is owner-only by design, so the candidates are the
   * series' own players: anyone seated in an occurrence who is not on the
   * roster yet. Past first — a regular is someone who has already shown up.
   */
  const addCandidates = useMemo(
    () =>
      seriesRegularCandidates(
        [...(data?.past ?? []), ...(data?.upcoming ?? [])],
        data?.regulars ?? [],
      ),
    [data?.past, data?.upcoming, data?.regulars],
  );

  if (!isGameSeriesEnabled()) return null;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-2 py-4">
        <SeriesHeroSkeleton />
        <div className="flex flex-col gap-3">
          <GameCardSkeleton />
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-2 py-6">
        <EmptyStateCard
          icon={Repeat}
          title={t('series.notFound')}
          description={t('series.loadError')}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-[44px] rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white"
            >
              {t('series.retry')}
            </button>
          }
        />
      </div>
    );
  }

  const { series, upcoming, past, regulars, stats, nextOccurrence, plannedDayKeys } = data;
  const isEnded = series.status === 'ENDED';
  const confirmedRegulars = regulars.filter((regular) => regular.confirmedForNext).length;

  return (
    <div className="mx-auto w-full max-w-2xl px-2 py-4">
      {/* Hero */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-4 text-white"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_60%)]"
          aria-hidden
        />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/80">
            <Repeat className="h-3.5 w-3.5" aria-hidden />
            {t(cadenceLabelKey(series.cadence))}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight">{series.name}</h1>
          <p className="mt-0.5 text-sm text-white/85">
            {`${formatWeekdayName(series.weekday, locale)} ${formatLocalTime(series.startTimeLocal, locale)}`}
          </p>

          {isEnded && series.endedAt && (
            <p className="mt-2 inline-flex rounded-full bg-black/25 px-3 py-1 text-xs font-medium">
              {t('series.endedOn', {
                date: formatShortDate(series.endedAt, { locale }),
              })}
            </p>
          )}

          {!isEnded && nextOccurrence && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/15 p-3">
              <CalendarDays className="h-5 w-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {formatShortDateTime(nextOccurrence.startTime, { locale })}
                </p>
                <p className="truncate text-xs text-white/80">
                  {t('series.confirmedOf', {
                    confirmed: nextOccurrence.confirmedCount,
                    count: nextOccurrence.regularCount,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/games/${nextOccurrence.gameId}`)}
                className="min-h-[44px] shrink-0 rounded-lg bg-white px-3 text-sm font-semibold text-primary-700"
              >
                {nextOccurrence.viewerIsPlaying ? t('series.seatKept') : t('series.openSeries')}
              </button>
            </div>
          )}

          {regulars.length > 0 && (
            <ul
              className="mt-3 flex flex-wrap items-center gap-1.5"
              aria-label={t('series.regularsCount', { count: regulars.length })}
            >
              {regulars.slice(0, 8).map((regular) => {
                const name = [regular.user?.firstName, regular.user?.lastName]
                  .filter(Boolean)
                  .join(' ')
                  .trim();
                return (
                  <li key={regular.user?.id ?? name} className="relative">
                    {regular.user?.avatar ? (
                      <img
                        src={regular.user.avatar}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 rounded-full object-cover ring-2 ring-white/60"
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-semibold ring-2 ring-white/60"
                        aria-hidden
                      >
                        {name ? [...name][0].toLocaleUpperCase('und') : '?'}
                      </span>
                    )}
                    {regular.confirmedForNext && (
                      <span
                        className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 ring-2 ring-primary-700"
                        aria-hidden
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                    <span className="sr-only">
                      {regular.confirmedForNext
                        ? t('series.confirmedAria', { name })
                        : t('series.notConfirmedAria', { name })}
                    </span>
                  </li>
                );
              })}
              {regulars.length > 8 && (
                <li className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/25 px-2 text-xs font-medium">
                  {`+${regulars.length - 8}`}
                </li>
              )}
            </ul>
          )}
          <p className="sr-only">
            {t('series.confirmedOf', {
              confirmed: confirmedRegulars,
              count: regulars.length,
            })}
          </p>
        </div>
      </motion.header>

      {/* Stats band */}
      <StatTileRow className="mt-3">
        <StatTile
          label={t('series.statGames')}
          icon={CalendarDays}
          value={<CountUpNumber value={stats.games} />}
        />
        <StatTile
          label={t('series.statWinRate')}
          icon={Percent}
          tone={stats.winRate !== null && stats.winRate >= 50 ? 'success' : 'neutral'}
          value={
            stats.winRate === null ? (
              t('series.statNoData')
            ) : (
              <CountUpNumber value={stats.winRate} format={(n) => `${Math.round(n)}%`} />
            )
          }
        />
        <StatTile
          label={t('series.statStreak')}
          icon={Flame}
          hint={t('series.statStreakHint')}
          value={<CountUpNumber value={stats.streakWeeks} />}
        />
      </StatTileRow>

      {/* Owner actions */}
      {series.isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenChat}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gray-100 px-3 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            {t('series.openChat')}
          </button>
          {!isEnded && (
            <button
              type="button"
              onClick={() => setEndOpen(true)}
              className="min-h-[44px] rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              {t('series.endSeries')}
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4">
        <SegmentedSwitch
          layoutId="series-page-tabs"
          ariaLabel={t('series.pageTitle')}
          fullWidth
          size="sm"
          showOnlyActiveTabText={false}
          activeId={tab}
          onChange={(id) => setTab(id as SeriesTab)}
          tabs={[
            { id: 'upcoming', label: t('series.tabUpcoming') },
            { id: 'history', label: t('series.tabHistory') },
            { id: 'regulars', label: t('series.tabRegulars') },
          ]}
        />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {tab === 'upcoming' && (
          <>
            {skippedUpcoming.map((skip) => (
              <div
                key={`skip-${skip.occurrenceDate}`}
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2 opacity-70 dark:border-gray-600 dark:bg-gray-800/40"
              >
                <span className="truncate text-sm text-gray-600 dark:text-gray-300">
                  {t('series.skippedRow', {
                    date: formatDayKey(skip.occurrenceDate, locale),
                  })}
                </span>
                {series.isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleUndoSkip(skip.occurrenceDate)}
                    className="min-h-[44px] shrink-0 rounded-lg px-2 text-sm font-semibold text-primary-700 dark:text-primary-300"
                  >
                    {t('series.undo')}
                  </button>
                )}
              </div>
            ))}

            {(upcoming as Game[]).slice(0, 4).map((game) => (
              <GameCard
                key={game.id}
                game={game}
                user={currentUser}
                onClick={() => navigate(`/games/${game.id}`)}
              />
            ))}

            {plannedDayKeys.map((dayKey) => (
              <div
                key={`planned-${dayKey}`}
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <span className="truncate text-sm text-gray-500 dark:text-gray-400">
                  {t('series.plannedRow', { date: formatDayKey(dayKey, locale) })}
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {t('series.plannedHint')}
                </span>
              </div>
            ))}

            {upcoming.length === 0 && plannedDayKeys.length === 0 && skippedUpcoming.length === 0 && (
              <EmptyStateCard
                icon={CalendarDays}
                title={t('series.emptyUpcomingTitle')}
                description={t('series.emptyUpcomingDescription', { days: series.horizonDays })}
              />
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {(past as Game[]).map((game) => (
              <GameCard
                key={game.id}
                game={game}
                user={currentUser}
                onClick={() => navigate(`/games/${game.id}`)}
              />
            ))}
            {past.length === 0 && (
              <EmptyStateCard
                icon={Trophy}
                title={t('series.emptyHistoryTitle')}
                description={
                  nextOccurrence
                    ? t('series.emptyHistoryDescription', {
                        date: formatShortDate(nextOccurrence.startTime, { locale }),
                      })
                    : t('series.emptyHistoryDescriptionNoDate')
                }
              />
            )}
          </>
        )}

        {tab === 'regulars' && (
          <>
            {regulars.length === 0 ? (
              <EmptyStateCard
                icon={Repeat}
                title={t('series.emptyRegularsTitle')}
                description={t('series.emptyRegularsDescription')}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {regulars.map((regular) => (
                  <RegularRow
                    key={regular.user?.id ?? regular.addedAt}
                    regular={regular}
                    action={seriesRegularAction({
                      isOwner: series.isOwner,
                      isEnded,
                      viewerUserId: currentUser?.id,
                      regularUserId: regular.user?.id,
                    })}
                    onRemove={(userId) => void handleRemoveRegular(userId)}
                    onLeave={() => setLeaveOpen(true)}
                  />
                ))}
              </ul>
            )}

            {series.isOwner && !isEnded && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setAddOpen((open) => !open)}
                  aria-expanded={addOpen}
                  className="min-h-[44px] w-full rounded-xl border border-dashed border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t('series.addRegular')}
                </button>
                {addOpen && (
                  <div className="mt-2">
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('series.addRegularHint')}
                    </p>
                    {addCandidates.length === 0 ? (
                      <p className="rounded-xl bg-white/70 p-3 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
                        {t('series.addRegularEmpty')}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {addCandidates.map((candidate) => (
                          <CandidateRow
                            key={candidate.id}
                            user={candidate}
                            busy={addingUserId === candidate.id}
                            onAdd={(userId) => void handleAddRegular(userId)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeaveRegulars}
        title={t('series.leaveRegularsTitle')}
        message={t('series.leaveRegularsBody')}
        confirmText={t('series.leaveRegularsConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={leaving}
      />

      <ConfirmationModal
        isOpen={endOpen}
        onClose={() => setEndOpen(false)}
        onConfirm={handleEndSeries}
        title={t('series.endSeriesTitle')}
        message={t('series.endSeriesBody')}
        confirmText={t('series.endSeriesConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={ending}
      />
    </div>
  );
};
