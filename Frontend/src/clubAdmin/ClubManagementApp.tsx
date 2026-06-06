import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { ClubAdminScrollContext } from '@/components/clubAdmin/ClubAdminScrollContext';
import { ClubAdminShellProvider } from './ClubAdminShellProvider';
import { useClubAdminShell } from './useClubAdminShell';
import { CLUB_ADMIN_PAGE_TRANSITION, CLUB_ADMIN_PAGE_VARIANTS, clubAdminRouteKey } from './navigation';
import { MyClubsPage } from '@/pages/clubAdmin/MyClubsPage';
import { ClubAdminHomePage } from '@/pages/clubAdmin/ClubAdminHomePage';
import { ClubSchedulePage } from '@/pages/clubAdmin/ClubSchedulePage';
import { ClubCourtsPage } from '@/pages/clubAdmin/ClubCourtsPage';
import { ClubSettingsPage } from '@/pages/clubAdmin/ClubSettingsPage';
import { ClubReservationsPage } from '@/pages/clubAdmin/ClubReservationsPage';

function ClubAdminShellFrame() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { screen } = useClubAdminShell();
  const direction = navigationType === 'POP' ? -1 : 1;
  const routeKey = clubAdminRouteKey(location.pathname);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [routeKey]);

  return (
    <ClubAdminScrollContext.Provider value={scrollRef}>
      <div className="safe-area-all flex h-dvh max-h-dvh flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
        <header className="z-30 flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <button
            type="button"
            className="rounded-full p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            onClick={() => navigate(screen.backTo)}
            aria-label={t('common.back')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 truncate text-lg font-semibold text-gray-900 dark:text-white">{screen.title}</h1>
          {screen.actions ?? <span className="w-9" aria-hidden />}
        </header>

        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
        >
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={routeKey}
              custom={direction}
              variants={reduceMotion ? undefined : CLUB_ADMIN_PAGE_VARIANTS}
              initial={reduceMotion ? false : 'enter'}
              animate="center"
              exit={reduceMotion ? undefined : 'exit'}
              transition={reduceMotion ? { duration: 0 } : CLUB_ADMIN_PAGE_TRANSITION}
              className="min-h-full p-3"
            >
              <Routes location={location}>
                <Route index element={<MyClubsPage />} />
                <Route path=":clubId" element={<ClubAdminHomePage />} />
                <Route path=":clubId/schedule" element={<ClubSchedulePage />} />
                <Route path=":clubId/reservations" element={<ClubReservationsPage />} />
                <Route path=":clubId/courts" element={<ClubCourtsPage />} />
                <Route path=":clubId/settings" element={<ClubSettingsPage />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </ClubAdminScrollContext.Provider>
  );
}

export default function ClubManagementApp() {
  return (
    <ClubAdminShellProvider>
      <ClubAdminShellFrame />
    </ClubAdminShellProvider>
  );
}
