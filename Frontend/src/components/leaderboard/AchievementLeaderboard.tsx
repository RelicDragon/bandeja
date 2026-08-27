import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  RotateCcw,
  Sparkles,
  Trophy as TrophyIcon,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_LEADERBOARD_FAMILIES,
  achievementLeaderboardFamilyForRuleKind,
  type AchievementDefinition,
  type AchievementLeaderboardFamily,
} from '@shared/achievements';
import type { AchievementLeaderboardEntry } from '@/api/ranking';
import { AdSlot } from '@/components/sponsorSlots';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { LeaderboardGenderFilter } from '@/components/leaderboard/LeaderboardGenderFilter';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import { definitionBetterScore } from '@/components/trophies/cabinetGrouping';
import {
  stackFamilyLabelKey,
  stackPileFace,
} from '@/components/trophies/trophyStackGeometry';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { useRegisterAdSportContext } from '@/hooks/useAdPlacements';
import { useAchievementLeaderboardQuery } from '@/queries/useAchievementLeaderboardQuery';
import { AD_PLACEMENTS } from '@/shared/adPlacements';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { scrollAppToTop } from '@/utils/appScroll';
import type { TrophyCabinetEntryView } from '@/types/trophies';

type AchievementFamilyCard = {
  family: AchievementLeaderboardFamily;
  definitions: AchievementDefinition[];
  face: AchievementDefinition;
  labelKey: string;
};

const FAMILY_UNIT: Record<AchievementLeaderboardFamily, string> = {
  HABIT_VOLUME: 'games',
  HABIT_WINS: 'wins',
  HABIT_STREAK: 'weeks',
  PODIUM: 'podiums',
  HABIT_ORGANIZE_GAME: 'hostedGames',
  HABIT_ORGANIZE_TOURNAMENT: 'hostedTournaments',
  HABIT_ORGANIZE_BAR: 'hostedBars',
  HABIT_GIANT_KILLER: 'upsets',
  HABIT_DYNAMIC_DUO: 'partnerWins',
  HABIT_OPEN_COURT: 'partners',
  HABIT_TIE_BREAK: 'tieBreaks',
};

function buildFamilyCards(
  cabinet: readonly TrophyCabinetEntryView[] | undefined,
): AchievementFamilyCard[] {
  return ACHIEVEMENT_LEADERBOARD_FAMILIES.flatMap((family) => {
    const definitions = ACHIEVEMENT_CATALOG.filter(
      (definition) =>
        achievementLeaderboardFamilyForRuleKind(definition.ruleKind) === family,
    );
    if (definitions.length === 0) return [];
    const cabinetFamily = (cabinet ?? []).filter(
      (entry) =>
        achievementLeaderboardFamilyForRuleKind(entry.definition.ruleKind) === family,
    );
    const cabinetFaceId = stackPileFace(cabinetFamily)?.definition.id;
    const face =
      definitions.find((definition) => definition.id === cabinetFaceId) ??
      definitions.reduce((next, definition) =>
        definitionBetterScore(definition) < definitionBetterScore(next)
          ? definition
          : next,
      );
    return [{
      family,
      definitions: [...definitions],
      face,
      labelKey: stackFamilyLabelKey(family),
    }];
  });
}

function playerName(
  entry: AchievementLeaderboardEntry,
  fallback: string,
): string {
  const name = [entry.firstName, entry.lastName].filter(Boolean).join(' ').trim();
  return name || fallback;
}

