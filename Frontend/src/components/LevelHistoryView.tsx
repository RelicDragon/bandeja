import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Beer, Check, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserStats, usersApi, LevelHistoryItem } from '@/api/users';
import { buildUrl } from '@/utils/urlSchema';
import { LevelHistoryTabController } from './LevelHistoryTabController';
import { GamesStatsSection } from './GamesStatsSection';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerItemsToSell } from './PlayerItemsToSell';
import { MarketItem } from '@/types';
import { formatDate, formatSmartRelativeTime } from '@/utils/dateFormat';
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from 'recharts';

const TennisBallIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 69.447 69.447"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g transform="translate(-1271.769 -1574.648)">
      <path d="M1341.208,1609.372a34.719,34.719,0,1,1-34.72-34.724A34.724,34.724,0,0,1,1341.208,1609.372Z" fill="#b9d613"/>
      <path d="M1311.144,1574.993a35.139,35.139,0,0,0-4.61-.344,41.069,41.069,0,0,1-34.369,29.735,34.3,34.3,0,0,0-.381,4.635l.183-.026a45.921,45.921,0,0,0,39.149-33.881Zm29.721,34.692a45.487,45.487,0,0,0-33.488,34.054l-.071.313a34.54,34.54,0,0,0,4.818-.455,41.218,41.218,0,0,1,28.686-29.194,36.059,36.059,0,0,0,.388-4.8Z" fill="#f7f7f7"/>
    </g>
  </svg>
);

interface LevelHistoryViewProps {
  stats: UserStats;
  padding?: string;
  tabDarkBgClass?: string;
  hideUserCard?: boolean;
  onOpenGame?: () => void;
  showItemsToSell?: boolean;
  onMarketItemClick?: (item: MarketItem) => void;
}

