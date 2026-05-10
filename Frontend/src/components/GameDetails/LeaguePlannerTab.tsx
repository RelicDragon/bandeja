import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  Loader2,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { Card, PlayerAvatar, SegmentedSwitch, Select, type SegmentedSwitchTab } from '@/components';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { LeaguePlannerDetailSheet } from './LeaguePlannerDetailSheet';
import { AvailabilityMobileGrid } from '@/components/availability/AvailabilityMobileGrid';
import { BUCKET_META } from '@/components/availability/bucketMeta';
import {
  leaguesApi,
  type LeaguePlannerDay,
  type LeaguePlannerPayload,
  type LeaguePlannerBucketId,
  type LeagueStanding,
} from '@/api/leagues';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { useAvailabilityEditor } from '@/hooks/useAvailabilityEditor';
import { parseAvailabilityBucketBoundaries } from '@/utils/availability';
import type { BasicUser, User, WeekdayKey } from '@/types';
import { getGroupFilter, setGroupFilter } from '@/utils/groupFilterStorage';
import { getAppDateFnsLocale } from '@/utils/dateFormat';

const ALL_GROUP_ID = 'ALL';
const BUCKET_ORDER: LeaguePlannerBucketId[] = ['night', 'morning', 'afternoon', 'evening'];

type ScopeMode = 'all' | 'group' | 'me' | 'pick';

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
    if (!raw) return { mode: 'all', pickValue: '' };
    const j = JSON.parse(raw) as { mode?: ScopeMode; pickValue?: string };
    if (j.mode === 'group' || j.mode === 'me' || j.mode === 'pick' || j.mode === 'all') {
      return { mode: j.mode, pickValue: typeof j.pickValue === 'string' ? j.pickValue : '' };
    }
  } catch {
    /* ignore */
  }
  return { mode: 'all', pickValue: '' };
}

function saveScope(leagueSeasonId: string, mode: ScopeMode, pickValue: string) {
  try {
    localStorage.setItem(scopeStorageKey(leagueSeasonId), JSON.stringify({ mode, pickValue }));
  } catch {
    /* ignore */
  }
}

