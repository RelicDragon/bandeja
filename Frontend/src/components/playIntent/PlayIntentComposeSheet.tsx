import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  SunMedium,
  Sunrise,
  Sunset,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components';
import { TimeRangeSlider } from '@/components/TimeRangeSlider';
import {
  DrawerHeader,
  DrawerDescription,
} from '@/components/ui/Drawer';
import type { PlayIntent, PlayIntentTimeOfDay } from '@/api/playIntents';
import { clubsApi } from '@/api/clubs';
import { usePlayIntentMutations } from '@/hooks/usePlayIntent';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { playWindowIsInPast } from '@/utils/playIntentWindow';
import {
  getViewerPrimarySport,
  listEnabledSports,
} from '@/utils/profileSports';
import { clubSupportsSport } from '@/utils/courtSport';
import type { Club, GenderTeam, Sport } from '@/types';
import { PlayIntentMoreOptionsCard } from './PlayIntentMoreOptionsCard';
import {
  PlayIntentActivitySelector,
  type PlayIntentActivityId,
} from './PlayIntentActivitySelector';

type Props = {
  open: boolean;
  cityId?: string | null;
  sport?: Sport | string | null;
  todayKey?: string;
  timezone?: string;
  initialIntent?: PlayIntent | null;
  onSubmitted: (intent: PlayIntent) => void;
};

const DAY_OPTIONS = [
  { offset: 0, key: 'today' },
  { offset: 1, key: 'tomorrow' },
  { offset: 2, key: 'dayAfter' },
] as const;

const TIME_OPTIONS: {
  value: PlayIntentTimeOfDay;
  key: string;
  range: string;
  icon: typeof Clock3;
}[] = [
  { value: 'ANYTIME', key: 'anytime', range: '06–24', icon: Clock3 },
  { value: 'MORNING', key: 'morning', range: '06–12', icon: Sunrise },
  { value: 'AFTERNOON', key: 'afternoon', range: '12–18', icon: SunMedium },
  { value: 'EVENING', key: 'evening', range: '18–24', icon: Sunset },
  { value: 'CUSTOM', key: 'customTime', range: '', icon: Clock3 },
];

const PERIOD_ORDER: PlayIntentTimeOfDay[] = [
  'ANYTIME',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'CUSTOM',
];

function dateKeyOffset(dateKey: string, todayKey?: string): number | null {
  if (!todayKey) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number);
  const offset = Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) /
      86_400_000,
  );
  return offset >= 0 && offset <= 2 ? offset : null;
}

