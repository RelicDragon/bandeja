/**
 * Responsive console frame.
 *   Phone:   top bar (club switcher or back + title, page actions) · content · bottom tab bar.
 *   Desktop (lg): sidebar (club switcher, sections, exit) · top bar (title, actions) · wide content.
 * Sections are filtered by capability. Back pops real history (POP animation) and only falls
 * back to the section root when there is nothing in-app to pop.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  CloudOff,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { ClubAvatar } from '@/components/ClubAvatar';
import { ClubAdminScrollContext } from '@/components/clubAdmin/ClubAdminScrollContext';
import { cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { useNetworkStore } from '@/utils/networkStatus';
import { useClubConsole } from './clubConsoleContextValue';
import { useConsoleBack } from './useConsoleBack';
import { ClubSwitcherSheet } from './ClubSwitcherSheet';
import { ConsoleChromeContext, EMPTY_HEADER, type ConsoleHeaderState } from './consoleChrome';
import {
  consoleDepth,
  consoleSubPath,
  sectionFromPath,
  sectionPath,
  visibleSections,
  type ConsoleSectionId,
} from './consoleNav';

const SECTION_ICON: Record<ConsoleSectionId, LucideIcon> = {
  today: LayoutDashboard,
  schedule: CalendarDays,
  bookings: ListChecks,
  reports: BarChart3,
  club: Building2,
};

const EASE = [0.32, 0.72, 0, 1] as const;

function ClubSwitcherButton({ subtitle, onOpen, wide }: { subtitle?: string; onOpen: () => void; wide?: boolean }) {
  const { t } = useTranslation('clubAdmin');
  const { context } = useClubConsole();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={t('switcher.open', { club: context.club.name })}
      className={cx(
        'flex min-w-0 items-center gap-2.5 rounded-xl text-start transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        wide ? 'w-full p-2' : 'max-w-full px-1.5 py-1'
      )}
    >
      <ClubAvatar
        club={{ id: context.club.id, name: context.club.name, avatar: context.club.avatar }}
        className={wide ? 'h-10 w-10 shrink-0' : 'h-8 w-8 shrink-0'}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">{context.club.name}</span>
        <span className="block truncate text-xs leading-tight text-muted-foreground">
          {subtitle ?? context.club.cityName}
        </span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function Sidebar({ onOpenSwitcher }: { onOpenSwitcher: () => void }) {
  const { t } = useTranslation('clubAdmin');
  const { clubId, context } = useClubConsole();
  const location = useLocation();
  const active = sectionFromPath(location.pathname);
  const sections = visibleSections(context.capabilities);
  const linkCls = (on: boolean) =>
    cx(
      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
      on ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );
  return (
    <aside className="safe-area-top hidden w-64 shrink-0 flex-col border-e border-border bg-ca-surface lg:flex">
      <div className="p-3">
        <ClubSwitcherButton wide onOpen={onOpenSwitcher} />
      </div>
      <nav aria-label={t('nav.sections')} className="flex-1 space-y-0.5 px-3">
        {sections.map((s) => {
          const Icon = SECTION_ICON[s.id];
          const on = s.id === active;
          return (
            <NavLink key={s.id} to={sectionPath(clubId, s.id)} end={s.id === 'today'} className={linkCls(on)} aria-current={on ? 'page' : undefined}>
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {t(`nav.${s.id}`)}
            </NavLink>
          );
        })}
      </nav>
      <div className="safe-area-bottom space-y-0.5 border-t border-border p-3">
        <NavLink to="/my-clubs" className={linkCls(false)}>
          <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />
          {t('switcher.allClubs')}
        </NavLink>
        <NavLink to="/" className={linkCls(false)}>
          <LogOut className="h-[18px] w-[18px] rtl:-scale-x-100" aria-hidden />
          {t('nav.backToApp')}
        </NavLink>
      </div>
    </aside>
  );
}

function BottomTabs() {
  const { t } = useTranslation('clubAdmin');
  const { clubId, context } = useClubConsole();
  const location = useLocation();
  const active = sectionFromPath(location.pathname);
  const sections = visibleSections(context.capabilities);
  return (
    <nav
      aria-label={t('nav.sections')}
      className="safe-area-bottom shrink-0 border-t border-border bg-ca-surface/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {sections.map((s) => {
          const Icon = SECTION_ICON[s.id];
          const on = s.id === active;
          return (
            <li key={s.id} className="flex-1">
              <NavLink
                to={sectionPath(clubId, s.id)}
                end={s.id === 'today'}
                replace
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                  on ? 'text-primary-600 dark:text-primary-400' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
                <span className="max-w-full truncate px-1">{t(`nav.${s.id}`)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ConsoleLayout({ children }: { children: (location: ReturnType<typeof useLocation>) => ReactNode }) {
  const { t } = useTranslation('clubAdmin');
  const location = useLocation();
  const navigationType = useNavigationType();
  const reduceMotion = useReducedMotion();
  const back = useConsoleBack();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { clubId } = useClubConsole();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [header, setHeader] = useState<ConsoleHeaderState>(EMPTY_HEADER);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const chrome = useMemo(() => ({ setHeader, actionsSlot }), [actionsSlot]);

  const section = sectionFromPath(location.pathname);
  const depth = consoleDepth(location.pathname);
  const routeKey = consoleSubPath(location.pathname).join('/') || 'today';
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [routeKey]);
  const isPop = navigationType === 'POP';
  const showBack = !!header.backTo;
  const sectionTitle = t(`nav.${section}`);
  const title = header.title || sectionTitle;

  const variants = {
    enter: (d: number) => (d === 0 ? { opacity: 0 } : { opacity: 0, x: `${d * 6}%` }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (d === 0 ? { opacity: 0 } : { opacity: 0, x: `${-d * 6}%` }),
  };
  const direction = depth > 0 || showBack ? (isPop ? -1 : 1) : 0;

  return (
    <ConsoleChromeContext.Provider value={chrome}>
      <ClubAdminScrollContext.Provider value={scrollRef}>
        <div className="safe-area-left safe-area-right flex h-dvh max-h-dvh overflow-hidden bg-background text-foreground">
          <Sidebar onOpenSwitcher={() => setSwitcherOpen(true)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="safe-area-top z-30 shrink-0 border-b border-border bg-ca-surface/95 backdrop-blur">
              <div className="flex h-14 items-center gap-1.5 px-2 lg:px-5">
                {showBack ? (
                  <>
                    <button
                      type="button"
                      className={iconButtonClass}
                      onClick={() => back(header.backTo ?? sectionPath(clubId, section))}
                      aria-label={t('common.back')}
                    >
                      <ChevronLeft className="h-6 w-6 rtl:-scale-x-100" aria-hidden />
                    </button>
                    <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 lg:hidden">
                      <ClubSwitcherButton subtitle={title} onOpen={() => setSwitcherOpen(true)} />
                    </div>
                    <h1 className="sr-only lg:not-sr-only lg:min-w-0 lg:flex-1 lg:truncate lg:text-xl lg:font-semibold">{title}</h1>
                  </>
                )}
                <div ref={setActionsSlot} className="flex shrink-0 items-center gap-1" />
              </div>
              {!isOnline ? (
                <div className="flex items-center gap-2 border-t border-border bg-ca-warn-bg px-4 py-1.5 text-xs font-medium text-ca-warn" role="status">
                  <CloudOff className="h-3.5 w-3.5" aria-hidden />
                  {t('states.offline.banner')}
                </div>
              ) : null}
            </header>
            <main
              ref={scrollRef}
              id="club-console-main"
              className={cx(
                'relative min-h-0 flex-1',
                header.fill ? 'overflow-hidden' : 'overflow-x-hidden overflow-y-auto overscroll-y-contain'
              )}
            >
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={routeKey}
                  custom={direction}
                  variants={reduceMotion ? undefined : variants}
                  initial={reduceMotion ? false : 'enter'}
                  animate="center"
                  exit={reduceMotion ? undefined : 'exit'}
                  transition={{ duration: reduceMotion ? 0 : 0.16, ease: EASE }}
                  className={header.fill ? 'h-full' : 'min-h-full'}
                >
                  {children(location)}
                </motion.div>
              </AnimatePresence>
            </main>
            <BottomTabs />
          </div>
        </div>
        <ClubSwitcherSheet open={switcherOpen} onOpenChange={setSwitcherOpen} currentClubId={clubId} />
      </ClubAdminScrollContext.Provider>
    </ConsoleChromeContext.Provider>
  );
}
