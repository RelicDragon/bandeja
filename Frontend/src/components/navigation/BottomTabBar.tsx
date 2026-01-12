import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Search, MessageCircle, Trophy, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigationStore } from '@/store/navigationStore';
import { useAuthStore } from '@/store/authStore';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { useMemo, useRef } from 'react';

interface BottomTabBarProps {
  containerPosition?: boolean;
}

export const BottomTabBar = ({ containerPosition = false }: BottomTabBarProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentPage, setCurrentPage, setIsAnimating } = useNavigationStore();
  const { counts } = useChatUnreadCounts();
  const chatsUnread = counts.users + counts.bugs;
  const user = useAuthStore((state) => state.user);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
      icon: Search,
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
      id: 'leaderboard' as const,
      label: t('bottomTab.leaderboard', { defaultValue: 'Top' }),
      icon: Trophy,
      path: '/leaderboard',
    },
  ], [t, counts.games, chatsUnread]);


  const handleTabClick = (tab: 'my' | 'find' | 'chats' | 'leaderboard' | 'profile', path: string) => {
    if (currentPage === tab) return;
    
    setIsAnimating(true);
    setCurrentPage(tab);
    navigate(path, { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <motion.div 
      layoutId="bottom-tab-bar"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={containerPosition ? "absolute bottom-0 left-0 right-0 z-50" : "fixed bottom-0 left-0 right-0 z-50"}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-center">
        <div className="relative bg-white/30 dark:bg-gray-900/30 backdrop-blur-2xl border-t border-gray-200/20 dark:border-gray-700/20 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.48)] max-w-[300px] w-full rounded-2xl">
          <div className="relative flex items-center justify-around h-16 overflow-hidden">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = currentPage === tab.id;
            
            return (
              <motion.button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                onClick={() => handleTabClick(tab.id, tab.path)}
                className="flex flex-col items-center justify-center flex-1 h-full relative group"
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <motion.div
                  className="relative"
                  animate={{
                    scale: isActive ? 1.1 : 1,
                    y: isActive ? -2 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <motion.div
                    animate={{
                      scale: isActive ? [1, 1.2, 1.1] : 1,
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
                
                <motion.span
                  className={`text-[10px] mt-0.5 transition-colors duration-300 ${
                    isActive
                      ? 'font-bold text-primary-600 dark:text-primary-400'
                      : 'font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                  }`}
                  animate={{
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  {tab.label}
                </motion.span>

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
          
          <motion.button
            ref={(el) => { tabRefs.current[4] = el; }}
            onClick={() => handleTabClick('profile', '/profile')}
            className="flex flex-col items-center justify-center flex-1 h-full relative group"
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <motion.div
              className="relative"
              animate={{
                scale: currentPage === 'profile' ? 1.1 : 1,
                y: currentPage === 'profile' ? -2 : 0,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <motion.div
                className={`w-6 h-6 rounded-full overflow-hidden transition-all duration-300 ${
                  currentPage === 'profile' 
                    ? 'ring-2 ring-primary-500/50 dark:ring-primary-400/50' 
                    : 'ring-2 ring-transparent'
                }`}
                animate={{
                  scale: currentPage === 'profile' ? [1, 1.15, 1.1] : 1,
                }}
                transition={{
                  scale: { duration: 0.3, times: [0, 0.5, 1] },
                }}
                style={{
                  boxShadow: currentPage === 'profile' 
                    ? '0 0 0 2px rgba(59, 130, 246, 0.3), 0 0 12px rgba(59, 130, 246, 0.4)'
                    : 'none',
                }}
              >
                {user?.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User 
                    size={24}
                    className={`transition-colors duration-300 ${
                      currentPage === 'profile'
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
                    }`}
                  />
                )}
              </motion.div>
            </motion.div>
            
            <motion.span
              className={`text-[10px] mt-0.5 transition-colors duration-300 ${
                currentPage === 'profile'
                  ? 'font-bold text-primary-600 dark:text-primary-400'
                  : 'font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
              }`}
              animate={{
                scale: currentPage === 'profile' ? 1.05 : 1,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {t('bottomTab.profile', { defaultValue: 'Profile' })}
            </motion.span>

            {currentPage === 'profile' && (
              <motion.div
                className="absolute inset-[5%] rounded-2xl bg-primary-500/10 dark:bg-primary-400/10"
                layoutId="activeTab"
                initial={false}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
