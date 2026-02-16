import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserStats, usersApi, LevelHistoryItem } from '@/api/users';
import { buildUrl } from '@/utils/urlSchema';
import { LevelHistoryTabController } from './LevelHistoryTabController';
import { GamesStatsSection } from './GamesStatsSection';
import { LevelHistoryAvatarSection } from './LevelHistoryAvatarSection';
import { LevelHistoryProfileStatsSection } from './LevelHistoryProfileStatsSection';
import { ConfirmedLevelSection } from './ConfirmedLevelSection';
import { PlayerItemsToSell } from './PlayerItemsToSell';
import { MarketItem } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from 'recharts';

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
        <LevelHistoryAvatarSection
          user={user}
          showSocialLevel={showSocialLevel}
          onToggle={handleToggle}
          isToggleAnimating={isToggleAnimating}
        />
      )}
      <ConfirmedLevelSection user={user} />

      <LevelHistoryProfileStatsSection
        user={user}
        followersCount={stats.followersCount}
        followingCount={stats.followingCount}
      />


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

