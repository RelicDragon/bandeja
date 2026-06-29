import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, CalendarDays, ChevronDown, Crosshair, Handshake, HelpCircle, MapPin, ShieldAlert, TrendingDown, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type {
  PerformanceRelationshipEntry,
  PerformanceRelationshipGame,
  StreakResult,
  UserPerformanceInsights,
} from '@/api/users';
import { formatDate } from '@/utils/dateFormat';
import { buildUrl } from '@/utils/urlSchema';

interface ProfilePerformanceInsightsProps {
  insights?: UserPerformanceInsights;
  darkBgClass?: string;
  onOpenGame?: () => void;
}

type RelationshipRankingMode = 'formulae' | 'rating' | 'games';
type RelationshipCardKey = 'bestPartner' | 'worstPartner' | 'favoriteTarget' | 'nemesis';

const relationshipRankingModes: Array<{ mode: RelationshipRankingMode; labelKey: string }> = [
  { mode: 'formulae', labelKey: 'playerCard.relationshipRankingFormulae' },
  { mode: 'rating', labelKey: 'playerCard.relationshipRankingRating' },
  { mode: 'games', labelKey: 'playerCard.relationshipRankingGames' },
];

const streakClasses: Record<StreakResult, string> = {
  win: 'bg-green-500 dark:bg-green-400 border-green-600 dark:border-green-300',
  loss: 'bg-red-500 dark:bg-red-400 border-red-600 dark:border-red-300',
  tie: 'bg-yellow-400 dark:bg-yellow-300 border-yellow-500 dark:border-yellow-200',
};

const streakLabelKey: Record<StreakResult, string> = {
  win: 'playerCard.streakWin',
  loss: 'playerCard.streakLoss',
  tie: 'playerCard.streakTie',
};

const currentStreakKey: Record<StreakResult, string> = {
  win: 'playerCard.currentStreakWin',
  loss: 'playerCard.currentStreakLoss',
  tie: 'playerCard.currentStreakTie',
};

function getPlayerName(entry: PerformanceRelationshipEntry, fallback: string) {
  const name = `${entry.user.firstName ?? ''} ${entry.user.lastName ?? ''}`.trim();
  return name || fallback;
}

function getPlayerNameLines(entry: PerformanceRelationshipEntry, fallback: string) {
  const firstName = entry.user.firstName?.trim();
  const lastName = entry.user.lastName?.trim();

  if (firstName && lastName) return [firstName, lastName];

  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return [name || fallback];
}

function getInitials(entry: PerformanceRelationshipEntry) {
  const initials = `${entry.user.firstName?.[0] ?? ''}${entry.user.lastName?.[0] ?? ''}`.toUpperCase();
  return initials || '?';
}

function formatRatingNetChange(change: number) {
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
}

function getRatingNetChangeClass(change: number) {
  if (change > 0) {
    return 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/60';
  }
  if (change < 0) {
    return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/60';
  }
  return 'bg-gray-50 text-gray-600 ring-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:ring-gray-700';
}