export function PlayIntentComposePanel({
  open,
  cityId,
  sport,
  todayKey,
  timezone,
  initialIntent,
  onSubmitted,
}: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const enabledSports = useMemo(() => listEnabledSports(user), [user]);
  const primarySport = useMemo(() => getViewerPrimarySport(user), [user]);
  const defaultSport = useMemo(() => {
    const hint = (sport || primarySport || 'PADEL') as Sport;
    return enabledSports.includes(hint) ? hint : enabledSports[0] || primarySport;
  }, [sport, primarySport, enabledSports]);

  const [activity, setActivity] = useState<PlayIntentActivityId>(defaultSport);
  const { create } = usePlayIntentMutations(cityId, activity === 'BAR' ? defaultSport : activity);
  const [dayOffsets, setDayOffsets] = useState<number[]>([0]);
  const [timeOfDays, setTimeOfDays] = useState<PlayIntentTimeOfDay[]>(['ANYTIME']);
  const [customRange, setCustomRange] = useState<[string, string]>(['17:00', '21:00']);
  const [genderTeams, setGenderTeams] = useState<GenderTeam>('ANY');
  const [showMore, setShowMore] = useState(false);
  const [clubIds, setClubIds] = useState<string[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [levelEnabled, setLevelEnabled] = useState(false);
  const [levelRange, setLevelRange] = useState<[number, number]>([2.5, 4.5]);
  const resetIntentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      resetIntentIdRef.current = null;
      return;
    }
    const resetIntentId = initialIntent?.id ?? 'new';
    if (resetIntentIdRef.current === resetIntentId) return;
    resetIntentIdRef.current = resetIntentId;
    const nextActivity = initialIntent?.entityType === 'BAR'
      ? 'BAR'
      : initialIntent?.sport ?? defaultSport;
    const nextOffsets = initialIntent?.dateKeys
      .map((key) => dateKeyOffset(key, todayKey))
      .filter((offset): offset is number => offset != null);
    setActivity(nextActivity);
    setDayOffsets(nextOffsets?.length ? nextOffsets : [0]);
    setTimeOfDays(
      initialIntent?.timeOfDays?.length
        ? initialIntent.timeOfDays
        : [initialIntent?.timeOfDay ?? 'ANYTIME'],
    );
    setCustomRange([
      initialIntent?.startTime ?? '17:00',
      initialIntent?.endTime ?? '21:00',
    ]);
    setGenderTeams(initialIntent?.genderTeams ?? 'ANY');
    setShowMore(Boolean(
      initialIntent?.clubIds.length ||
      initialIntent?.minLevel != null ||
      initialIntent?.maxLevel != null,
    ));
    setClubIds(initialIntent?.clubIds ?? []);
    const hasLevel = initialIntent?.minLevel != null || initialIntent?.maxLevel != null;
    setLevelEnabled(hasLevel);
    setLevelRange([
      initialIntent?.minLevel ?? 2.5,
      initialIntent?.maxLevel ?? 4.5,
    ]);
  }, [open, defaultSport, initialIntent, todayKey]);

  useEffect(() => {
    if (!open || !cityId) {
      setAllClubs([]);
      return;
    }
    let cancelled = false;
    void clubsApi
      .getByCityId(cityId)
      .then((res) => {
        if (!cancelled) setAllClubs(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setAllClubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, cityId]);

  const filteredClubs = useMemo(() => {
    if (activity === 'BAR') {
      return allClubs.filter((c) => c.isBar);
    }
    return allClubs.filter((c) => !c.isBar && clubSupportsSport(c, activity));
  }, [allClubs, activity]);

  useEffect(() => {
    const allowed = new Set(filteredClubs.map((c) => c.id));
    setClubIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [filteredClubs]);

  // Mirrors the backend's intentWindowEndsAt + "expiresAt <= now" check so we
  // can refuse to submit a request the server would reject with 400
  // playIntent.windowEnded (e.g. today + a custom range that already ended).
  const windowInPast = useMemo(
    () =>
      playWindowIsInPast({
        dayOffsets,
        timeOfDays,
        customRange,
        todayKey,
        timezone,
      }),
    [dayOffsets, timeOfDays, customRange, todayKey, timezone],
  );

  const toggleDay = (offset: number) => {
    setDayOffsets((prev) => {
      if (prev.includes(offset)) {
        const next = prev.filter((d) => d !== offset);
        return next.length ? next : prev;
      }
      return [...prev, offset].sort();
    });
  };

  const toggleClub = (id: string) => {
    setClubIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleTime = (value: PlayIntentTimeOfDay) => {
    setTimeOfDays((current) => {
      if (value === 'ANYTIME' || value === 'CUSTOM') return [value];
      const withoutExclusive = current.filter(
        (period) => period !== 'ANYTIME' && period !== 'CUSTOM',
      );
      if (withoutExclusive.includes(value)) {
        const next = withoutExclusive.filter((period) => period !== value);
        return next.length ? next : current;
      }
      const selected = new Set<PlayIntentTimeOfDay>([
        ...withoutExclusive,
        value,
      ]);
      return PERIOD_ORDER.filter((period) => selected.has(period));
    });
  };

  const submit = async () => {
    const isBar = activity === 'BAR';
    const resolvedSport = isBar ? defaultSport : activity;
    try {
      const nextIntent = await create.mutateAsync({
        cityId: cityId || undefined,
        sport: resolvedSport,
        entityType: isBar ? 'BAR' : 'GAME',
        dayOffsets,
        timeOfDay: timeOfDays[0],
        timeOfDays,
        startTime: timeOfDays.includes('CUSTOM') ? customRange[0] : null,
        endTime: timeOfDays.includes('CUSTOM') ? customRange[1] : null,
        clubIds: clubIds.length ? clubIds : undefined,
        minLevel: !isBar && levelEnabled ? levelRange[0] : null,
        maxLevel: !isBar && levelEnabled ? levelRange[1] : null,
        genderTeams: isBar ? 'ANY' : genderTeams,
      });
      onSubmitted(nextIntent);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t));
    }
  };

  return (
    <>
      <DrawerHeader className="shrink-0 pr-16">
        <h2 className="text-lg font-semibold leading-none tracking-tight">
          {t('playIntent.composeTitle')}
        </h2>
      </DrawerHeader>
      <div
        data-play-intent-compose-scroll
        className="space-y-5 px-4 pb-6"
      >
          <DrawerDescription className="text-center">
            {t('playIntent.composeHint')}
          </DrawerDescription>

          <PlayIntentActivitySelector
            sports={enabledSports}
            value={activity}
            onChange={setActivity}
            defaultSport={defaultSport}
          />

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('playIntent.whenLabel')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DAY_OPTIONS.map((d) => {
                const active = dayOffsets.includes(d.offset);
                return (
                  <button
                    key={d.offset}
                    type="button"
                    onClick={() => toggleDay(d.offset)}
                    aria-pressed={active}
                    className={`relative min-h-14 rounded-2xl border px-2.5 py-2 text-sm font-semibold transition-all ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 shadow-sm dark:text-emerald-300'
                        : 'border-border/70 bg-card text-foreground/70 hover:border-emerald-500/30 hover:bg-emerald-500/5'
                    }`}
                  >
                    {active && (
                      <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-600 text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    )}
                    {t(`playIntent.${d.key}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {t('playIntent.timeLabel')}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('playIntent.timeMultiHint')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-3xl border border-border/60 bg-muted/30 p-2">
              {TIME_OPTIONS.map((opt) => {
                const active = timeOfDays.includes(opt.value);
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleTime(opt.value)}
                    aria-pressed={active}
                    className={`flex min-h-14 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-all ${opt.value === 'CUSTOM' ? 'col-span-2' : ''} ${
                      active
                        ? 'border-sky-500/60 bg-sky-500 text-white shadow-md shadow-sky-500/15'
                        : 'border-transparent bg-background/80 text-foreground/80 hover:border-sky-500/25 hover:bg-background'
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                      active ? 'bg-white/20' : 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {t(`playIntent.${opt.key}`)}
                      </span>
                      {opt.range && (
                        <span className={`block text-[11px] ${active ? 'text-white/75' : 'text-muted-foreground'}`}>
                          {opt.range}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <AnimatePresence initial={false}>
              {timeOfDays.includes('CUSTOM') && (
                <motion.div
                  key="custom-time"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-3">
                    <TimeRangeSlider
                      value={customRange}
                      onChange={setCustomRange}
                      hour12={displaySettings.hour12}
                    />
                    {windowInPast && (
                      <p className="mt-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
                        {t('playIntent.windowEndedHint')}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <PlayIntentMoreOptionsCard
            open={showMore}
            onOpenChange={setShowMore}
            cityId={cityId}
            clubs={filteredClubs}
            clubIds={clubIds}
            onToggleClub={toggleClub}
            genderTeams={genderTeams}
            onGenderTeamsChange={setGenderTeams}
            levelEnabled={levelEnabled}
            onLevelEnabledChange={setLevelEnabled}
            levelRange={levelRange}
            onLevelRangeChange={setLevelRange}
            isBar={activity === 'BAR'}
          />

          <Button
            variant="primary"
            className="w-full"
            onClick={() => void submit()}
            disabled={create.isPending || !dayOffsets.length || windowInPast}
          >
            {create.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('playIntent.saving')}
              </>
            ) : (
              t('playIntent.search')
            )}
          </Button>
      </div>
    </>
  );
}
