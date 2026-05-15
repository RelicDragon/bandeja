import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import { Calendar, ChevronLeft, ChevronRight, Loader2, User as UserIcon } from 'lucide-react';
import { Card, PlayerAvatar, SegmentedSwitch, Select, type SegmentedSwitchTab } from '@/components';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { LeaguePlannerDetailSheet } from './LeaguePlannerDetailSheet';
import { AvailabilityMobileGrid } from '@/components/availability/AvailabilityMobileGrid';
import { BUCKET_META } from '@/components/availability/bucketMeta';
import {
  leaguesApi,
  type LeaguePlannerDay,
  type LeaguePlannerDayBucket,
  type LeaguePlannerPayload,
  type LeaguePlannerBucketId,
  type LeagueStanding,
} from '@/api/leagues';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAvailabilityEditor } from '@/hooks/useAvailabilityEditor';
import { parseAvailabilityBucketBoundaries } from '@/utils/availability';
import { getShortDayLabel } from '@/utils/availability/format';
import type { BasicUser, User, WeekdayKey } from '@/types';
import { getGroupFilter, setGroupFilter } from '@/utils/groupFilterStorage';
import { getAppDateFnsLocale } from '@/utils/dateFormat';

const ALL_GROUP_ID = 'ALL';
const BUCKET_ORDER: LeaguePlannerBucketId[] = ['night', 'morning', 'afternoon', 'evening'];

const PLANNER_FACE_SM_PX = 24;
const PLANNER_AV_OVERLAP_PX = 6;

function plannerAvatarRowWidthPx(itemCount: number, facePx: number): number {
  if (itemCount <= 0) return 0;
  return facePx + (itemCount - 1) * (facePx - PLANNER_AV_OVERLAP_PX);
}

function maxPlannerFacesThatFit(containerWidth: number, facePx: number, sampleLen: number, freeCount: number): number {
  if (freeCount <= 0 || containerWidth <= 0) return 0;
  const maxK = Math.min(sampleLen, freeCount);
  for (let k = maxK; k >= 1; k--) {
    const needBadge = freeCount > k;
    const items = needBadge ? k + 1 : k;
    if (plannerAvatarRowWidthPx(items, facePx) <= containerWidth) return k;
  }
  if (plannerAvatarRowWidthPx(1, facePx) <= containerWidth) return 0;
  return 0;
}

