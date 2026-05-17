import React, {
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { Calendar, ChevronLeft, ChevronRight, Loader2, User as UserIcon } from 'lucide-react';
import { Card, PlayerAvatar, SegmentedSwitch, Select, type SegmentedSwitchTab } from '@/components';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { LeaguePlannerDetailSheet } from './LeaguePlannerDetailSheet';

const LeaguePlannerGrid = lazy(() =>
  import('./LeaguePlannerGrid').then((m) => ({ default: m.LeaguePlannerGrid }))
);
import { WeeklyAvailabilityPanel } from '@/components/availability';
import {
  leaguesApi,
  type LeaguePlannerDay,
  type LeaguePlannerDayHour,
  type LeaguePlannerPayload,
  type LeagueStanding,
} from '@/api/leagues';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatHour } from '@/utils/availability/format';
import type { BasicUser, User } from '@/types';
import { getGroupFilter, setGroupFilter } from '@/utils/groupFilterStorage';
import { getAppDateFnsLocale } from '@/utils/dateFormat';

const ALL_GROUP_ID = 'ALL';

type ScopeMode = 'my' | 'all' | 'group' | 'pick';

interface LeaguePlannerTabProps {
  leagueSeasonId: string;
  hasFixedTeams: boolean;
  /** When false, data fetching is paused (e.g. hidden schedule sub-panel). */
  isVisible?: boolean;
}

function scopeStorageKey(leagueSeasonId: string) {
  return `leaguePlanner.scope.${leagueSeasonId}`;
}

function loadScope(leagueSeasonId: string): { mode: ScopeMode; pickValue: string } {
  let mode: ScopeMode = 'all';
  let pickValue = '';
  try {
    const raw = localStorage.getItem(scopeStorageKey(leagueSeasonId));
    if (!raw) return { mode: 'all', pickValue: '' };
    const j = JSON.parse(raw) as { mode?: string; pickValue?: string };
    if (j.mode === 'my' || j.mode === 'all' || j.mode === 'group' || j.mode === 'pick') mode = j.mode;
    if (typeof j.pickValue === 'string') pickValue = j.pickValue;
  } catch {
    /* ignore */
  }
  return { mode, pickValue };
}

function saveScope(leagueSeasonId: string, mode: ScopeMode, pickValue: string) {
  try {
    localStorage.setItem(scopeStorageKey(leagueSeasonId), JSON.stringify({ mode, pickValue }));
  } catch {
    /* ignore */
  }
}

function LeaguePlannerMyTabIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  const user = useAuthStore((s) => s.user);
  const dim = size ?? 18;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-gray-300/90 dark:ring-gray-500 ${className}`}
      style={{ width: dim, height: dim }}
    >
      {user ? (
        <PlayerAvatar
          player={user as BasicUser}
          superTiny
          showName={false}
          subscribePresence={false}
          asDiv
          isCurrentUser
        />
      ) : (
        <UserIcon className="h-[55%] w-[55%] text-gray-500 dark:text-gray-400" strokeWidth={2} aria-hidden />
      )}
    </span>
  );
}

export const LeaguePlannerTab = ({ leagueSeasonId, hasFixedTeams, isVisible = true }: LeaguePlannerTabProps) => {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = useMemo(() => getAppDateFnsLocale(i18n.language), [i18n.language]);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const display = useMemo(() => resolveDisplaySettings(user), [user]);
  const weekStartsOn = display.weekStart === 0 ? 0 : 1;

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [hasGroups, setHasGroups] = useState(false);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode>(() => loadScope(leagueSeasonId).mode);
  const [pickValue, setPickValue] = useState(() => loadScope(leagueSeasonId).pickValue);
  const [planner, setPlanner] = useState<LeaguePlannerPayload | null>(null);
  const [loading, setLoading] = useState(() => loadScope(leagueSeasonId).mode !== 'my');
  const [loadFailed, setLoadFailed] = useState(false);
  const [sheet, setSheet] = useState<{
    day: LeaguePlannerDay;
    slot: LeaguePlannerDayHour;
  } | null>(null);

  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  const lastFetchedLeagueSeasonIdRef = useRef<string | null>(null);
  const plannerFetchSerialRef = useRef(0);
  const deferredPlanner = useDeferredValue(planner);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const weekStartStr = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn });
    const shifted = addWeeks(base, weekOffset);
    return format(shifted, 'yyyy-MM-dd');
  }, [weekOffset, weekStartsOn]);

  const weekRangeLabel = useMemo(() => {
    const start = parseISO(weekStartStr);
    const end = addDays(start, 6);
    return `${format(start, 'd MMM', { locale: dateFnsLocale })} – ${format(end, 'd MMM yyyy', { locale: dateFnsLocale })}`;
  }, [weekStartStr, dateFnsLocale]);

  useEffect(() => {
    setWeekOffset((o) => Math.max(0, o));
  }, [weekStartsOn]);

  useEffect(() => {
    const sc = loadScope(leagueSeasonId);
    setScopeMode(sc.mode);
    setPickValue(sc.pickValue);
    setPlanner(null);
    setLoadFailed(false);
    setLoading(sc.mode !== 'my');
    lastFetchedLeagueSeasonIdRef.current = null;
  }, [leagueSeasonId]);

  useEffect(() => {
    if (!hasGroups && scopeMode === 'group') setScopeMode('all');
  }, [hasGroups, scopeMode]);

  useEffect(() => {
    saveScope(leagueSeasonId, scopeMode, pickValue);
  }, [leagueSeasonId, scopeMode, pickValue]);

  useEffect(() => {
    const load = async () => {
      const saved = await getGroupFilter(leagueSeasonId);
      if (saved) setSelectedGroupId(saved);
    };
    void load();
  }, [leagueSeasonId]);

  useEffect(() => {
    void setGroupFilter(leagueSeasonId, selectedGroupId);
  }, [leagueSeasonId, selectedGroupId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const gr = await leaguesApi.getGroups(leagueSeasonId);
        if (cancelled) return;
        const g = gr.data.groups;
        setGroups(g.map((x) => ({ id: x.id, name: x.name, color: x.color ?? undefined })));
        setHasGroups(g.length > 0);
      } catch {
        if (!cancelled) {
          setGroups([]);
          setHasGroups(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const st = await leaguesApi.getStandings(leagueSeasonId);
        if (!cancelled) setStandings(st.data);
      } catch {
        if (!cancelled) setStandings([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  const pickIntersectIds = useMemo(() => {
    if (scopeMode !== 'pick' || !pickValue) return null;
    if (hasFixedTeams && pickValue.startsWith('team:')) {
      const standingId = pickValue.slice('team:'.length);
      const row = standings.find((s) => s.id === standingId);
      const ids =
        row?.leagueTeam?.players?.map((p) => p.userId).filter((x): x is string => !!x && x.trim().length > 0) ?? [];
      return ids.length >= 2 ? ids : null;
    }
    if (!hasFixedTeams && pickValue.startsWith('user:')) {
      const uid = pickValue.slice('user:'.length);
      return uid ? [uid] : null;
    }
    return null;
  }, [scopeMode, pickValue, hasFixedTeams, standings]);

  const fetchPlanner = useCallback(async () => {
    if (scopeMode === 'my') return;
    if (!user?.id) {
      setPlanner(null);
      setLoading(false);
      lastFetchedLeagueSeasonIdRef.current = null;
      return;
    }
    const fetchSerial = ++plannerFetchSerialRef.current;
    const warmShell =
      lastFetchedLeagueSeasonIdRef.current === leagueSeasonId && plannerRef.current !== null;
    startTransition(() => {
      setLoading(true);
      if (!warmShell) setLoadFailed(false);
    });
    if (lastFetchedLeagueSeasonIdRef.current !== leagueSeasonId) {
      startTransition(() => setPlanner(null));
    }
    try {
      const groupId =
        scopeMode === 'group' && selectedGroupId !== ALL_GROUP_ID ? selectedGroupId : undefined;
      const pickAggregatePending =
        scopeMode === 'pick' &&
        (!pickIntersectIds || pickIntersectIds.length < (hasFixedTeams ? 2 : 1));
      const aggregateUserId =
        scopeMode === 'pick' &&
        !pickAggregatePending &&
        !hasFixedTeams &&
        pickIntersectIds?.length === 1
          ? pickIntersectIds[0]
          : undefined;
      const aggregateIntersectUserIds =
        scopeMode === 'pick' &&
        !pickAggregatePending &&
        hasFixedTeams &&
        pickIntersectIds &&
        pickIntersectIds.length >= 2
          ? pickIntersectIds
          : undefined;

      const res = await leaguesApi.getPlanner(leagueSeasonId, {
        weekStart: weekStartStr,
        groupId,
        aggregateUserId,
        aggregateIntersectUserIds: aggregateIntersectUserIds ?? undefined,
        pickAggregatePending,
      });
      if (fetchSerial !== plannerFetchSerialRef.current) return;
      startTransition(() => {
        setPlanner(res.data);
        setLoadFailed(false);
        setLoading(false);
      });
      lastFetchedLeagueSeasonIdRef.current = leagueSeasonId;
    } catch (e: unknown) {
      if (fetchSerial !== plannerFetchSerialRef.current) return;
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(t(msg || 'errors.generic'));
      startTransition(() => {
        setPlanner(null);
        setLoadFailed(true);
        setLoading(false);
      });
      lastFetchedLeagueSeasonIdRef.current = null;
    }
  }, [
    user?.id,
    leagueSeasonId,
    weekStartStr,
    selectedGroupId,
    scopeMode,
    hasFixedTeams,
    pickIntersectIds,
    t,
  ]);

  useEffect(() => {
    if (!isVisible) return;
    if (scopeMode === 'my') {
      plannerFetchSerialRef.current += 1;
      setPlanner(null);
      setLoading(false);
      return;
    }
    void fetchPlanner();
  }, [isVisible, scopeMode, fetchPlanner]);

  const pickOptions = useMemo(() => {
    const gFilter = scopeMode === 'group' ? selectedGroupId : ALL_GROUP_ID;
    const opts: { value: string; label: string }[] = [];
    if (hasFixedTeams) {
      for (const s of standings) {
        if (gFilter !== ALL_GROUP_ID && s.currentGroupId !== gFilter) continue;
        const players = s.leagueTeam?.players ?? [];
        const label = players.map((p) => p.user?.firstName || '?').join(' · ') || t('gameDetails.planner.teamFallback');
        opts.push({ value: `team:${s.id}`, label });
      }
    } else {
      for (const s of standings) {
        if (!s.userId || !s.user) continue;
        if (gFilter !== ALL_GROUP_ID && s.currentGroupId !== gFilter) continue;
        const u = s.user;
        opts.push({
          value: `user:${s.userId}`,
          label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.id,
        });
      }
    }
    return opts;
  }, [standings, hasFixedTeams, selectedGroupId, scopeMode, t]);

  useEffect(() => {
    if (scopeMode !== 'group' || !hasGroups) return;
    if (selectedGroupId !== ALL_GROUP_ID) return;
    const first = groups[0]?.id;
    if (first) setSelectedGroupId(first);
  }, [scopeMode, hasGroups, selectedGroupId, groups]);

  const scopeTabs = useMemo<SegmentedSwitchTab[]>(() => {
    const tabs: SegmentedSwitchTab[] = [
      {
        id: 'my',
        label: '',
        icon: LeaguePlannerMyTabIcon,
        ariaLabel: t('gameDetails.planner.scopeMy'),
      },
      { id: 'all', label: t('gameDetails.planner.scopeAll') },
    ];
    if (hasGroups) tabs.push({ id: 'group', label: t('gameDetails.planner.scopeGroup') });
    tabs.push({
      id: 'pick',
      label: hasFixedTeams ? t('gameDetails.planner.scopeTeams') : t('gameDetails.planner.scopePlayers'),
    });
    return tabs;
  }, [t, hasGroups, hasFixedTeams]);

  const activeScopeTabId = scopeMode === 'group' && !hasGroups ? 'all' : scopeMode;

  const onScopeTab = (id: string) => {
    if (id === 'group' && !hasGroups) return;
    const next = id as ScopeMode;
    setScopeMode(next);
    if (id !== 'pick') setPickValue('');
    if (next === 'my') {
      setLoading(false);
      setLoadFailed(false);
    } else if (next !== scopeMode) {
      setLoading(true);
      setLoadFailed(false);
    }
  };

  const plannerSlotKey = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => `${day.date}|${slot.hour}`;

  const openSheet = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => setSheet({ day, slot });

  const activatePlannerCell = (day: LeaguePlannerDay, slot: LeaguePlannerDayHour) => {
    if (day.isPast) return;
    openSheet(day, slot);
  };

  const plannerPending =
    scopeMode !== 'my' && (loading || (planner !== null && planner !== deferredPlanner));

  const weekSelectorRow = user ? (
    <motion.div layout className="mx-auto flex w-full max-w-md flex-nowrap items-center justify-center gap-1.5">
      <motion.div
        layout
        className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-800"
      >
        <button
          type="button"
          disabled={weekOffset <= 0}
          onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
          className={[
            'flex shrink-0 items-center justify-center border-r border-gray-200 px-2 py-1.5 transition dark:border-gray-600',
            weekOffset <= 0
              ? 'cursor-not-allowed opacity-40'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700',
          ].join(' ')}
          aria-label={t('gameDetails.planner.prevWeek')}
        >
          <ChevronLeft className="h-4 w-4 text-gray-700 dark:text-gray-200" />
        </button>
        <motion.div
          layout
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden />
          <span className="truncate tabular-nums">{weekRangeLabel}</span>
        </motion.div>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o + 1)}
          className="flex shrink-0 items-center justify-center border-l border-gray-200 px-2 py-1.5 transition hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
          aria-label={t('gameDetails.planner.nextWeek')}
        >
          <ChevronRight className="h-4 w-4 text-gray-700 dark:text-gray-200" />
        </button>
      </motion.div>
      <AnimatePresence initial={false}>
        {weekOffset !== 0 && (
          <motion.button
            key="planner-this-week"
            type="button"
            layout
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={() => {
              setWeekOffset(0);
              void fetchPlanner();
            }}
            className="shrink-0 whitespace-nowrap rounded-lg border border-primary-400/50 bg-white px-2 py-1.5 text-[11px] font-semibold text-primary-800 shadow-sm hover:bg-gray-50 dark:border-primary-500/40 dark:bg-gray-800 dark:text-primary-300 dark:hover:bg-gray-700"
          >
            {t('gameDetails.planner.thisWeek')}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  ) : null;

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-4">
      <SegmentedSwitch
        tabs={scopeTabs}
        activeId={activeScopeTabId}
        onChange={onScopeTab}
        showOnlyActiveTabText={false}
        layoutId={`leaguePlannerScope-${leagueSeasonId}`}
      />
      <AnimatePresence initial={false}>
        {scopeMode === 'group' && hasGroups && (
          <motion.div
            key="planner-group-scope"
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="pt-1">
              <GroupFilterDropdown
                selectedGroupId={selectedGroupId}
                groups={groups}
                allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
                onSelect={setSelectedGroupId}
                allGroupId={ALL_GROUP_ID}
                showAllOption={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {scopeMode === 'pick' && (
        <Select
          className="w-full"
          value={pickValue}
          onChange={setPickValue}
          placeholder={t('gameDetails.planner.pickPlaceholder')}
          options={[
            { value: '', label: t('gameDetails.planner.pickPlaceholder') },
            ...pickOptions.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
      )}

      {!loading && user && scopeMode === 'my' && (
        <Card className="border-primary-200/80 dark:border-primary-900/40">
          <WeeklyAvailabilityPanel
            value={user.weeklyAvailability ?? null}
            onChange={async (wa) => {
              const res = await usersApi.updateProfile({ weeklyAvailability: wa });
              updateUser(res.data as User);
            }}
            savedBucketBoundaries={user.availabilityBucketBoundaries}
            onPersistBucketBoundaries={async (b) => {
              const res = await usersApi.updateProfile({ availabilityBucketBoundaries: b });
              updateUser(res.data as User);
            }}
            timeFormat={user.timeFormat}
            hourPeriodLayoutId={`leaguePlannerAvailabilityHour-${leagueSeasonId}`}
            showScheduleVisibilitySelector={false}
          />
        </Card>
      )}

      {user && scopeMode !== 'my' && !deferredPlanner && !loadFailed && (
        <div className="space-y-3">
          {weekSelectorRow}
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          </div>
        </div>
      )}

      {!user && (
        <Card className="border border-gray-200 text-center dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.plannerLoginHint')}</p>
        </Card>
      )}

      {user && !loading && !planner && loadFailed && scopeMode !== 'my' && (
        <div className="space-y-3">
          {weekSelectorRow}
          <Card className="flex flex-col items-center gap-3 border border-gray-200 dark:border-gray-700">
            <p className="text-center text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.loadFailed')}</p>
            <button
              type="button"
              onClick={() => void fetchPlanner()}
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              {t('gameDetails.planner.retry')}
            </button>
          </Card>
        </div>
      )}

      {deferredPlanner && scopeMode !== 'my' && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">{weekSelectorRow}</div>
          <div className="relative">
            {plannerPending && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-gray-900/70"
                aria-busy
                aria-live="polite"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
                </div>
              }
            >
              <LeaguePlannerGrid
                planner={deferredPlanner}
                todayStr={todayStr}
                dateFnsLocale={dateFnsLocale}
                timeFormat={user?.timeFormat}
                onCellActivate={activatePlannerCell}
              />
            </Suspense>
          </div>
        </div>
      )}

      {sheet && planner && (
        <LeaguePlannerDetailSheet
          isOpen
          onClose={() => setSheet(null)}
          dateLabel={format(parseISO(sheet.day.date), 'EEEE d MMMM', { locale: dateFnsLocale })}
          slotLabel={formatHour(sheet.slot.hour, user?.timeFormat)}
          freeCount={sheet.slot.freeCount}
          busyCount={sheet.slot.busyCount}
          schedulableGameIds={planner.schedulableBySlot[plannerSlotKey(sheet.day, sheet.slot)] ?? []}
          unscheduledGames={planner.unscheduledGames}
        />
      )}
    </div>
  );
};