export const LevelHistoryView = ({ stats, padding = 'p-6', tabDarkBgClass, hideUserCard = false, onOpenGame, showItemsToSell = false, onMarketItemClick }: LevelHistoryViewProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = stats;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const [showSocialLevel, setShowSocialLevel] = useState(false);
  const [isToggleAnimating, setIsToggleAnimating] = useState(false);
  const [levelChangeEvents, setLevelChangeEvents] = useState<LevelHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'10' | '30' | 'all'>('10');
  const [gamesStatsTab, setGamesStatsTab] = useState<'30' | '90' | 'all'>('30');
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const itemRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const fetchLevelChanges = async () => {
      try {
        const response = await usersApi.getUserLevelChanges(user.id);
        setLevelChangeEvents(response.data);
      } catch (error) {
        console.error('Failed to fetch level changes:', error);
      }
    };

    fetchLevelChanges();
  }, [user.id]);

  const handleToggle = () => {
    setIsToggleAnimating(true);
    setShowSocialLevel(!showSocialLevel);
    setTimeout(() => setIsToggleAnimating(false), 200);
  };

  const handleRatingChangeClick = (item: { id: string; gameId: string }) => {
    if (!item.gameId) return;
    onOpenGame?.();
    navigate(buildUrl('game', { id: item.gameId }));
  };

  const allMergedHistory = useMemo(() => {
    const filteredEvents = showSocialLevel
      ? levelChangeEvents.filter(item => item.eventType?.startsWith('SOCIAL_'))
      : levelChangeEvents.filter(item => !item.eventType?.startsWith('SOCIAL_'));
    
    return filteredEvents
      .map(item => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString(),
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [showSocialLevel, levelChangeEvents]);

  const currentHistory = useMemo(() => {
    if (activeTab === 'all') {
      return allMergedHistory;
    }
    const limit = activeTab === '10' ? 10 : 30;
    return allMergedHistory.slice(-limit);
  }, [allMergedHistory, activeTab]);
  const currentValue = showSocialLevel ? user.socialLevel : user.level;
  
  const maxLevel = currentHistory.length > 0 
    ? Math.max(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;
  const minLevel = currentHistory.length > 0
    ? Math.min(...currentHistory.map(h => h.levelAfter), currentValue)
    : currentValue;

  const chartData = useMemo(() => {
    return currentHistory.map((item, index) => ({
      index,
      level: item.levelAfter,
      date: formatDate(item.createdAt, 'PP'),
      fullDate: item.createdAt,
      itemId: item.id,
      eventType: item.eventType,
    }));
  }, [currentHistory]);

  const getScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    if (!el) return null;
    let parent = el.parentElement;
    while (parent) {
      const { overflowY, overflow } = getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflow === 'auto' || overflow === 'scroll') return parent;
      parent = parent.parentElement;
    }
    return null;
  };

  const handleChartDotClick = (data: { itemId: string; index: number }) => {
    if (!data.itemId) return;
    setActiveChartIndex(data.index);
    setHighlightedItemId(data.itemId);
    setTimeout(() => {
      setHighlightedItemId(null);
      setActiveChartIndex(null);
    }, 2000);
  };

  const handleHintClick = (data: { itemId: string; index: number }) => {
    const el = data.itemId ? itemRefs.current[data.itemId] : null;
    if (!data.itemId || !el) return;
    setActiveChartIndex(data.index);
    setHighlightedItemId(data.itemId);
    const scrollParent = getScrollParent(el);
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScroll = scrollParent.scrollTop + (elRect.top - parentRect.top) - (parentRect.height / 2) + (elRect.height / 2);
      scrollParent.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedItemId(null);
      setActiveChartIndex(null);
    }, 2000);
  };

  const createDotClickHandler = (data: { itemId: string; index: number }) => 
    (e: React.MouseEvent<SVGElement> | React.TouchEvent<SVGElement>) => {
      e.stopPropagation();
      e.preventDefault();
      handleChartDotClick(data);
    };

  return (
    <div className={`${padding} space-y-3`}>
      {!hideUserCard && (
        <>
      <div className="relative">
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-4 text-center relative">
              <div className="flex gap-2 items-center">
                {user.originalAvatar ? (
                  <button
                    className="cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar || ''}
                        alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
                        className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                        {initials}
                      </div>
                    )}
                  </button>
                ) : user.avatar ? (
                  <img
                    src={user.avatar || ''}
                    alt={`${user.firstName} ${user.lastName}`}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                    {initials}
                  </div>
                )}


                <div className="flex flex-col text-left">
                  <div className="text-white text-sm">
                    {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
                  </div>
                  <div className="text-white text-6xl font-bold pb-6">
                    {showSocialLevel ? user.socialLevel.toFixed(2) : user.level.toFixed(2)}
                  </div>
                </div>
              </div>
              {!showSocialLevel && (
                <div className="absolute bottom-3 right-3 text-white/80 text-xs">
                  {t('rating.reliability')}: {user.reliability.toFixed(0)}%
                </div>
              )}
            </div>
            <button
              onClick={handleToggle}
              className="absolute top-3 right-3 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-md hover:shadow-lg transition-transform duration-200 flex items-center justify-center"
              style={{ transform: isToggleAnimating ? 'scale(1.3)' : 'scale(1)' }}
              title={showSocialLevel ? t('playerCard.switchToLevel') : t('playerCard.switchToSocialLevel')}
            >
              {showSocialLevel ? (
                <TennisBallIcon />
              ) : (
                <Beer size={20} className="text-amber-600" />
              )}
            </button>
          </div>

      {!showSocialLevel && user.approvedLevel && user.approvedBy && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-yellow-500 dark:bg-yellow-600 text-white px-2 py-0.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
              <Check size={14} className="text-white" strokeWidth={3} />
              <span>{t('playerCard.confirmedBy') || 'Level was confirmed by'}</span>
            </div>
            <div className="flex items-center justify-center -mt-2 gap-2 text-gray-700 dark:text-gray-300 text-sm">
              <PlayerAvatar player={user.approvedBy} showName={false} fullHideName={true} extrasmall={true} />
              <span className="font-medium pl-2">{user.approvedBy.firstName} {user.approvedBy.lastName}</span>
              {user.approvedWhen && (
                <>
                  <span className="text-gray-500 dark:text-gray-500">•</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatSmartRelativeTime(user.approvedWhen, t)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}

      <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/50">
        <div className="flex items-center gap-0 border-b border-gray-200/60 dark:border-gray-600/50">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-gray-200/60 dark:border-gray-600/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.followers') || 'Followers'}</span>
            <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{stats.followersCount}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.following') || 'Following'}</span>
            <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{stats.followingCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-0">
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-gray-200/60 dark:border-gray-600/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.preferredHand')}</span>
            <div className="flex gap-1">
              <div
                className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredHandLeft ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
                title={t('profile.left')}
              >
                <span className="text-[8px] font-semibold leading-none truncate">{t('profile.leftShort')}</span>
              </div>
              <div
                className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredHandRight ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
                title={t('profile.right')}
              >
                <span className="text-[8px] font-semibold leading-none truncate">{t('profile.rightShort')}</span>
              </div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.preferredCourtSide')}</span>
            <div className="flex gap-1">
              <div
                className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredCourtSideLeft ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
                title={t('profile.left')}
              >
                <span className="text-[8px] font-semibold leading-none truncate">{t('profile.leftShort')}</span>
              </div>
              <div
                className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredCourtSideRight ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
                title={t('profile.right')}
              >
                <span className="text-[8px] font-semibold leading-none truncate">{t('profile.rightShort')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showItemsToSell && (
        <PlayerItemsToSell userId={user.id} onItemClick={onMarketItemClick} />
      )}

      {stats.gamesStats?.length > 0 && (
        <GamesStatsSection
          stats={stats.gamesStats}
          activeTab={gamesStatsTab}
          onTabChange={setGamesStatsTab}
          darkBgClass={tabDarkBgClass}
        />
      )}

      {currentHistory.length > 0 ? (
        <>
          <LevelHistoryTabController activeTab={activeTab} onTabChange={setActiveTab} darkBgClass={tabDarkBgClass} />
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
            <div className="relative h-48 select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }} onClick={() => setActiveChartIndex(null)}>
              <style>{`
                .recharts-wrapper,
                .recharts-wrapper *,
                .recharts-wrapper svg,
                .recharts-wrapper svg *,
                .recharts-surface,
                .recharts-surface * {
                  user-select: none !important;
                  -webkit-user-select: none !important;
                  -moz-user-select: none !important;
                  -ms-user-select: none !important;
                  outline: none !important;
                  -webkit-tap-highlight-color: transparent !important;
                }
                .recharts-wrapper:focus,
                .recharts-wrapper *:focus,
                .recharts-wrapper svg:focus,
                .recharts-wrapper svg *:focus,
                .recharts-surface:focus,
                .recharts-surface *:focus,
                .recharts-wrapper:active,
                .recharts-wrapper *:active {
                  outline: none !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              `}</style>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 5, left: 20, bottom: 5 }}
                  style={{ outline: 'none' }}
                  tabIndex={-1}
                  onMouseMove={(state: any) => {
                    if (activeChartIndex === null && state?.activeTooltipIndex !== undefined) {
                      setHoveredChartIndex(state.activeTooltipIndex);
                    }
                  }}
                  onMouseLeave={() => {
                    if (activeChartIndex === null) {
                      setHoveredChartIndex(null);
                    }
                  }}
                  {...(() => {
                    const displayIndex = activeChartIndex !== null ? activeChartIndex : hoveredChartIndex;
                    return displayIndex !== null ? { activeIndex: displayIndex } : {};
                  })()}
                >
                  <defs>
                    <linearGradient id="levelGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="socialLevelGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(251, 191, 36)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="rgb(251, 191, 36)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.1)" className="dark:stroke-gray-600" />
                  <XAxis 
                    dataKey="index" 
                    hide 
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis 
                    domain={[minLevel, maxLevel]}
                    hide
                  />
                  <Area
                    type="monotone"
                    dataKey="level"
                    stroke={showSocialLevel ? "rgb(251, 191, 36)" : "rgb(59, 130, 246)"}
                    strokeWidth={2}
                    fill={showSocialLevel ? "url(#socialLevelGradient)" : "url(#levelGradient)"}
                    dot={({ cx, cy, payload }) => {
                      if (cx == null || cy == null || !payload) return null;
                      const data = payload as { itemId: string; index: number; eventType?: string };
                      if (!data?.itemId) return null;
                      const isSet = data.eventType === 'SET';
                      const fill = isSet ? 'rgb(251, 191, 36)' : (showSocialLevel ? 'rgb(251, 191, 36)' : 'rgb(59, 130, 246)');
                      const handleClick = createDotClickHandler(data);

                      if (isSet) {
                        const r = 9;
                        return (
                          <g transform={`translate(${cx}, ${cy})`} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={handleClick} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onTouchEnd={handleClick}>
                            <foreignObject x={-r} y={-r} width={r * 2} height={r * 2}>
                              <div {...({ xmlns: "http://www.w3.org/1999/xhtml" } as any)} className="flex items-center justify-center w-full h-full rounded-full bg-yellow-500 dark:bg-yellow-600 text-white" style={{ width: r * 2, height: r * 2 }}>
                                <Star size={12} className="text-white" fill="currentColor" />
                              </div>
                            </foreignObject>
                            <circle cx={0} cy={0} r={18} fill="transparent" onClick={handleClick} onTouchEnd={handleClick} />
                          </g>
                        );
                      }

                      return (
                        <g>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={fill}
                            stroke="none"
                            style={{ cursor: 'pointer', pointerEvents: 'all' }}
                            onClick={handleClick}
                            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            onTouchEnd={handleClick}
                          />
                          <circle cx={cx} cy={cy} r={18} fill="transparent" stroke="transparent" strokeWidth={0} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={handleClick} onTouchEnd={handleClick} />
                        </g>
                      );
                    }}
                    activeDot={({ cx, cy, payload }) => {
                      if (cx == null || cy == null || !payload) return null;
                      const data = payload as { itemId: string; index: number; eventType?: string };
                      if (!data?.itemId) return null;
                      const isSet = data.eventType === 'SET';
                      const fill = isSet ? 'rgb(251, 191, 36)' : (showSocialLevel ? 'rgb(251, 191, 36)' : 'rgb(59, 130, 246)');
                      const handleClick = createDotClickHandler(data);

                      if (isSet) {
                        const r = 10;
                        return (
                          <g transform={`translate(${cx}, ${cy})`} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={handleClick} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onTouchEnd={handleClick}>
                            <foreignObject x={-r} y={-r} width={r * 2} height={r * 2}>
                              <div {...({ xmlns: "http://www.w3.org/1999/xhtml" } as any)} className="flex items-center justify-center w-full h-full rounded-full bg-yellow-500 dark:bg-yellow-600 text-white ring-2 ring-white" style={{ width: r * 2, height: r * 2 }}>
                                <Star size={12} className="text-white" fill="currentColor" />
                              </div>
                            </foreignObject>
                            <circle cx={0} cy={0} r={20} fill="transparent" onClick={handleClick} onTouchEnd={handleClick} />
                          </g>
                        );
                      }

                      return (
                        <g>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={6}
                            fill={fill}
                            stroke="white"
                            strokeWidth={2}
                            style={{ cursor: 'pointer', pointerEvents: 'all' }}
                            onClick={handleClick}
                            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                            onTouchEnd={handleClick}
                          />
                          <circle cx={cx} cy={cy} r={20} fill="transparent" stroke="transparent" strokeWidth={0} style={{ cursor: 'pointer', pointerEvents: 'all' }} onClick={handleClick} onTouchEnd={handleClick} />
                        </g>
                      );
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              
              <div className="absolute top-0 left-0 text-xs text-gray-500 dark:text-gray-400">
                {maxLevel.toFixed(2)}
              </div>
              <div className="absolute bottom-0 left-0 text-xs text-gray-500 dark:text-gray-400">
                {minLevel.toFixed(2)}
              </div>
              
              {(() => {
                const tooltipIndex = activeChartIndex !== null ? activeChartIndex : hoveredChartIndex;
                if (tooltipIndex !== null && chartData[tooltipIndex]) {
                  const data = chartData[tooltipIndex];
                  return (
                    <div 
                      className="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-lg cursor-pointer z-10"
                      style={{
                        left: '50%',
                        top: '10%',
                        transform: 'translateX(-50%)',
                        pointerEvents: 'auto'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHintClick(data);
                      }}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {data.date}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}: {data.level.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('playerCard.clickToView')}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {activeTab === '10' ? t('playerCard.last10EventsTitle') : 
               activeTab === '30' ? t('playerCard.last30EventsTitle') : 
               t('playerCard.allEventsTitle')}
            </h3>
            {currentHistory.slice().reverse().map((item) => (
              <motion.div
                key={item.id}
                ref={(el) => {
                  itemRefs.current[item.id] = el;
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  scale: highlightedItemId === item.id ? 0.95 : 1,
                  y: highlightedItemId === item.id ? -4 : 0,
                }}
                transition={{ 
                  duration: 0.3,
                  scale: { 
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                  },
                  y: {
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                  }
                }}
                className={`rounded-lg p-2.5 cursor-pointer transition-colors relative overflow-hidden ${
                  highlightedItemId === item.id 
                    ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500 dark:ring-primary-400 shadow-lg' 
                    : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                onClick={() => handleRatingChangeClick(item)}
              >
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                    <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(item.createdAt, 'PP')}
                    </span>
                    {item.eventType && (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 ${
                        item.eventType === 'SET'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}>
                        {t(`playerCard.eventType.${item.eventType}`)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                      {item.levelBefore.toFixed(2)} → {item.levelAfter.toFixed(2)}
                    </span>
                    <div className={`flex items-center whitespace-nowrap ${item.levelChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {item.levelChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      <span className="font-semibold text-xs">
                        {item.levelChange >= 0 ? '+' : ''}{item.levelChange.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {showSocialLevel ? t('playerCard.noSocialLevelHistory') : t('playerCard.noLevelHistory')}
        </div>
      )}
    </div>
  );
};

