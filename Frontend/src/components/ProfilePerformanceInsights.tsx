import { memo, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Crosshair, Handshake, HelpCircle, ShieldAlert, TrendingDown, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  StreakResult,
  UserPerformanceInsights,
} from '@/api/users';
import { RelationshipRankDetail } from '@/components/profileInsights/RelationshipRankDetail';
import {
  formatRatingNetChange,
  getInitials,
  getPlayerName,
  getPlayerNameLines,
  getRatingNetChangeClass,
} from '@/components/profileInsights/relationshipDisplay';
import {
  clampRelationshipPlaceIndex,
  dedupeRelationshipCards,
  distinctRelationshipRankingModes,
  firstRankedEntry,
  resolveRelationshipsForMode,
  type RelationshipCardKey,
  type RelationshipPlaceIndex,
  type RelationshipRankingMode,
} from '@/utils/profileRelationshipRankings';

interface ProfilePerformanceInsightsProps {
  insights?: UserPerformanceInsights;
  darkBgClass?: string;
  onOpenGame?: () => void;
}

const relationshipRankingModeLabels: Record<RelationshipRankingMode, string> = {
  formulae: 'playerCard.relationshipRankingFormulae',
  rating: 'playerCard.relationshipRankingRating',
  games: 'playerCard.relationshipRankingGames',
};

const FORMULAE_ONLY_MODES: readonly RelationshipRankingMode[] = ['formulae'];

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