export const LeaguePlannerTab = ({ leagueSeasonId, hasFixedTeams, isVisible = true }: LeaguePlannerTabProps) => {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = useMemo(() => getAppDateFnsLocale(i18n.language), [i18n.language]);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const isLandscape = useIsLandscape();
  const display = useMemo(() => resolveDisplaySettings(user), [user]);
  const weekStartsOn = display.weekStart === 0 ? 0 : 1;

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL_GROUP_ID);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [hasGroups, setHasGroups] = useState(false);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [pickValue, setPickValue] = useState('');
  const [peopleLayer, setPeopleLayer] = useState(true);
  const [matchesLayer, setMatchesLayer] = useState(true);
  const [venueLayer] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [editMyAvailability, setEditMyAvailability] = useState(false);
  const [planner, setPlanner] = useState<LeaguePlannerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [portraitDayIndex, setPortraitDayIndex] = useState(0);
  const [sheet, setSheet] = useState<{
    day: LeaguePlannerDay;
    bucket: LeaguePlannerDay['buckets'][0];
  } | null>(null);

  const weekStartStr = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn });
    const shifted = addWeeks(base, weekOffset);
    return format(shifted, 'yyyy-MM-dd');
  }, [weekOffset, weekStartsOn]);

  useEffect(() => {
    const { mode, pickValue: pv } = loadScope(leagueSeasonId);
    setScopeMode(mode);
    setPickValue(pv);
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
    if (!user?.id) {
      setPlanner(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const groupId = selectedGroupId === ALL_GROUP_ID ? undefined : selectedGroupId;
      const aggregateUserId =
        scopeMode === 'me'
          ? user.id
          : scopeMode === 'pick' && !hasFixedTeams && pickIntersectIds?.length === 1
            ? pickIntersectIds[0]
            : undefined;
      const aggregateIntersectUserIds =
        scopeMode === 'pick' && hasFixedTeams && pickIntersectIds && pickIntersectIds.length >= 2
          ? pickIntersectIds
          : undefined;

      const res = await leaguesApi.getPlanner(leagueSeasonId, {
        weekStart: weekStartStr,
        groupId,
        aggregateUserId,
        aggregateIntersectUserIds: aggregateIntersectUserIds ?? undefined,
      });
      setPlanner(res.data);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(t(msg || 'errors.generic'));
      setPlanner(null);
    } finally {
      setLoading(false);
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
    void fetchPlanner();
  }, [isVisible, fetchPlanner]);

  useEffect(() => {
    setPortraitDayIndex(0);
  }, [weekOffset, weekStartStr]);

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

  const scopeMe = scopeMode === 'me';
  const canEditGrid = Boolean(scopeMe && peopleLayer && user);
  const showEditor = canEditGrid && editMyAvailability;

  const pickOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (hasFixedTeams) {
      for (const s of standings) {
        if (selectedGroupId !== ALL_GROUP_ID && s.currentGroupId !== selectedGroupId) continue;
        const players = s.leagueTeam?.players ?? [];
        const label = players.map((p) => p.user?.firstName || '?').join(' · ') || t('gameDetails.planner.teamFallback');
        opts.push({ value: `team:${s.id}`, label });
      }
    } else {
      for (const s of standings) {
        if (!s.userId || !s.user) continue;
        if (selectedGroupId !== ALL_GROUP_ID && s.currentGroupId !== selectedGroupId) continue;
        const u = s.user;
        opts.push({
          value: `user:${s.userId}`,
          label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.id,
        });
      }
    }
    return opts;
  }, [standings, hasFixedTeams, selectedGroupId, t]);

  const scopeTabs = useMemo<SegmentedSwitchTab[]>(() => {
    const tabs: SegmentedSwitchTab[] = [
      { id: 'all', label: t('gameDetails.planner.scopeAll') },
      { id: 'me', label: t('gameDetails.planner.scopeMe') },
    ];
    if (hasGroups) tabs.splice(1, 0, { id: 'group', label: t('gameDetails.planner.scopeGroup') });
    tabs.push({ id: 'pick', label: hasFixedTeams ? t('gameDetails.planner.scopeTeams') : t('gameDetails.planner.scopePlayers') });
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

  const renderCellInner = (day: LeaguePlannerDay, b: LeaguePlannerDay['buckets'][0], compact: boolean) => {
    const slotKey = `${day.date}|${b.bucket}`;
    const matchIds = matchesLayer ? planner?.schedulableBySlot[slotKey] ?? [] : [];
    const schedulable = matchIds.length > 0 && !day.isPast;
    const total = b.freeCount + b.busyCount + b.unknownCount;
    const meta = BUCKET_META[b.bucket];

    return (
      <div className="relative flex h-full min-h-[3rem] w-full flex-col items-center justify-center gap-0.5 p-1">
        {schedulable && (
          <span
            className="pointer-events-none absolute inset-0.5 rounded-lg ring-2 ring-emerald-500/80 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
            aria-hidden
          />
        )}
        <meta.Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" strokeWidth={2} />
        {!compact && <span className="sr-only">{t(meta.labelKey)}</span>}
        <div className="flex -space-x-1.5">
          {b.sampleFreeUsers.slice(0, 3).map((u) => (
            <span key={u.id} className="inline-block rounded-full ring-2 ring-white dark:ring-gray-900">
              <PlayerAvatar player={u as BasicUser} extrasmall showName={false} asDiv />
            </span>
          ))}
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-gray-600 dark:text-gray-300">
          {b.freeCount}/{total || '—'}
        </span>
        {schedulable && <Sparkles className="absolute right-0.5 top-0.5 h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />}
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
    if (showEditor && !moved && dt < 480) {
      editor.toggleBucketOn(day.weekdayKey as WeekdayKey, b.bucket);
      return;
    }
    if (dt >= 480 || (!showEditor && !moved)) {
      openSheet(day, b);
    }
  };

  const portraitDay = planner?.days[portraitDayIndex] ?? planner?.days[0];

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-4">
      <Card className="border border-gray-200/80 bg-gradient-to-br from-slate-50/90 to-white dark:border-gray-700 dark:from-gray-900/80 dark:to-gray-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('gameDetails.planner.title')}</h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o - 1)}
              className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
              aria-label={t('gameDetails.planner.prevWeek')}
            >
              <ChevronLeft className="h-5 w-5 text-gray-800 dark:text-gray-100" />
            </button>
            <div className="flex min-w-[10rem] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
              <Calendar className="h-4 w-4 text-primary-500" />
              <span className="tabular-nums">
                {planner?.days?.[0] && planner?.days?.[6]
                  ? `${format(parseISO(planner.days[0].date), 'd MMM', { locale: dateFnsLocale })} – ${format(parseISO(planner.days[6].date), 'd MMM yyyy', { locale: dateFnsLocale })}`
                  : weekStartStr}
              </span>
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
        </div>
      </Card>

      {hasGroups && (
        <GroupFilterDropdown
          selectedGroupId={selectedGroupId}
          groups={groups}
          allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
          onSelect={setSelectedGroupId}
          allGroupId={ALL_GROUP_ID}
        />
      )}

      <Card className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('gameDetails.planner.scope')}
          </span>
          {!scopeMe && peopleLayer && (
            <p className="text-xs text-amber-800 dark:text-amber-200/90">{t('gameDetails.planner.editOwnHint')}</p>
          )}
        </div>
        <SegmentedSwitch
          tabs={scopeTabs}
          activeId={activeScopeTabId}
          onChange={onScopeTab}
          showOnlyActiveTabText={false}
          layoutId={`leaguePlannerScope-${leagueSeasonId}`}
          className="!mx-0 w-full min-w-0 flex-wrap justify-stretch"
        />
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
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
          {t('gameDetails.planner.layers')}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <input
              type="checkbox"
              checked={peopleLayer}
              onChange={() => setPeopleLayer((v) => !v)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-500 dark:bg-gray-900"
            />
            {t('gameDetails.planner.layerPeople')}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
            <input
              type="checkbox"
              checked={matchesLayer}
              onChange={() => setMatchesLayer((v) => !v)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-500 dark:bg-gray-900"
            />
            {t('gameDetails.planner.layerMatches')}
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={venueLayer} disabled className="rounded border-gray-300 opacity-50 dark:border-gray-600" />
            {t('gameDetails.planner.layerVenueSoon')}
          </label>
        </div>
      </Card>

      <button
        type="button"
        onClick={() => setLegendOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-left text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100"
      >
        <span>{t('gameDetails.planner.legendSummary')}</span>
        <Info className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
      </button>
      {legendOpen && (
        <Card className="text-sm text-gray-700 dark:text-gray-300">
          <ul className="list-inside list-disc space-y-1">
            <li>{t('gameDetails.planner.legendFree')}</li>
            <li>{t('gameDetails.planner.legendBusy')}</li>
            <li>{t('gameDetails.planner.legendUnknown')}</li>
            <li>{t('gameDetails.planner.legendMatch')}</li>
          </ul>
        </Card>
      )}

      {canEditGrid && (
        <div className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 flex justify-center lg:static">
          <button
            type="button"
            onClick={() => setEditMyAvailability((v) => !v)}
            className={[
              'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg transition',
              editMyAvailability
                ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                : 'border border-gray-200 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-white',
            ].join(' ')}
          >
            <Pencil className="h-4 w-4 shrink-0 text-current" />
            {editMyAvailability ? t('gameDetails.planner.editingOn') : t('gameDetails.planner.editMyTime')}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
        </div>
      )}

      {!loading && !user && (
        <Card className="border border-gray-200 text-center dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.plannerLoginHint')}</p>
        </Card>
      )}

      {!loading && user && !planner && (
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

      {!loading && planner && (
        <>
          {showEditor && (
            <Card className="border-primary-200/80 dark:border-primary-900/40">
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.planner.editorHint')}</p>
              <AvailabilityMobileGrid editor={editor} boundaries={bucketBoundaries} />
            </Card>
          )}

          {isLandscape ? (
            <Card className="overflow-x-auto p-2">
              <div
                className="grid min-w-[720px] gap-1"
                style={{ gridTemplateColumns: `minmax(4rem,1fr) repeat(${planner.days.length}, minmax(0,1fr))` }}
              >
                <div />
                {planner.days.map((d) => (
                  <div
                    key={d.date}
                    className={[
                      'px-1 py-2 text-center text-[11px] font-bold uppercase leading-tight',
                      d.isPast ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100',
                    ].join(' ')}
                  >
                    {format(parseISO(d.date), 'EEE d', { locale: dateFnsLocale })}
                  </div>
                ))}
                {BUCKET_ORDER.map((bid) => (
                  <React.Fragment key={bid}>
                    <div className="flex items-center gap-1 border-r border-gray-100 py-2 pr-2 text-[10px] font-semibold uppercase text-gray-500 dark:border-gray-800">
                      {(() => {
                        const M = BUCKET_META[bid];
                        return (
                          <>
                            <M.Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">{t(M.labelKey)}</span>
                          </>
                        );
                      })()}
                    </div>
                    {planner.days.map((day) => {
                      const b = day.buckets.find((x) => x.bucket === bid)!;
                      return (
                        <button
                          key={`${day.date}-${bid}`}
                          type="button"
                          disabled={day.isPast}
                          onPointerDown={(e) => handleCellPointerDown(day, b, e)}
                          onPointerUp={(e) => handleCellPointerUp(day, b, e)}
                          onPointerCancel={clearLongPress}
                          className={[
                            'relative min-h-[4.5rem] rounded-xl border text-left transition',
                            day.isPast
                              ? 'cursor-not-allowed border-gray-100 bg-gray-100/60 opacity-60 dark:border-gray-800 dark:bg-gray-900/40'
                              : 'border-gray-200 bg-white hover:border-primary-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-primary-700',
                            showEditor ? 'cursor-cell' : '',
                          ].join(' ')}
                        >
                          {peopleLayer ? renderCellInner(day, b, true) : <div className="p-2 text-center text-xs text-gray-400">—</div>}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="space-y-3 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {planner.days.map((d, idx) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setPortraitDayIndex(idx)}
                    className={[
                      'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition',
                      idx === portraitDayIndex
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'border border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200',
                    ].join(' ')}
                  >
                    {format(parseISO(d.date), 'EEE d', { locale: dateFnsLocale })}
                  </button>
                ))}
              </div>
              {portraitDay && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {portraitDay.buckets.map((b) => (
                    <button
                      key={b.bucket}
                      type="button"
                      disabled={portraitDay.isPast}
                      onPointerDown={(e) => handleCellPointerDown(portraitDay, b, e)}
                      onPointerUp={(e) => handleCellPointerUp(portraitDay, b, e)}
                      onPointerCancel={clearLongPress}
                      className={[
                        'relative flex min-h-[7rem] flex-col rounded-2xl border p-3 text-left transition active:scale-[0.98]',
                        portraitDay.isPast
                          ? 'cursor-not-allowed border-gray-100 bg-gray-100/50 opacity-60 dark:border-gray-800 dark:bg-gray-900/30'
                          : 'border-gray-200 bg-gradient-to-b from-white to-gray-50 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-900',
                      ].join(' ')}
                    >
                      {peopleLayer ? renderCellInner(portraitDay, b, false) : <span className="text-sm text-gray-400">—</span>}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
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
          unknownCount={sheet.bucket.unknownCount}
          totalInView={sheet.bucket.freeCount + sheet.bucket.busyCount + sheet.bucket.unknownCount}
          schedulableGameIds={matchesLayer ? planner.schedulableBySlot[`${sheet.day.date}|${sheet.bucket.bucket}`] ?? [] : []}
          unscheduledGames={planner.unscheduledGames}
          peopleLayer={peopleLayer}
          matchesLayer={matchesLayer}
        />
      )}
    </div>
  );
};
