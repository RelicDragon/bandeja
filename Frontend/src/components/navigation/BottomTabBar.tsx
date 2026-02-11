import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, MessageCircle, Trophy, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigationStore } from '@/store/navigationStore';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { useDesktop } from '@/hooks/useDesktop';
import { useMemo, useRef } from 'react';

interface BottomTabBarProps {
  containerPosition?: boolean;
}

export const BottomTabBar = ({ containerPosition = false }: BottomTabBarProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentPage, setCurrentPage, setIsAnimating, findViewMode, setRequestFindGoToCurrent } = useNavigationStore();
  const { counts } = useChatUnreadCounts();
  const chatsUnread = counts.users + counts.bugs + counts.channels + counts.marketplace;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isDesktop = useDesktop();
  
  const shouldAnimateToLeft = isDesktop && currentPage === 'chats';

  const tabs = useMemo(() => [
    {
      id: 'my' as const,
      label: t('bottomTab.my', { defaultValue: 'My' }),
      icon: Home,
      path: '/',
      badge: counts.games,
    },
    {
      id: 'find' as const,
      label: t('bottomTab.find', { defaultValue: 'Find' }),
      icon: Calendar,
      path: '/find',
    },
    {
      id: 'chats' as const,
      label: t('bottomTab.chats', { defaultValue: 'Chats' }),
      icon: MessageCircle,
      path: '/chats',
      badge: chatsUnread,
    },
    {
      id: 'marketplace' as const,
      label: t('bottomTab.marketplace', { defaultValue: 'Market' }),
      icon: ShoppingBag,
      path: '/marketplace',
      badge: counts.marketplace,
    },
    {
      id: 'leaderboard' as const,
      label: t('bottomTab.leaderboard', { defaultValue: 'Top' }),
      icon: Trophy,
      path: '/leaderboard',
    },
  ], [t, counts.games, chatsUnread, counts.marketplace]);


  const handleTabClick = (tab: 'my' | 'find' | 'chats' | 'leaderboard' | 'marketplace', path: string) => {
    if (currentPage === tab) {
      if (tab === 'find') {
        setRequestFindGoToCurrent(findViewMode);
      }
      return;
    }
    
    setIsAnimating(true);
    setCurrentPage(tab);
    navigate(path, { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <motion.div 
      layoutId={isDesktop ? "bottom-tab-bar" : undefined}
      className={containerPosition && shouldAnimateToLeft ? "absolute bottom-0 left-0 right-0 z-50" : "fixed bottom-0 left-0 right-0 z-50"}
      style={{ paddingBottom: `max(${isDesktop ? '1rem' : '0.5rem'}, env(safe-area-inset-bottom))` }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="flex justify-center">
        <div className="relative bg-white/30 dark:bg-gray-900/30 backdrop-blur-2xl border-t border-gray-200/20 dark:border-gray-700/20 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.48)] max-w-[300px] w-full rounded-2xl">
          <div className="relative flex items-center justify-around h-16 overflow-hidden">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = currentPage === tab.id;
            const currentDay = new Date().getDate();
            const isCalendarTab = tab.id === 'find';
            
            return (
              <motion.button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                onClick={() => handleTabClick(tab.id, tab.path)}
                className="flex flex-col items-center justify-center flex-1 h-full relative group"
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                layout="position"
              >
                <motion.div
                  className="relative"
                  animate={{
                    scale: isActive ? 1.3 : 1,
                    y: isActive ? 7 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <motion.div
                    className={isCalendarTab ? 'relative' : undefined}
                    animate={{
                      scale: isActive ? [1, 1.4, 1.3] : 1,
                    }}
                    transition={{
                      duration: 0.3,
                      times: [0, 0.5, 1],
                    }}
                  >
                    <Icon 
                      size={24} 
                      className={`transition-colors duration-300 ${
                        isActive
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                      }`}
                    />
                    {isCalendarTab && (
                      <span
                        className={`absolute mt-1 inset-0 flex items-center justify-center text-[8px] font-bold leading-none pointer-events-none ${
                          isActive
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                        }`}
                        style={{ paddingTop: '2px' }}
                      >
                        {currentDay}
                      </span>
                    )}
                  </motion.div>
                  
                  <AnimatePresence>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="absolute -top-2 -right-2 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg shadow-red-500/50"
                      >
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
                
                <div className="h-[14px] flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {!isActive && (
                      <motion.span
                        key="label"
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25, duration: 0.2 }}
                        className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                      >
                        {tab.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                {isActive && (
                  <motion.div
                    className="absolute inset-[5%] rounded-2xl bg-primary-500/10 dark:bg-primary-400/10"
                    layoutId="activeTab"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
