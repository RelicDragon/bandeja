import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components';
import { TimeRangeSlider } from '@/components/TimeRangeSlider';
import {
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/Drawer';
import type { PlayIntent, PlayIntentTimeOfDay } from '@/api/playIntents';
import { clubsApi } from '@/api/clubs';
import { usePlayIntentMutations } from '@/hooks/usePlayIntent';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
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
  initialIntent?: PlayIntent | null;
  onSubmitted: (intent: PlayIntent) => void;
};

const DAY_OPTIONS = [
  { offset: 0, key: 'today' },
  { offset: 1, key: 'tomorrow' },
  { offset: 2, key: 'dayAfter' },
] as const;

const TIME_OPTIONS: { value: PlayIntentTimeOfDay; key: string }[] = [
  { value: 'ANYTIME', key: 'anytime' },
  { value: 'MORNING', key: 'morning' },
  { value: 'AFTERNOON', key: 'afternoon' },
  { value: 'EVENING', key: 'evening' },
  { value: 'CUSTOM', key: 'customTime' },
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
  const [timeOfDay, setTimeOfDay] = useState<PlayIntentTimeOfDay>('ANYTIME');
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
    setTimeOfDay(initialIntent?.timeOfDay ?? 'ANYTIME');
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

  const submit = async () => {
    const isBar = activity === 'BAR';
    const resolvedSport = isBar ? defaultSport : activity;
    try {
      const nextIntent = await create.mutateAsync({
        cityId: cityId || undefined,
        sport: resolvedSport,
        entityType: isBar ? 'BAR' : 'GAME',
        dayOffsets,
        timeOfDay,
        startTime: timeOfDay === 'CUSTOM' ? customRange[0] : null,
        endTime: timeOfDay === 'CUSTOM' ? customRange[1] : null,
        clubIds: clubIds.length ? clubIds : undefined,
        minLevel: !isBar && levelEnabled ? levelRange[0] : null,
        maxLevel: !isBar && levelEnabled ? levelRange[1] : null,
        genderTeams: isBar ? 'ANY' : genderTeams,
      });
      onSubmitted(nextIntent);
    } catch {
      toast.error(t('common.error', { defaultValue: 'Something went wrong' }));
    }
  };

  return (
    <>
      <DrawerHeader className="shrink-0 pr-16">
        <DrawerTitle>{t('playIntent.composeTitle')}</DrawerTitle>
      </DrawerHeader>
      <div
        data-play-intent-compose-scroll
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6"
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

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('playIntent.whenLabel')}
            </div>
            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const active = dayOffsets.includes(d.offset);
                return (
                  <button
                    key={d.offset}
                    type="button"
                    onClick={() => toggleDay(d.offset)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-muted text-foreground/80 hover:bg-muted/80'
                    }`}
                  >
                    {t(`playIntent.${d.key}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('playIntent.timeLabel')}
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((opt) => {
                const active = timeOfDay === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (opt.value === 'CUSTOM' && timeOfDay === 'CUSTOM') {
                        setTimeOfDay('ANYTIME');
                        return;
                      }
                      setTimeOfDay(opt.value);
                    }}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-muted text-foreground/80 hover:bg-muted/80'
                    }`}
                  >
                    {t(`playIntent.${opt.key}`)}
                  </button>
                );
              })}
            </div>
            <AnimatePresence initial={false}>
              {timeOfDay === 'CUSTOM' && (
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
            disabled={create.isPending || !dayOffsets.length}
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