function PlannerCellAvatarRow({
  sampleFreeUsers,
  freeCount,
}: {
  sampleFreeUsers: LeaguePlannerDayBucket['sampleFreeUsers'];
  freeCount: number;
}) {
  const facePx = PLANNER_FACE_SM_PX;
  const avatarFaceSize = 'sm' as const;
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleFaces, setVisibleFaces] = useState(() => Math.min(sampleFreeUsers.length, freeCount));

  const recompute = useCallback(() => {
    const el = measureRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    setVisibleFaces(maxPlannerFacesThatFit(w, facePx, sampleFreeUsers.length, freeCount));
  }, [facePx, sampleFreeUsers.length, freeCount]);

  useLayoutEffect(() => {
    recompute();
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recompute]);

  if (freeCount <= 0) return null;

  const overflowCircleClass = 'h-6 w-6 text-[8px] leading-none';

  const shellClass = 'w-full min-w-0 overflow-hidden';

  const needBadge = freeCount > visibleFaces;
  const rest = freeCount - visibleFaces;
  const restLabel = rest > 99 ? '99+' : `${rest}+`;

  return (
    <div ref={measureRef} className={shellClass}>
      <div className="flex items-center justify-start -space-x-1.5">
      {sampleFreeUsers.slice(0, visibleFaces).map((u) => (
        <span key={u.id} className="flex shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900">
          <PlayerAvatar
            player={u as BasicUser}
            inlineFace
            inlineFacePlain
            inlineFaceSize={avatarFaceSize}
            showName={false}
            subscribePresence={false}
            asDiv
          />
        </span>
      ))}
      {needBadge && rest > 0 && (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-bold tabular-nums text-gray-800 ring-2 ring-white dark:bg-gray-600 dark:text-gray-100 dark:ring-gray-900 ${overflowCircleClass}`}
          aria-label={rest > 99 ? '99 or more additional' : `${rest} additional`}
        >
          {restLabel}
        </span>
      )}
      </div>
    </div>
  );
}

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
  try {
    const raw = localStorage.getItem(scopeStorageKey(leagueSeasonId));
    if (!raw) return { mode: 'my', pickValue: '' };
    const j = JSON.parse(raw) as { mode?: ScopeMode; pickValue?: string };
    if (j.mode === 'my' || j.mode === 'group' || j.mode === 'pick' || j.mode === 'all') {
      return { mode: j.mode, pickValue: typeof j.pickValue === 'string' ? j.pickValue : '' };
    }
    if (j.mode === 'me') return { mode: 'my', pickValue: '' };
  } catch {
    /* ignore */
  }
  return { mode: 'my', pickValue: '' };
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
  const [sheet, setSheet] = useState<{
    day: LeaguePlannerDay;
    bucket: LeaguePlannerDay['buckets'][0];
  } | null>(null);

  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  const lastFetchedLeagueSeasonIdRef = useRef<string | null>(null);
  const plannerFetchSerialRef = useRef(0);

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

  const plannerVisibleDays = useMemo(() => {
    if (!planner) return [];
    return planner.days.filter((d) => d.date >= todayStr);
  }, [planner, todayStr]);

  useEffect(() => {
    setWeekOffset((o) => Math.max(0, o));
  }, [weekStartsOn]);

  useEffect(() => {
    const { mode, pickValue: pv } = loadScope(leagueSeasonId);
    setScopeMode(mode);
    setPickValue(pv);
    setLoading(mode !== 'my');
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
    if (scopeMode === 'my') {
      setLoading(false);
      return;
    }
    if (!user?.id) {
      setPlanner(null);
      setLoading(false);
      lastFetchedLeagueSeasonIdRef.current = null;
      return;
    }
    const fetchSerial = ++plannerFetchSerialRef.current;
    const warmShell =
      lastFetchedLeagueSeasonIdRef.current === leagueSeasonId && plannerRef.current !== null;
    if (!warmShell) setLoading(true);
    if (lastFetchedLeagueSeasonIdRef.current !== leagueSeasonId) setPlanner(null);
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
      setPlanner(res.data);
      lastFetchedLeagueSeasonIdRef.current = leagueSeasonId;
    } catch (e: unknown) {
      if (fetchSerial !== plannerFetchSerialRef.current) return;
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(t(msg || 'errors.generic'));
      setPlanner(null);
      lastFetchedLeagueSeasonIdRef.current = null;
    } finally {
      if (fetchSerial === plannerFetchSerialRef.current) setLoading(false);
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

  const bucketBoundaries = useMemo(
    () => parseAvailabilityBucketBoundaries(user?.availabilityBucketBoundaries),
    [user?.availabilityBucketBoundaries]
  );

  const editor = useAvailabilityEditor({
    initial: user?.weeklyAvailability,
    onCommit: async (wa) => {
      const res = await usersApi.updateProfile({ weeklyAvailability: wa });
      updateUser(res.data as User);
      void fetchPlanner();
    },
    bucketBoundaries,
  });

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
    setScopeMode(id as ScopeMode);
    if (id !== 'pick') setPickValue('');
  };

  const longPressRef = useRef<{ t: number; x: number; y: number; cell: { day: LeaguePlannerDay; b: LeaguePlannerDay['buckets'][0] } | null }>({
    t: 0,
    x: 0,
    y: 0,
    cell: null,
  });

  const openSheet = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0]) => setSheet({ day, bucket: b });

  const clearLongPress = () => {
    longPressRef.current = { t: 0, x: 0, y: 0, cell: null };
  };

  const isSchedulableSlot = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0]) => {
    if (!planner || day.isPast) return false;
    return (planner.schedulableBySlot[`${day.date}|${b.bucket}`] ?? []).length > 0;
  };

  const renderCellInner = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0]) => {
    const schedulable = isSchedulableSlot(day, b);
    const meta = BUCKET_META[b.bucket];
    const ring = schedulable ? (
      <span
        className="pointer-events-none absolute inset-0.5 rounded-lg ring-2 ring-emerald-500/80 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
        aria-hidden
      />
    ) : null;
    const avatars = <PlannerCellAvatarRow sampleFreeUsers={b.sampleFreeUsers} freeCount={b.freeCount} />;
    return (
      <div className="relative flex h-full min-h-[3rem] w-full min-w-0 flex-col items-stretch justify-center gap-0.5 p-1">
        {ring}
        <div className="flex w-full min-w-0 flex-col items-center justify-center gap-0.5">
          <span className="sr-only">{t(meta.labelKey)}</span>
          {avatars}
        </div>
      </div>
    );
  };

  const handleCellPointerDown = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0], e: React.PointerEvent) => {
    if (day.isPast) return;
    longPressRef.current = { t: Date.now(), x: e.clientX, y: e.clientY, cell: { day, b } };
  };

  const handleCellPointerUp = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0], e: React.PointerEvent) => {
    if (day.isPast) return;
    const ref = longPressRef.current;
    clearLongPress();
    if (!ref.cell || ref.cell.day.date !== day.date || ref.cell.b.bucket !== b.bucket) return;
    const dt = Date.now() - ref.t;
    const moved = Math.abs(e.clientX - ref.x) > 12 || Math.abs(e.clientY - ref.y) > 12;
    if (dt >= 480 || !moved) {
      openSheet(day, b);
    }
  };

  const plannerDayShortLabel = (day: LeaguePlannerDay) =>
    `${getShortDayLabel(t, day.weekdayKey as WeekdayKey)} ${format(parseISO(day.date), 'd', { locale: dateFnsLocale })}`;

  const weekSelectorRow = user ? (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={weekOffset <= 0}
        onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
        className={[
          'rounded-xl border border-gray-200 bg-white p-2 shadow-sm transition dark:border-gray-600 dark:bg-gray-800',
          weekOffset <= 0
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700',
        ].join(' ')}
        aria-label={t('gameDetails.planner.prevWeek')}
      >
        <ChevronLeft className="h-5 w-5 text-gray-800 dark:text-gray-100" />
      </button>
      <div className="flex min-w-[10rem] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
        <Calendar className="h-4 w-4 text-primary-500" />
        <span className="tabular-nums">{weekRangeLabel}</span>
      </div>
      <button
        type="button"
        onClick={() => setWeekOffset((o) => o + 1)}
        className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
        aria-label={t('gameDetails.planner.nextWeek')}
      >
        <ChevronRight className="h-5 w-5 text-gray-800 dark:text-gray-100" />
      </button>
      <AnimatePresence initial={false}>
        {weekOffset !== 0 && (
          <motion.button
            key="planner-this-week"
            type="button"
            layout
            initial={{ opacity: 0, scale: 0.92, x: 6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={() => {
              setWeekOffset(0);
              void fetchPlanner();
            }}
            className="rounded-xl border border-primary-400/50 bg-white px-3 py-2 text-xs font-semibold text-primary-800 shadow-sm hover:bg-gray-50 dark:border-primary-500/40 dark:bg-gray-800 dark:text-primary-300 dark:hover:bg-gray-700"
          >
            {t('gameDetails.planner.thisWeek')}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
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
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.editorHint')}</p>
          <AvailabilityMobileGrid editor={editor} boundaries={bucketBoundaries} />
        </Card>
      )}

      {user && loading && scopeMode !== 'my' && weekSelectorRow && <div className="py-3">{weekSelectorRow}</div>}

      {loading && scopeMode !== 'my' && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
        </div>
      )}

      {!loading && !user && (
        <Card className="border border-gray-200 text-center dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.plannerLoginHint')}</p>
        </Card>
      )}

      {user && !loading && !planner && scopeMode !== 'my' && weekSelectorRow && <div className="py-3">{weekSelectorRow}</div>}

      {!loading && user && !planner && scopeMode !== 'my' && (
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
      )}

      {!loading && planner && scopeMode !== 'my' && (
        <>
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-center border-b border-gray-200 p-2 dark:border-gray-700">
              {weekSelectorRow}
            </div>
            <div className="overflow-x-auto">
              <div className="p-2 pt-3">
                <div
                  className="grid min-w-[720px] gap-1"
                  style={{ gridTemplateColumns: `auto repeat(${plannerVisibleDays.length}, minmax(0,1fr))` }}
                >
                <div />
                {plannerVisibleDays.map((d) => (
                  <div
                    key={d.date}
                    className={[
                      'px-1 py-2 text-center text-[11px] font-semibold leading-tight',
                      d.isPast ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100',
                    ].join(' ')}
                  >
                    {plannerDayShortLabel(d)}
                  </div>
                ))}
                {BUCKET_ORDER.map((bid) => (
                  <React.Fragment key={bid}>
                    <div className="flex w-min min-w-0 max-w-[3.25rem] flex-col items-center justify-center gap-px border-r border-gray-100 py-1 pr-1.5 text-center text-[8px] font-semibold uppercase leading-none tracking-tight text-gray-500 dark:border-gray-800 sm:max-w-[3.5rem] sm:text-[9px] sm:pr-2">
                      {(() => {
                        const M = BUCKET_META[bid];
                        return (
                          <>
                            <M.Icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" strokeWidth={2} />
                            <span className="line-clamp-3 break-words hyphens-auto">{t(M.labelKey)}</span>
                          </>
                        );
                      })()}
                    </div>
                    {plannerVisibleDays.map((day) => {
                      const b = day.buckets.find((x) => x.bucket === bid)!;
                      const schedSlot = isSchedulableSlot(day, b);
                      return (
                        <button
                          key={`${day.date}-${bid}`}
                          type="button"
                          disabled={day.isPast}
                          onPointerDown={(e) => handleCellPointerDown(day, b, e)}
                          onPointerUp={(e) => handleCellPointerUp(day, b, e)}
                          onPointerCancel={clearLongPress}
                          className={[
                            'relative min-h-[4.5rem] min-w-0 rounded-xl border text-left transition',
                            day.isPast
                              ? 'cursor-not-allowed border-gray-100 bg-gray-100/60 opacity-60 dark:border-gray-800 dark:bg-gray-900/40'
                              : schedSlot
                                ? 'border-emerald-200/90 bg-emerald-50/95 hover:border-emerald-400/80 hover:shadow-md dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:hover:border-emerald-600'
                                : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-primary-700',
                          ].join(' ')}
                        >
                          {renderCellInner(day, b)}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {sheet && planner && (
        <LeaguePlannerDetailSheet
          isOpen
          onClose={() => setSheet(null)}
          dateLabel={format(parseISO(sheet.day.date), 'EEEE d MMMM', { locale: dateFnsLocale })}
          bucketLabel={t(BUCKET_META[sheet.bucket.bucket as LeaguePlannerBucketId].labelKey)}
          freeCount={sheet.bucket.freeCount}
          busyCount={sheet.bucket.busyCount}
          schedulableGameIds={planner.schedulableBySlot[`${sheet.day.date}|${sheet.bucket.bucket}`] ?? []}
          unscheduledGames={planner.unscheduledGames}
        />
      )}
    </div>
  );
};