function getGameLocation(game: PerformanceRelationshipGame) {
  const parts = [game.court?.name, game.club?.name].filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

export const ProfilePerformanceInsights = ({
  insights,
  darkBgClass = 'dark:bg-gray-700/50',
  onOpenGame,
}: ProfilePerformanceInsightsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showRelationshipInfo, setShowRelationshipInfo] = useState(false);
  const [relationshipRankingMode, setRelationshipRankingMode] =
    useState<RelationshipRankingMode>('formulae');
  const [displayedRelationshipRankingMode, setDisplayedRelationshipRankingMode] =
    useState<RelationshipRankingMode>('formulae');
  const [relationshipCardsVisible, setRelationshipCardsVisible] = useState(true);
  const [expandedRelationshipKey, setExpandedRelationshipKey] = useState<RelationshipCardKey | null>(null);
  const relationshipHideTimeoutRef = useRef<number | null>(null);
  const relationshipRevealTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (relationshipHideTimeoutRef.current != null) {
      window.clearTimeout(relationshipHideTimeoutRef.current);
    }
    if (relationshipRevealTimeoutRef.current != null) {
      window.clearTimeout(relationshipRevealTimeoutRef.current);
    }
  }, []);

  if (!insights) return null;

  const recentGames = insights.streaks.recentGames.slice(-10);
  const emptySlots = Math.max(0, 10 - recentGames.length);
  const hasStreakData = recentGames.length > 0 || !!insights.streaks.current;

  const relationshipSource = insights.relationships;
  const bestPartner = displayedRelationshipRankingMode === 'rating'
    ? relationshipSource.bestPartnerByRating ?? relationshipSource.bestPartner
    : displayedRelationshipRankingMode === 'games'
      ? relationshipSource.bestPartnerByCount ?? relationshipSource.bestPartner
      : relationshipSource.bestPartner;
  const worstPartner = displayedRelationshipRankingMode === 'rating'
    ? relationshipSource.worstPartnerByRating ?? relationshipSource.worstPartner
    : displayedRelationshipRankingMode === 'games'
      ? relationshipSource.worstPartnerByCount ?? relationshipSource.worstPartner
      : relationshipSource.worstPartner;
  const favoriteTarget = displayedRelationshipRankingMode === 'rating'
    ? relationshipSource.favoriteTargetByRating ?? relationshipSource.favoriteTarget
    : displayedRelationshipRankingMode === 'games'
      ? relationshipSource.favoriteTargetByCount ?? relationshipSource.favoriteTarget
      : relationshipSource.favoriteTarget;
  const nemesis = displayedRelationshipRankingMode === 'rating'
    ? relationshipSource.nemesisByRating ?? relationshipSource.nemesis
    : displayedRelationshipRankingMode === 'games'
      ? relationshipSource.nemesisByCount ?? relationshipSource.nemesis
      : relationshipSource.nemesis;

  const relationships = [
    {
      key: 'bestPartner',
      label: t('playerCard.bestPartner'),
      icon: Trophy,
      entry: bestPartner,
      tone: 'text-green-600 dark:text-green-400',
    },
    {
      key: 'worstPartner',
      label: t('playerCard.worstPartner'),
      icon: TrendingDown,
      entry: worstPartner,
      tone: 'text-red-600 dark:text-red-400',
    },
    {
      key: 'favoriteTarget',
      label: t('playerCard.favoriteTarget'),
      icon: Crosshair,
      entry: favoriteTarget,
      tone: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'nemesis',
      label: t('playerCard.nemesis'),
      icon: ShieldAlert,
      entry: nemesis,
      tone: 'text-purple-600 dark:text-purple-400',
    },
  ].filter((item) => item.entry);
  const hasRelationshipData = relationships.length > 0;
  const relationshipFormulaLines = [
    t('playerCard.relationshipFormulaMatches'),
    t('playerCard.relationshipFormulaRate'),
    t('playerCard.relationshipFormulaConfidence'),
    t('playerCard.relationshipFormulaRatingSignal'),
    t('playerCard.relationshipFormulaRecordSignal'),
    t('playerCard.relationshipFormulaScore'),
  ];

  const currentStreak = insights.streaks.current
    ? t(`${currentStreakKey[insights.streaks.current.result]}_${insights.streaks.current.count === 1 ? 'one' : 'other'}`, {
        count: insights.streaks.current.count,
      })
    : t('playerCard.noStreakYet');

  const selectRelationshipRankingMode = (mode: RelationshipRankingMode) => {
    if (mode === relationshipRankingMode) return;
    setRelationshipRankingMode(mode);

    if (relationshipHideTimeoutRef.current != null) {
      window.clearTimeout(relationshipHideTimeoutRef.current);
    }
    if (relationshipRevealTimeoutRef.current != null) {
      window.clearTimeout(relationshipRevealTimeoutRef.current);
    }

    setRelationshipCardsVisible(false);
    setExpandedRelationshipKey(null);
    relationshipHideTimeoutRef.current = window.setTimeout(() => {
      setDisplayedRelationshipRankingMode(mode);
      relationshipRevealTimeoutRef.current = window.setTimeout(() => {
        setRelationshipCardsVisible(true);
      }, 30);
    }, 150);
  };

  const openRelationshipGame = (game: PerformanceRelationshipGame) => {
    onOpenGame?.();
    navigate(buildUrl('game', { id: game.id }));
  };

  const getRelationshipGameTitle = (game: PerformanceRelationshipGame) => {
    if (game.name?.trim()) return game.name.trim();
    const gameType = t(`games.gameTypes.${game.gameType}`, { defaultValue: game.gameType });
    const entityType = t(`games.entityTypes.${game.entityType}`, { defaultValue: game.entityType });
    return game.gameType === 'CLASSIC' ? entityType : gameType;
  };

  return (
    <div className="space-y-3">
      <section className={`rounded-xl bg-gray-100 ${darkBgClass} border border-gray-200/60 dark:border-gray-600/50 p-4`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('playerCard.streaks')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.currentStreak')}</p>
          </div>
          <div className="text-right text-sm font-semibold text-gray-900 dark:text-white">
            {currentStreak}
          </div>
        </div>

        {hasStreakData ? (
          <>
            <div className="flex items-center gap-1.5" aria-label={t('playerCard.last10Games')}>
              {Array.from({ length: emptySlots }).map((_, index) => (
                <span
                  key={`empty-${index}`}
                  className="h-5 w-5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-800/40"
                  aria-hidden
                />
              ))}
              {recentGames.map((result, index) => (
                <span
                  key={`${result}-${index}`}
                  className={`h-5 w-5 rounded-full border shadow-sm ${streakClasses[result]}`}
                  title={t(streakLabelKey[result])}
                  aria-label={t(streakLabelKey[result])}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/70 dark:bg-gray-800/40 px-3 py-2">
                <div className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                  {insights.streaks.longestWin}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.longestWinStreak')}</div>
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-gray-800/40 px-3 py-2">
                <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                  {insights.streaks.longestLoss}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.longestLossStreak')}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('playerCard.noStreakYet')}</div>
        )}
      </section>

      <section className={`relative rounded-xl bg-gray-100 ${darkBgClass} border border-gray-200/60 dark:border-gray-600/50 p-4`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Handshake size={16} className="shrink-0 text-gray-500 dark:text-gray-400" />
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{t('playerCard.partners')}</h3>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/75 text-gray-500 shadow-sm transition-all duration-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-gray-600/70 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-950/40 dark:hover:text-primary-300 dark:focus-visible:ring-offset-gray-800"
            aria-label={t('playerCard.relationshipInfoButton')}
            aria-expanded={showRelationshipInfo}
            aria-controls="profile-relationship-info"
            onClick={() => setShowRelationshipInfo((value) => !value)}
          >
            <HelpCircle size={17} aria-hidden />
          </button>
        </div>
        <div
          id="profile-relationship-info"
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
            showRelationshipInfo ? 'mb-3 max-h-96 opacity-100' : 'mb-0 max-h-0 opacity-0'
          }`}
        >
          <div className="rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs leading-5 text-gray-600 dark:border-primary-900/50 dark:bg-primary-950/25 dark:text-gray-300">
            <p>{t('playerCard.relationshipInfo')}</p>
            <div className="mt-2 space-y-1 rounded-md bg-white/60 px-2 py-2 font-mono text-[11px] leading-4 text-gray-700 dark:bg-gray-900/30 dark:text-gray-200">
              {relationshipFormulaLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <p className="mt-2">{t('playerCard.relationshipFormulaPick')}</p>
          </div>
        </div>
        <div
          className="mb-3 grid grid-cols-3 rounded-lg bg-white/70 p-1 shadow-inner ring-1 ring-gray-200/70 dark:bg-gray-800/40 dark:ring-gray-700/70"
          aria-label={t('playerCard.relationshipRankingMode')}
          role="radiogroup"
        >
          {relationshipRankingModes.map(({ mode, labelKey }) => {
            const selected = relationshipRankingMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`min-w-0 rounded-md px-2 py-1.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  selected
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/70 dark:hover:text-white'
                }`}
                role="radio"
                aria-checked={selected}
                onClick={() => selectRelationshipRankingMode(mode)}
              >
                <span className="block truncate">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>

        {hasRelationshipData ? (
          <motion.div
            layout
            className={`grid grid-cols-1 gap-2 transition-all duration-200 ease-out motion-reduce:transition-none sm:grid-cols-2 ${
              relationshipCardsVisible
                ? 'translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none translate-y-2 scale-[0.98] opacity-0'
            }`}
          >
            {relationships.map(({ key, label, icon: Icon, entry, tone }) => {
              if (!entry) return null;
              const ratingNetChange = formatRatingNetChange(entry.ratingNetChange);
              const relationshipKey = key as RelationshipCardKey;
              const expanded = expandedRelationshipKey === relationshipKey;
              const games = entry.games ?? [];
              const panelId = `profile-relationship-games-${relationshipKey}`;
              return (
                <motion.div
                  key={key}
                  layout
                  className={`overflow-hidden rounded-lg bg-white/70 shadow-sm ring-1 transition-colors duration-200 dark:bg-gray-800/40 ${
                    expanded
                      ? 'ring-primary-200 dark:ring-primary-800/70'
                      : 'ring-transparent hover:bg-white/90 dark:hover:bg-gray-800/65'
                  }`}
                >
                  <button
                    type="button"
                    className="w-full p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setExpandedRelationshipKey((current) => current === relationshipKey ? null : relationshipKey)}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon size={14} className={tone} />
                        <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
                      </div>
                      <ChevronDown
                        size={15}
                        className={`shrink-0 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {entry.user.avatar ? (
                        <img
                          src={entry.user.avatar}
                          alt={getPlayerName(entry, t('playerCard.shareProfileFallbackName'))}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                          {getInitials(entry)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="min-h-[2.3rem] text-sm font-semibold leading-[1.15rem] text-gray-900 dark:text-white">
                          {getPlayerNameLines(entry, t('playerCard.shareProfileFallbackName')).map((line, index) => (
                            <span key={`${line}-${index}`} className="block truncate">
                              {line}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            {entry.wins}{t('playerCard.winsShort')}
                          </span>
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {entry.losses}{t('playerCard.lossesShort')}
                          </span>
                          <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                            {entry.ties}{t('playerCard.tiesShort')}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">·</span>
                          <span>{entry.winRate}%</span>
                          <span className="text-gray-400 dark:text-gray-500">·</span>
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 ${getRatingNetChangeClass(entry.ratingNetChange)}`}
                            title={t('playerCard.relationshipRatingNetChange', { change: ratingNetChange })}
                            aria-label={t('playerCard.relationshipRatingNetChange', { change: ratingNetChange })}
                          >
                            Δ {ratingNetChange}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        id={panelId}
                        key={`${key}-games`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 border-t border-gray-200/70 bg-white/55 p-2 dark:border-gray-700/70 dark:bg-gray-900/20">
                          {games.length > 0 ? games.map((game) => {
                            const location = getGameLocation(game);
                            return (
                              <button
                                key={game.id}
                                type="button"
                                className="group flex w-full items-center gap-2 rounded-lg border border-gray-200/70 bg-white/80 px-2.5 py-2 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/70 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700/70 dark:bg-gray-800/70 dark:hover:border-primary-800 dark:hover:bg-primary-950/25"
                                onClick={() => openRelationshipGame(game)}
                              >
                                <div className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700/80 dark:text-gray-300">
                                  <CalendarDays size={13} className="mb-0.5" aria-hidden />
                                  <span>{formatDate(game.startTime, 'MMM d')}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                    {getRelationshipGameTitle(game)}
                                  </div>
                                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                    <MapPin size={12} className="shrink-0" aria-hidden />
                                    <span className="truncate">{location || t(`games.entityTypes.${game.entityType}`, { defaultValue: game.entityType })}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                      {t('games.resultsAvailable')}
                                    </span>
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                      game.affectsRating
                                        ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700/70 dark:text-gray-300'
                                    }`}
                                    >
                                      {game.affectsRating ? t('games.Rating') : t('games.noRating')}
                                    </span>
                                  </div>
                                </div>
                                <ArrowUpRight size={16} className="shrink-0 text-gray-400 transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-300" aria-hidden />
                              </button>
                            );
                          }) : (
                            <div className="rounded-lg bg-white/70 px-3 py-4 text-center text-sm text-gray-500 dark:bg-gray-800/40 dark:text-gray-400">
                              {t('profile.noSharedGames', { defaultValue: 'No shared finished games yet' })}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('playerCard.noPartnerStatsYet')}</div>
        )}
      </section>
    </div>
  );
};
