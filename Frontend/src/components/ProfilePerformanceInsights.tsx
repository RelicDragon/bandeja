import { useState } from 'react';
import { Crosshair, Handshake, HelpCircle, ShieldAlert, TrendingDown, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  PerformanceRelationshipEntry,
  StreakResult,
  UserPerformanceInsights,
} from '@/api/users';

interface ProfilePerformanceInsightsProps {
  insights?: UserPerformanceInsights;
  darkBgClass?: string;
}

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

function getInitials(entry: PerformanceRelationshipEntry) {
  const initials = `${entry.user.firstName?.[0] ?? ''}${entry.user.lastName?.[0] ?? ''}`.toUpperCase();
  return initials || '?';
}

export const ProfilePerformanceInsights = ({
  insights,
  darkBgClass = 'dark:bg-gray-700/50',
}: ProfilePerformanceInsightsProps) => {
  const { t } = useTranslation();
  const [showRelationshipInfo, setShowRelationshipInfo] = useState(false);
  if (!insights) return null;

  const recentGames = insights.streaks.recentGames.slice(-10);
  const emptySlots = Math.max(0, 10 - recentGames.length);
  const hasStreakData = recentGames.length > 0 || !!insights.streaks.current;

  const bestPartner = insights.relationships.bestPartner;
  const worstPartner = insights.relationships.worstPartner;

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
      entry: insights.relationships.favoriteTarget,
      tone: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'nemesis',
      label: t('playerCard.nemesis'),
      icon: ShieldAlert,
      entry: insights.relationships.nemesis,
      tone: 'text-purple-600 dark:text-purple-400',
    },
  ].filter((item) => item.entry);
  const hasRelationshipData = relationships.length > 0;

  const currentStreak = insights.streaks.current
    ? t(`${currentStreakKey[insights.streaks.current.result]}_${insights.streaks.current.count === 1 ? 'one' : 'other'}`, {
        count: insights.streaks.current.count,
      })
    : t('playerCard.noStreakYet');

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
            showRelationshipInfo ? 'mb-3 max-h-40 opacity-100' : 'mb-0 max-h-0 opacity-0'
          }`}
        >
          <p className="rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs leading-5 text-gray-600 dark:border-primary-900/50 dark:bg-primary-950/25 dark:text-gray-300">
            {t('playerCard.relationshipInfo')}
          </p>
        </div>

        {hasRelationshipData ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {relationships.map(({ key, label, icon: Icon, entry, tone }) => {
              if (!entry) return null;
              return (
                <div key={key} className="rounded-lg bg-white/70 dark:bg-gray-800/40 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon size={14} className={tone} />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
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
                      <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{getPlayerName(entry, t('playerCard.shareProfileFallbackName'))}</div>
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
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('playerCard.noPartnerStatsYet')}</div>
        )}
      </section>
    </div>
  );
};
