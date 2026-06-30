import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Calendar, MessageCircle, Trophy, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBottomTabUnreadBadges } from '@/hooks/useUnreadBridge';
import { useDesktop } from '@/hooks/useDesktop';
import { memo, useMemo, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { isChatShellPlace, parseLocation } from '@/utils/urlSchema';
import { resolveBottomTabActiveId, type BottomTabId } from '@/utils/bottomTabActiveId';
import { hasEnabledSports } from '@/utils/profileSports';
import { ClubAdminFab } from '@/components/clubAdmin/ClubAdminFab';
import { UnreadBadge } from '@/components/UnreadBadge';

interface BottomTabBarProps {
  containerPosition?: boolean;
  tabOverride?: BottomTabId;
  previousPath?: string;
  animateEntry?: boolean;
}

const BottomTabBarInner = ({ containerPosition = false, tabOverride, previousPath, animateEntry = false }: BottomTabBarProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setRequestFindGoToCurrent } = useShellNavStore();
  const user = useAuthStore((s) => s.user);
  const showGameTabs = hasEnabledSports(user);
  const tabBadges = useBottomTabUnreadBadges();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isDesktop = useDesktop();

  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );
  const activeTabId = resolveBottomTabActiveId(parsed.place);
  const effectivePage = tabOverride ?? activeTabId;
  const findViewMode = (parsed.place === 'find' && parsed.params.view as string) || 'calendar';
  
  const shouldAnimateToLeft = isDesktop && isChatShellPlace(parsed.place);

  const tabs = useMemo(() => {
    const all = [
      {
        id: 'my' as const,
        label: t('bottomTab.my', { defaultValue: 'My' }),
        icon: Home,
        path: '/',
        badge: tabBadges.my,
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
        badge: tabBadges.chats,
      },
      {
        id: 'marketplace' as const,
        label: t('bottomTab.marketplace', { defaultValue: 'Market' }),
        icon: ShoppingBag,
        path: '/marketplace',
        badge: tabBadges.market,
      },
      {
        id: 'leaderboard' as const,
        label: t('bottomTab.leaderboard', { defaultValue: 'Top' }),
        icon: Trophy,
        path: '/leaderboard',
      },
    ];
    if (!showGameTabs) {
      return all.filter((tab) => tab.id !== 'my' && tab.id !== 'find');
    }
    return all;
  }, [t, tabBadges.my, tabBadges.chats, tabBadges.market, showGameTabs]);


  const handleTabClick = (tab: BottomTabId, path: string) => {
    if (effectivePage !== null && effectivePage === tab) {
      if (tabOverride && previousPath) {
        const [pathname, search] = previousPath.includes('?') ? [previousPath.split('?')[0], previousPath.split('?')[1] ?? ''] : [previousPath, ''];
        navigate({ pathname, search: search ? `?${search}` : '' }, { replace: true });
        return;
      }
      if (tab === 'find') {
        setRequestFindGoToCurrent(findViewMode as 'calendar' | 'list');
      }
      return;
    }
    navigate(path, { replace: true });
  };

  const shellPositionClass =
    containerPosition && shouldAnimateToLeft
      ? 'relative w-full pointer-events-auto'
      : 'fixed bottom-0 left-0 right-0 z-50';
  const shellPaddingBottom = `max(${isDesktop ? '1rem' : '0.5rem'}, env(safe-area-inset-bottom))`;
  const useMotionShell = animateEntry || isDesktop;
  const useRichTabMotion = useMotionShell;

  const pillShellClass =
    'relative w-fit max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-300/60 shadow-[0_-12px_48px_rgba(0,0,0,0.22),0_-4px_24px_rgba(0,0,0,0.14),-20px_0_40px_rgba(0,0,0,0.18),20px_0_40px_rgba(0,0,0,0.18)] dark:border-gray-600/60 dark:shadow-[0_0_12px_rgba(218,165,32,0.26),0_0_24px_rgba(255,215,0,0.07),0_-6px_20px_rgba(0,0,0,0.14)]';
  const iconClass = (isActive: boolean) =>
    `transition-colors duration-300 ${
      isActive
        ? 'text-primary-600 dark:text-primary-400'
        : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200'
    }`;

  const tabBarBody = (
    <>
      <ClubAdminFab />
      <div className="flex justify-center">
        <div className={pillShellClass}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl bg-white/95 dark:bg-gray-900/95"
          />
          <div className="relative isolate z-[1] px-1 flex items-center justify-center h-16">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = effectivePage !== null && effectivePage === tab.id;
            const currentDay = new Date().getDate();
            const isCalendarTab = tab.id === 'find';
            const tabButtonClass =
              'flex flex-col items-center justify-center px-3 h-full relative group';

            if (!useRichTabMotion) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  ref={(el) => { tabRefs.current[index] = el; }}
                  onClick={() => handleTabClick(tab.id, tab.path)}
                  className={tabButtonClass}
                >
                  {isActive ? (
                    <div className="absolute inset-[5%] rounded-2xl bg-primary-500/10 dark:bg-primary-400/10" />
                  ) : null}
                  <div
                    className={`relative transition-transform duration-200 ${
                      isActive ? 'translate-y-[7px] scale-[1.3]' : ''
                    }`}
                  >
                    <div className={isCalendarTab ? 'relative' : undefined}>
                      <Icon size={24} className={iconClass(isActive)} />
                      {isCalendarTab ? (
                        <span
                          className={`absolute mt-1 inset-0 flex items-center justify-center text-[8px] font-bold leading-none pointer-events-none ${iconClass(isActive)}`}
                          style={{ paddingTop: '2px' }}
                        >
                          {currentDay}
                        </span>
                      ) : null}
                    </div>
                    {tab.badge != null ? (
                      <UnreadBadge count={tab.badge} size="sm" className="absolute -top-2 -right-2" />
                    ) : null}
                  </div>
                  <div className="h-[14px] flex items-center justify-center">
                    {!isActive ? (
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">
                        {tab.label}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            }

            return (
              <motion.button
                key={tab.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                onClick={() => handleTabClick(tab.id, tab.path)}
                className={tabButtonClass}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <motion.div
                  className="relative"
                  initial={false}
                  animate={{
                    scale: isActive ? 1.3 : 1,
                    y: isActive ? 7 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <motion.div
                    className={isCalendarTab ? 'relative' : undefined}
                    initial={false}
                    animate={{
                      scale: isActive ? 1.3 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  >
                    <Icon size={24} className={iconClass(isActive)} />
                    {isCalendarTab ? (
                      <span
                        className={`absolute mt-1 inset-0 flex items-center justify-center text-[8px] font-bold leading-none pointer-events-none ${iconClass(isActive)}`}
                        style={{ paddingTop: '2px' }}
                      >
                        {currentDay}
                      </span>
                    ) : null}
                  </motion.div>

                  {tab.badge != null ? (
                    <UnreadBadge count={tab.badge} size="sm" className="absolute -top-2 -right-2" />
                  ) : null}
                </motion.div>

                <div className="h-[14px] flex items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {!isActive ? (
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
                    ) : null}
                  </AnimatePresence>
                </div>

                {isActive ? (
                  <motion.div
                    className="absolute inset-[5%] rounded-2xl bg-primary-500/10 dark:bg-primary-400/10"
                    layoutId="activeTab"
                    layoutScroll={false}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                ) : null}
              </motion.button>
            );
          })}
          </div>
        </div>
      </div>
    </>
  );

  if (useMotionShell) {
    return (
      <motion.div
        layoutRoot={isDesktop && !containerPosition}
        layoutScroll={false}
        layoutId={isDesktop && !containerPosition ? 'bottom-tab-bar' : undefined}
        className={`${shellPositionClass} transform-gpu`}
        style={{ paddingBottom: shellPaddingBottom }}
        initial={animateEntry ? { y: '100%' } : false}
        animate={animateEntry ? { y: 0 } : undefined}
        transition={animateEntry ? { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } : undefined}
      >
        {tabBarBody}
      </motion.div>
    );
  }

  return (
    <div
      className={`${shellPositionClass} isolate [transform:translateZ(0)]`}
      style={{ paddingBottom: shellPaddingBottom }}
    >
      {tabBarBody}
    </div>
  );
};

export const BottomTabBar = memo(BottomTabBarInner);