export function AchievementLeaderboard() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { translateCity } = useTranslatedGeo();
  const user = useAuthStore((state) => state.user);
  const {
    leaderboardScope,
    leaderboardGender,
    setLeaderboardGender,
  } = useHeaderStore();
  const [selectedFamily, setSelectedFamily] =
    useState<AchievementLeaderboardFamily | null>(null);
  const familyCards = useMemo(
    () => buildFamilyCards(user?.trophies?.cabinet),
    [user?.trophies?.cabinet],
  );
  const selectedCard = familyCards.find((card) => card.family === selectedFamily) ?? null;

  useRegisterAdSportContext(
    AD_PLACEMENTS.LEADERBOARD_BANNER,
    getViewerPrimarySport(user),
  );

  useEffect(() => {
    scrollAppToTop('auto');
  }, [selectedFamily]);

  const cityName = user?.currentCity
    ? translateCity(user.currentCity.id, user.currentCity.name, user.currentCity.country)
    : t('profile.global', { defaultValue: 'Global' });
  const scopeLabel = leaderboardScope === 'city'
    ? t('trophies.leaderboard.scopeCity', {
        city: cityName,
        defaultValue: `Top in ${cityName}`,
      })
    : t('trophies.leaderboard.scopeGlobal', { defaultValue: 'Global leaders' });

  const query = useAchievementLeaderboardQuery({
    family: selectedFamily,
    scope: leaderboardScope,
    gender: leaderboardGender,
  });
  const { refetch } = query;
  const retryLeaderboard = useCallback(() => {
    void refetch();
  }, [refetch]);

  const formatProgress = (
    family: AchievementLeaderboardFamily,
    progress: number,
  ) =>
    t(`trophies.leaderboard.units.${FAMILY_UNIT[family]}`, {
      count: progress,
      defaultValue: `${progress}`,
    });

  return (
    <div className="min-w-0 space-y-4">
      <AdSlot placement={AD_PLACEMENTS.LEADERBOARD_BANNER} className="w-full min-w-0" />

      {selectedCard ? (
        <motion.div
          key={selectedCard.family}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <button
            type="button"
            onClick={() => setSelectedFamily(null)}
            data-testid="achievement-family-back"
            className="inline-flex min-h-10 items-center gap-2 rounded-full px-1.5 pe-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
              <ArrowLeft size={15} />
            </span>
            {t('trophies.leaderboard.allAchievements', {
              defaultValue: 'All achievements',
            })}
          </button>

          <section className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-700/30 dark:from-amber-950/35 dark:via-gray-900 dark:to-orange-950/25">
            <div
              aria-hidden
              className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/10"
            />
            <div className="relative flex items-center gap-4">
              <TrophyRarityFrame
                rarity={selectedCard.face.rarity}
                className="h-[5.25rem] w-[5.25rem] shrink-0 rounded-[1.35rem]"
              >
                <TrophyArt
                  artKey={selectedCard.face.artKey}
                  className="h-[4.25rem] w-[4.5rem]"
                />
              </TrophyRarityFrame>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
                    <Sparkles size={11} />
                    {t('trophies.leaderboard.leaders', { defaultValue: 'Leaders' })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    <MapPin size={11} />
                    {scopeLabel}
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-gray-950 dark:text-white">
                  {t(selectedCard.labelKey)}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  {t(selectedCard.face.descriptionKey)}
                </p>
              </div>
            </div>
          </section>

          <LeaderboardGenderFilter
            value={leaderboardGender}
            onChange={setLeaderboardGender}
          />

          <AchievementRankingContent
            family={selectedCard.family}
            data={query.data}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            isError={query.isError}
            error={query.error}
            onRetry={retryLeaderboard}
            formatProgress={formatProgress}
          />
        </motion.div>
      ) : (
        <motion.div
          key="family-picker"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-950 via-slate-900 to-amber-950 px-5 py-5 text-white shadow-lg shadow-gray-900/10 dark:from-black dark:via-gray-950 dark:to-amber-950">
            <div
              aria-hidden
              className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-amber-400/20 blur-3xl"
            />
            <div className="relative flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <TrophyIcon size={23} className="text-amber-300" />
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  {t('trophies.leaderboard.title', {
                    defaultValue: 'Achievement leaders',
                  })}
                </h2>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-gray-300">
                  {t('trophies.leaderboard.choose', {
                    defaultValue:
                      'Choose an achievement to discover who has made the most progress.',
                  })}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-gray-200 ring-1 ring-white/10">
                  <MapPin size={12} className="text-amber-300" />
                  {scopeLabel}
                </span>
              </div>
            </div>
          </section>

          <div
            data-testid="achievement-family-picker"
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            {familyCards.map((card, index) => (
              <motion.button
                key={card.family}
                type="button"
                onClick={() => setSelectedFamily(card.family)}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.25) }}
                className="group relative min-h-48 overflow-hidden rounded-3xl border border-gray-200/90 bg-gradient-to-b from-white to-gray-50 p-3 text-start shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-white/10 dark:from-gray-900 dark:to-gray-950 dark:hover:border-amber-500/50 dark:focus-visible:ring-offset-gray-950"
              >
                <div
                  aria-hidden
                  className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-amber-200/30 blur-2xl transition group-hover:bg-amber-300/40 dark:bg-amber-500/5 dark:group-hover:bg-amber-500/10"
                />
                <div className="relative flex h-full flex-col">
                  <div className="mb-2.5 flex items-start justify-between">
                    <TrophyRarityFrame
                      rarity={card.face.rarity}
                      className="h-[4.5rem] w-[4.5rem] rounded-2xl"
                    >
                      <TrophyArt
                        artKey={card.face.artKey}
                        className="h-14 w-16 transition-transform duration-200 group-hover:scale-105"
                      />
                    </TrophyRarityFrame>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition group-hover:bg-amber-100 group-hover:text-amber-800 dark:bg-white/10 dark:text-gray-400 dark:group-hover:bg-amber-400/15 dark:group-hover:text-amber-300">
                      <ChevronRight size={15} />
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold tracking-tight text-gray-950 dark:text-white">
                    {t(card.labelKey)}
                  </h3>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {t(card.face.descriptionKey)}
                  </p>
                  <span className="mt-auto pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">
                    {t('trophies.leaderboard.viewLeaders', {
                      defaultValue: 'View leaders',
                    })}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function AchievementRankingContent({
  family,
  data,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
  formatProgress,
}: {
  family: AchievementLeaderboardFamily;
  data: {
    leaderboard: AchievementLeaderboardEntry[];
    viewerEntry: AchievementLeaderboardEntry | null;
    total: number;
    limit: number;
    isTruncated: boolean;
  } | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  formatProgress: (family: AchievementLeaderboardFamily, progress: number) => string;
}) {
  const { t } = useTranslation();
  const viewerId = useAuthStore((state) => state.user?.id);
  const playerFallback = t('trophies.leaderboard.playerFallback', {
    defaultValue: 'Player',
  });
  const rankingError = isAxiosError<{
    code?: string;
    retryAfterSeconds?: number;
  }>(error)
    ? error.response?.data
    : undefined;
  const statsAreRefreshing =
    rankingError?.code === 'ranking.achievementStatsRefreshing';
  const statsRepairFailed =
    rankingError?.code === 'ranking.achievementStatsRepairFailed';
  const retryAfterSeconds =
    typeof rankingError?.retryAfterSeconds === 'number' &&
    Number.isFinite(rankingError.retryAfterSeconds)
      ? Math.max(1, rankingError.retryAfterSeconds)
      : null;

  useEffect(() => {
    if (!statsRepairFailed || retryAfterSeconds == null) return;
    const timer = window.setTimeout(onRetry, retryAfterSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [onRetry, retryAfterSeconds, statsRepairFailed]);

  if (isLoading) return <AchievementRankingSkeleton />;

  if (isError) {
    const retryTime =
      retryAfterSeconds == null
        ? null
        : new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(Date.now() + retryAfterSeconds * 1000));
    return (
      <div
        className={`rounded-3xl border px-5 py-8 text-center ${
          statsAreRefreshing
            ? 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/25'
            : 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/25'
        }`}
      >
        <p className={`text-sm font-semibold ${
          statsAreRefreshing
            ? 'text-amber-900 dark:text-amber-200'
            : 'text-red-800 dark:text-red-200'
        }`}>
          {statsAreRefreshing
            ? t('trophies.leaderboard.refreshingStats', {
                defaultValue:
                  'Achievement rankings are catching up. This usually takes only a moment.',
              })
            : statsRepairFailed
              ? t('trophies.leaderboard.statsMaintenance', {
                  defaultValue:
                    'These rankings need maintenance. Please try again later.',
                })
            : t('trophies.leaderboard.loadError', {
                defaultValue: 'Could not load these leaders.',
              })}
        </p>
        {statsRepairFailed && retryTime ? (
          <span className="mt-3 inline-flex min-h-10 items-center rounded-full bg-red-100 px-4 text-xs font-bold text-red-800 dark:bg-red-400/10 dark:text-red-200">
            {t('trophies.leaderboard.statsMaintenanceRetryAt', {
              time: retryTime,
              defaultValue: `Automatically retrying at ${retryTime}`,
            })}
          </span>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white transition ${
              statsAreRefreshing
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <RotateCcw size={14} />
            {t('common.retry', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    );
  }

  const leaderboard = data?.leaderboard ?? [];
  if (leaderboard.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50/80 px-5 py-10 text-center dark:border-gray-700 dark:bg-gray-900/50">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm dark:bg-white/10 dark:text-amber-300">
          <TrophyIcon size={22} />
        </span>
        <h3 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">
          {t('trophies.leaderboard.emptyTitle', { defaultValue: 'The top is open' })}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {t('trophies.leaderboard.emptyHint', {
            defaultValue: 'No one has progress in this achievement yet.',
          })}
        </p>
      </div>
    );
  }

  const podium = leaderboard.slice(0, 3);
  const hasPodiumTies =
    new Set(podium.map((entry) => entry.rank)).size !== podium.length;
  const podiumDisplay = hasPodiumTies
    ? podium
    : [podium[1], podium[0], podium[2]];
  const remaining = leaderboard.slice(3);
  const viewerInTop = leaderboard.some((entry) => entry.id === viewerId);

  return (
    <div
      className={`space-y-4 transition-opacity ${isFetching ? 'opacity-65' : 'opacity-100'}`}
      aria-busy={isFetching}
    >
      {data?.viewerEntry && (
        <section className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50/80 px-3.5 py-3 dark:border-primary-800/70 dark:bg-primary-950/30">
          <PlayerAvatar
            player={data.viewerEntry}
            extrasmall
            showName={false}
            fullHideName
            isCurrentUser
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-600 dark:text-primary-300">
              {t('trophies.leaderboard.yourStanding', {
                defaultValue: 'Your standing',
              })}
            </p>
            <p className="truncate text-sm font-bold text-gray-950 dark:text-white">
              {t('profile.myPlace', {
                rank: data.viewerEntry.rank,
                defaultValue: `My place: ${data.viewerEntry.rank}`,
              })}
            </p>
          </div>
          <span className="shrink-0 rounded-xl bg-white px-2.5 py-1.5 text-xs font-black tabular-nums text-primary-700 shadow-sm dark:bg-white/10 dark:text-primary-200">
            {formatProgress(family, data.viewerEntry.progress)}
          </span>
        </section>
      )}

      <section className="rounded-3xl border border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 p-3 shadow-sm dark:border-white/10 dark:from-gray-900 dark:to-gray-950">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <div>
            <h3 className="text-sm font-extrabold tracking-tight text-gray-950 dark:text-white">
              {t('trophies.leaderboard.topPlayers', { defaultValue: 'Top players' })}
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {t('trophies.leaderboard.rankedCount', {
                count: data?.total ?? leaderboard.length,
                defaultValue: `${data?.total ?? leaderboard.length} ranked`,
              })}
            </p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            <Users size={16} />
          </span>
        </div>

        <div className="grid min-h-44 grid-cols-3 items-end gap-2 rounded-2xl bg-gradient-to-b from-amber-50/70 to-transparent px-2 pb-3 pt-5 dark:from-amber-500/5">
          {podiumDisplay.map((entry, slotIndex) => {
            if (!entry) return <div key={`empty-${slotIndex}`} />;
            const isChampion = entry.rank === 1;
            const isCurrentUser = entry.id === viewerId;
            return (
              <div
                key={entry.id}
                className={`relative flex min-w-0 flex-col items-center rounded-2xl border px-1.5 pb-2.5 pt-3 text-center ${
                  isChampion
                    ? 'min-h-40 border-amber-300 bg-gradient-to-b from-amber-100 to-white shadow-md dark:border-amber-500/40 dark:from-amber-400/15 dark:to-gray-900'
                    : 'min-h-32 border-gray-200 bg-white/90 dark:border-white/10 dark:bg-white/5'
                } ${isCurrentUser ? 'ring-2 ring-primary-400/70' : ''}`}
              >
                <span
                  className={`absolute -top-3 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-black shadow-sm ${
                    isChampion
                      ? 'bg-amber-400 text-amber-950'
                      : entry.rank === 2
                        ? 'bg-slate-300 text-slate-800'
                        : 'bg-orange-300 text-orange-950'
                  }`}
                >
                  #{entry.rank}
                </span>
                <div className={isChampion ? 'mt-1' : ''}>
                  <PlayerAvatar
                    player={entry}
                    smallLayout={!isChampion}
                    showName={false}
                    fullHideName
                    isCurrentUser={isCurrentUser}
                  />
                </div>
                <p className="mt-2 line-clamp-2 w-full text-xs font-bold leading-tight text-gray-950 dark:text-white">
                  {playerName(entry, playerFallback)}
                </p>
                <p className="mt-auto pt-1.5 text-[10px] font-extrabold tabular-nums text-amber-800 dark:text-amber-300">
                  {formatProgress(family, entry.progress)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {remaining.length > 0 && (
        <section className="space-y-1.5">
          {remaining.map((entry) => {
            const isCurrentUser = entry.id === viewerId;
            return (
              <div
                key={entry.id}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 transition-colors ${
                  isCurrentUser
                    ? 'border-primary-200 bg-primary-50/70 dark:border-primary-800/70 dark:bg-primary-950/25'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 dark:border-white/5 dark:bg-gray-900/70 dark:hover:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <span className={`w-7 shrink-0 text-center text-xs font-black tabular-nums ${
                  isCurrentUser
                    ? 'text-primary-600 dark:text-primary-300'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {entry.rank}
                </span>
                <PlayerAvatar
                  player={entry}
                  extrasmall
                  showName={false}
                  fullHideName
                  isCurrentUser={isCurrentUser}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-gray-950 dark:text-white">
                    {playerName(entry, playerFallback)}
                    {isCurrentUser && (
                      <span className="ms-1 font-semibold text-primary-600 dark:text-primary-300">
                        ({t('profile.you')})
                      </span>
                    )}
                  </p>
                  {entry.verbalStatus && (
                    <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {entry.verbalStatus}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-black tabular-nums text-gray-800 dark:text-gray-100">
                  {formatProgress(family, entry.progress)}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {data?.isTruncated && (
        <p className="px-2 text-center text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          {t('trophies.leaderboard.topLimitHint', {
            count: data.leaderboard.length,
            total: data.total,
            defaultValue:
              `Showing ${data.leaderboard.length} of ${data.total} players. Equal progress shares the same rank.`,
          })}
          {!viewerInTop && data.viewerEntry
            ? ` ${t('trophies.leaderboard.yourStandingAbove', {
                defaultValue: 'Your standing appears above.',
              })}`
            : ''}
        </p>
      )}
    </div>
  );
}

function AchievementRankingSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-3"
      aria-label={t('trophies.leaderboard.loading', {
        defaultValue: 'Loading achievement leaders',
      })}
    >
      <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
      <div className="h-60 animate-pulse rounded-3xl bg-gray-100 dark:bg-white/10" />
      <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
      <div className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
    </div>
  );
}