const ProfilePerformanceInsightsComponent = ({
  insights,
  darkBgClass = 'dark:bg-gray-700/50',
  onOpenGame,
}: ProfilePerformanceInsightsProps) => {
  const { t } = useTranslation();
  const streakInfoId = useId();
  const reduceMotion = useReducedMotion();
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  const [showRelationshipInfo, setShowRelationshipInfo] = useState(false);
  const [relationshipRankingMode, setRelationshipRankingMode] =
    useState<RelationshipRankingMode>('formulae');
  const [displayedRelationshipRankingMode, setDisplayedRelationshipRankingMode] =
    useState<RelationshipRankingMode>('formulae');
  const [relationshipCardsVisible, setRelationshipCardsVisible] = useState(true);
  const [selectedRelationshipKey, setSelectedRelationshipKey] = useState<RelationshipCardKey | null>(null);
  const [relationshipPlaceIndex, setRelationshipPlaceIndex] = useState<RelationshipPlaceIndex>(0);
  const relationshipHideTimeoutRef = useRef<number | null>(null);
  const relationshipRevealTimeoutRef = useRef<number | null>(null);

  const clearRelationshipTransitionTimers = () => {
    if (relationshipHideTimeoutRef.current != null) {
      window.clearTimeout(relationshipHideTimeoutRef.current);
      relationshipHideTimeoutRef.current = null;
    }
    if (relationshipRevealTimeoutRef.current != null) {
      window.clearTimeout(relationshipRevealTimeoutRef.current);
      relationshipRevealTimeoutRef.current = null;
    }
  };

  useEffect(() => () => {
    if (relationshipHideTimeoutRef.current != null) {
      window.clearTimeout(relationshipHideTimeoutRef.current);
    }
    if (relationshipRevealTimeoutRef.current != null) {
      window.clearTimeout(relationshipRevealTimeoutRef.current);
    }
  }, []);

  const availableRankingModes = insights
    ? distinctRelationshipRankingModes(insights.relationships)
    : FORMULAE_ONLY_MODES;
  const availableRankingModesKey = availableRankingModes.join(',');

  useEffect(() => {
    const modes = availableRankingModesKey.split(',') as RelationshipRankingMode[];
    if (modes.includes(relationshipRankingMode)) return;
    clearRelationshipTransitionTimers();
    setRelationshipRankingMode('formulae');
    setDisplayedRelationshipRankingMode('formulae');
    setRelationshipCardsVisible(true);
    setSelectedRelationshipKey(null);
    setRelationshipPlaceIndex(0);
  }, [availableRankingModesKey, relationshipRankingMode]);

  useEffect(() => {
    if (!insights || !selectedRelationshipKey) return;
    const resolvedNow = resolveRelationshipsForMode(
      insights.relationships,
      displayedRelationshipRankingMode,
    );
    const ranks = resolvedNow[selectedRelationshipKey];
    if (!firstRankedEntry(ranks)) {
      setSelectedRelationshipKey(null);
      setRelationshipPlaceIndex(0);
      return;
    }
    const clamped = clampRelationshipPlaceIndex(ranks, relationshipPlaceIndex);
    if (clamped !== relationshipPlaceIndex) setRelationshipPlaceIndex(clamped);
  }, [displayedRelationshipRankingMode, insights, relationshipPlaceIndex, selectedRelationshipKey]);

  if (!insights) return null;

  const recentGames = insights.streaks.recentGames.slice(-10);
  const emptySlots = Math.max(0, 10 - recentGames.length);
  const hasStreakData = recentGames.length > 0 || !!insights.streaks.current;

  const resolved = resolveRelationshipsForMode(
    insights.relationships,
    displayedRelationshipRankingMode,
  );

  const relationships = dedupeRelationshipCards([
    {
      key: 'bestPartner' as const,
      label: t('playerCard.bestPartner'),
      icon: Trophy,
      entry: firstRankedEntry(resolved.bestPartner),
      ranks: resolved.bestPartner,
      tone: 'text-green-600 dark:text-green-400',
    },
    {
      key: 'worstPartner' as const,
      label: t('playerCard.worstPartner'),
      icon: TrendingDown,
      entry: firstRankedEntry(resolved.worstPartner),
      ranks: resolved.worstPartner,
      tone: 'text-red-600 dark:text-red-400',
    },
    {
      key: 'favoriteTarget' as const,
      label: t('playerCard.favoriteTarget'),
      icon: Crosshair,
      entry: firstRankedEntry(resolved.favoriteTarget),
      ranks: resolved.favoriteTarget,
      tone: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'nemesis' as const,
      label: t('playerCard.nemesis'),
      icon: ShieldAlert,
      entry: firstRankedEntry(resolved.nemesis),
      ranks: resolved.nemesis,
      tone: 'text-purple-600 dark:text-purple-400',
    },
  ]);
  const hasRelationshipData = relationships.length > 0;
  const showRankingModeSwitch = availableRankingModes.length > 1;
  const relationshipRankingModes = availableRankingModes.map((mode) => ({
    mode,
    labelKey: relationshipRankingModeLabels[mode],
  }));
  const selectedRelationship = selectedRelationshipKey
    ? relationships.find((relationship) => relationship.key === selectedRelationshipKey) ?? null
    : null;
  const selectedRanks = selectedRelationship?.ranks ?? [];
  const selectedPlaceIndex = clampRelationshipPlaceIndex(selectedRanks, relationshipPlaceIndex);
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
    if (!availableRankingModes.includes(mode)) return;

    setRelationshipRankingMode(mode);
    clearRelationshipTransitionTimers();
    setRelationshipCardsVisible(false);
    setSelectedRelationshipKey(null);
    setRelationshipPlaceIndex(0);
    relationshipHideTimeoutRef.current = window.setTimeout(() => {
      setDisplayedRelationshipRankingMode(mode);
      relationshipRevealTimeoutRef.current = window.setTimeout(() => {
        setRelationshipCardsVisible(true);
      }, 30);
    }, 150);
  };

  const openRelationship = (key: RelationshipCardKey) => {
    setSelectedRelationshipKey(key);
    setRelationshipPlaceIndex(0);
  };

  return (
    <div className="space-y-3">
      <section className={`rounded-xl bg-gray-100 ${darkBgClass} border border-gray-200/60 dark:border-gray-600/50 p-4`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('playerCard.streaks')}</h3>
              <button
                type="button"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
                  showStreakInfo
                    ? 'border-primary-200 bg-primary-50 text-primary-600 dark:border-primary-800 dark:bg-primary-950/50 dark:text-primary-300'
                    : 'border-gray-200/80 bg-white/75 text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 dark:border-gray-600/70 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-950/40 dark:hover:text-primary-300'
                }`}
                aria-label={t('playerCard.streakInfo.button')}
                aria-expanded={showStreakInfo}
                aria-controls={streakInfoId}
                onClick={() => setShowStreakInfo((value) => !value)}
              >
                <motion.span
                  animate={reduceMotion ? undefined : { rotate: showStreakInfo ? 12 : 0, scale: showStreakInfo ? 1.06 : 1 }}
                  transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                  className="flex"
                >
                  <HelpCircle size={15} aria-hidden />
                </motion.span>
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.currentStreak')}</p>
          </div>
          <div className="text-end text-sm font-semibold text-gray-900 dark:text-white">
            {currentStreak}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showStreakInfo && (
            <motion.div
              id={streakInfoId}
              initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mb-4 rounded-xl border border-primary-100 bg-white/80 p-3 shadow-sm dark:border-primary-900/60 dark:bg-gray-800/65">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-200">
                    <HelpCircle size={15} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('playerCard.streakInfo.title')}
                    </h4>
                    <p className="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">
                      {t('playerCard.streakInfo.intro')}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {([
                    ['delta', 'Δ'],
                    ['matches', 'M'],
                    ['leaderboard', '#'],
                  ] as const).map(([rule, mark]) => (
                    <div
                      key={rule}
                      className="flex items-start gap-2.5 rounded-lg bg-gray-50/90 px-2.5 py-2 dark:bg-gray-900/35"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[11px] font-bold text-primary-700 shadow-sm ring-1 ring-gray-200/70 dark:bg-gray-800 dark:text-primary-300 dark:ring-gray-700">
                        {mark}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                          {t(`playerCard.streakInfo.${rule}Title`)}
                        </div>
                        <p className="mt-0.5 text-xs leading-[1.125rem] text-gray-600 dark:text-gray-300">
                          {t(`playerCard.streakInfo.${rule}Description`)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium leading-[1.125rem] text-amber-900 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50">
                  {t('playerCard.streakInfo.example')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

      <section className={`relative overflow-hidden rounded-xl bg-gray-100 ${darkBgClass} border border-gray-200/60 dark:border-gray-600/50 p-4`}>
        <AnimatePresence mode="wait" initial={false}>
          {selectedRelationship?.entry ? (
            <motion.div
              key={`relationship-games-${selectedRelationship.key}`}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <RelationshipRankDetail
                icon={selectedRelationship.icon}
                label={selectedRelationship.label}
                tone={selectedRelationship.tone}
                ranks={selectedRanks}
                placeIndex={selectedPlaceIndex}
                rankingMode={displayedRelationshipRankingMode}
                onPlaceIndexChange={setRelationshipPlaceIndex}
                onBack={() => {
                  setSelectedRelationshipKey(null);
                  setRelationshipPlaceIndex(0);
                }}
                onOpenGame={onOpenGame}
              />
            </motion.div>
          ) : (
            <motion.div
              key="relationship-cards"
              initial={{ opacity: 0, x: -28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
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
              {hasRelationshipData ? (
                <div
                  className={`grid grid-cols-1 gap-2 transition-all duration-200 ease-out motion-reduce:transition-none sm:grid-cols-2 ${
                    relationshipCardsVisible
                      ? 'translate-y-0 scale-100 opacity-100'
                      : 'pointer-events-none translate-y-2 scale-[0.98] opacity-0'
                  }`}
                >
                  {relationships.map(({ key, label, icon: Icon, entry, tone }) => {
                    if (!entry) return null;
                    const ratingNetChange = formatRatingNetChange(entry.ratingNetChange);
                    return (
                      <button
                        key={key}
                        type="button"
                        className="rounded-lg bg-white/70 p-3 text-start shadow-sm ring-1 ring-transparent transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:bg-gray-800/40 dark:hover:bg-gray-800/65 dark:focus-visible:ring-offset-gray-800"
                        onClick={() => openRelationship(key)}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon size={14} className={tone} />
                            <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
                          </div>
                          <ArrowUpRight size={14} className="shrink-0 text-gray-400" aria-hidden />
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
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('playerCard.noPartnerStatsYet')}</div>
              )}

              {showRankingModeSwitch ? (
                <div
                  className={`mt-3 grid rounded-lg bg-white/70 p-1 shadow-inner ring-1 ring-gray-200/70 dark:bg-gray-800/40 dark:ring-gray-700/70 ${
                    relationshipRankingModes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                  }`}
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
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

export const ProfilePerformanceInsights = memo(ProfilePerformanceInsightsComponent);
