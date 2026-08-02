import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, WandSparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { clubsApi } from '@/api/clubs';
import { courtsApi } from '@/api/courts';
import type {
  BracketPlayoffPreviewResponse,
  BracketSlotScheduleInput,
  LeagueGroup,
} from '@/api/leagues';
import type { Club, Court, Game } from '@/types';
import {
  bracketPlannerFixtureKey,
  bracketFixtureLabel,
  buildBracketPipelineSchedule,
  scheduleDurationMinutes,
  type PlannedBracketFixture,
} from '@/utils/bracketSchedulePlanner';

interface BracketPlayoffScheduleStepProps {
  preview: BracketPlayoffPreviewResponse;
  seasonGame: Game;
  groups: LeagueGroup[];
  value: BracketSlotScheduleInput[];
  onChange: (value: BracketSlotScheduleInput[]) => void;
  onValidityChange: (valid: boolean) => void;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localTimeValue(iso: string) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );
}

export function BracketPlayoffScheduleStep({
  preview,
  seasonGame,
  groups,
  value,
  onChange,
  onValidityChange,
}: BracketPlayoffScheduleStepProps) {
  const { t } = useTranslation();
  const controlClass =
    'mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white';
  const [publishSchedule, setPublishSchedule] = useState(true);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [clubId, setClubId] = useState(seasonGame.clubId ?? '');
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [date, setDate] = useState(localDateKey());
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [groupOrder, setGroupOrder] = useState<Array<string | null>>(
    preview.groups.map((group) => group.leagueGroupId)
  );
  const [planned, setPlanned] = useState<PlannedBracketFixture[]>([]);

  const groupNames = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group.name])),
    [groups]
  );
  const expectedCount = useMemo(
    () => preview.groups.reduce((sum, group) => sum + group.slots.length, 0),
    [preview]
  );

  useEffect(() => {
    let active = true;
    const cityId = seasonGame.city?.id;
    if (!cityId) return;
    void clubsApi.getByCityId(cityId).then((response) => {
      if (!active) return;
      const rows = (response.data ?? []).filter((club) => club.isForPlaying !== false);
      setClubs(rows);
      setClubId((current) => current || rows[0]?.id || '');
    });
    return () => {
      active = false;
    };
  }, [seasonGame.city?.id]);

  useEffect(() => {
    if (!clubId) {
      setCourts([]);
      setSelectedCourtIds([]);
      return;
    }
    let active = true;
    void courtsApi.getByClubId(clubId, { sport: seasonGame.sport }).then((response) => {
      if (!active) return;
      const rows = (response.data ?? []).filter((court) => court.isActive !== false);
      setCourts(rows);
      setSelectedCourtIds((current) => {
        const retained = current.filter((id) => rows.some((court) => court.id === id));
        return retained.length ? retained : rows.slice(0, Math.min(4, rows.length)).map((court) => court.id);
      });
    });
    return () => {
      active = false;
    };
  }, [clubId, seasonGame.sport]);

  useEffect(() => {
    if (!value.length || planned.length || courts.length === 0) return;
    const slotByKey = new Map(
      preview.groups.flatMap((group) =>
        group.slots.map((slot) => [bracketPlannerFixtureKey(group.leagueGroupId, slot.slotKey), { group, slot }] as const)
      )
    );
    setPlanned(
      value.flatMap((schedule) => {
        const found = slotByKey.get(bracketPlannerFixtureKey(schedule.leagueGroupId, schedule.slotKey));
        const court = courts.find((item) => item.id === schedule.courtId);
        if (!found || !court) return [];
        return [{
          ...schedule,
          label: bracketFixtureLabel(found.slot),
          groupName: found.group.leagueGroupId == null ? 'Season playoff' : groupNames[found.group.leagueGroupId] ?? 'Group',
          courtName: court.name,
          slotKind: found.slot.slotKind,
          roundIndex: found.slot.roundIndex,
          matchIndex: found.slot.matchIndex,
        }];
      })
    );
  }, [courts, groupNames, planned.length, preview.groups, value]);

  const selectedCourts = selectedCourtIds
    .map((id) => courts.find((court) => court.id === id))
    .filter((court): court is Court => Boolean(court));

  const validationError = useMemo(() => {
    if (!publishSchedule) return null;
    if (planned.length !== expectedCount) return 'incomplete';
    const byCourt = new Map<string, PlannedBracketFixture[]>();
    for (const row of planned) {
      const list = byCourt.get(row.courtId) ?? [];
      list.push(row);
      byCourt.set(row.courtId, list);
    }
    for (const rows of byCourt.values()) {
      rows.sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < rows.length; i += 1) {
        if (new Date(rows[i]!.startTime) < new Date(rows[i - 1]!.endTime)) return 'overlap';
      }
    }
    const byKey = new Map(
      planned.map((row) => [bracketPlannerFixtureKey(row.leagueGroupId, row.slotKey), row])
    );
    for (const group of preview.groups) {
      for (const slot of group.slots) {
        const row = byKey.get(bracketPlannerFixtureKey(group.leagueGroupId, slot.slotKey));
        if (!row) return 'incomplete';
        for (const feeder of [slot.feederSlotAKey, slot.feederSlotBKey]) {
          if (!feeder) continue;
          const feederRow = byKey.get(bracketPlannerFixtureKey(group.leagueGroupId, feeder));
          if (feederRow && new Date(row.startTime) < new Date(feederRow.endTime)) return 'feeder';
        }
      }
    }
    return null;
  }, [expectedCount, planned, preview.groups, publishSchedule]);

  useEffect(() => {
    if (value.length > 0 && planned.length === 0) return;
    const valid = !publishSchedule || validationError == null;
    onValidityChange(valid);
    onChange(
      publishSchedule && valid
        ? planned.map(({ leagueGroupId, slotKey, clubId: rowClubId, courtId, startTime: rowStart, endTime }) => ({
            leagueGroupId,
            slotKey,
            clubId: rowClubId,
            courtId,
            startTime: rowStart,
            endTime,
          }))
        : []
    );
  }, [onChange, onValidityChange, planned, publishSchedule, validationError, value.length]);

  const generate = (durationOverrides?: Record<string, number>) => {
    const rows = buildBracketPipelineSchedule({
      preview,
      groupOrder,
      groupNames,
      clubId,
      courts: selectedCourts.map((court) => ({ id: court.id, name: court.name })),
      date,
      startTime,
      durationMinutes,
      durationOverrides,
    });
    setPlanned(rows);
  };

  const waves = useMemo(() => {
    const map = new Map<string, PlannedBracketFixture[]>();
    for (const row of [...planned].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      const rows = map.get(row.startTime) ?? [];
      rows.push(row);
      map.set(row.startTime, rows);
    }
    return [...map.entries()];
  }, [planned]);

  const moveGroup = (index: number, delta: -1 | 1) => {
    setGroupOrder((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const updateFixture = (key: string, patch: Partial<PlannedBracketFixture>) => {
    setPlanned((current) =>
      current.map((row) => {
        if (bracketPlannerFixtureKey(row.leagueGroupId, row.slotKey) !== key) return row;
        const court = patch.courtId ? courts.find((item) => item.id === patch.courtId) : null;
        return { ...row, ...patch, courtName: court?.name ?? patch.courtName ?? row.courtName };
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
          <div>
            <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
              {t('gameDetails.bracketScheduleHeading', { defaultValue: 'Plan the playoff day' })}
            </p>
            <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
              {t('gameDetails.bracketScheduleHint', {
                defaultValue: 'All future fixtures appear immediately with a time and court. Teams fill in automatically as results arrive.',
              })}
            </p>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={publishSchedule}
          onChange={(event) => setPublishSchedule(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600"
        />
        {t('gameDetails.bracketPublishSchedule', { defaultValue: 'Publish fixture times now' })}
      </label>

      {publishSchedule ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('common.date', { defaultValue: 'Date' })}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={controlClass} />
            </label>
            <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('gameDetails.bracketFirstStart', { defaultValue: 'First start' })}
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={controlClass} />
            </label>
            <label className="col-span-2 space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('gameDetails.location', { defaultValue: 'Club' })}
              <select value={clubId} onChange={(e) => setClubId(e.target.value)} className={controlClass}>
                <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
                {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('gameDetails.bracketMatchLength', { defaultValue: 'Match length' })}
              <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={controlClass}>
                {[30, 45, 60, 75, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('gameDetails.courts', { defaultValue: 'Courts' })}
            </p>
            <div className="flex flex-wrap gap-2">
              {courts.map((court) => {
                const selected = selectedCourtIds.includes(court.id);
                return (
                  <button
                    key={court.id}
                    type="button"
                    onClick={() => setSelectedCourtIds((current) => selected ? current.filter((id) => id !== court.id) : [...current, court.id])}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200' : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}
                  >
                    {court.name}
                  </button>
                );
              })}
            </div>
          </div>

          {groupOrder.length > 1 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('gameDetails.bracketGroupOrder', { defaultValue: 'Division order' })}
              </p>
              <div className="space-y-1">
                {groupOrder.map((groupId, index) => (
                  <div key={groupId ?? 'cross'} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm dark:bg-gray-800/70">
                    <span>{groupId == null ? t('gameDetails.bracketSeasonPlayoff', { defaultValue: 'Season playoff' }) : groupNames[groupId]}</span>
                    <span className="flex gap-1">
                      <button type="button" disabled={index === 0} onClick={() => moveGroup(index, -1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" disabled={index === groupOrder.length - 1} onClick={() => moveGroup(index, 1)} className="rounded p-1 hover:bg-gray-200 disabled:opacity-30 dark:hover:bg-gray-700"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button type="button" className="w-full" onClick={() => generate()} disabled={!clubId || selectedCourts.length === 0}>
            <WandSparkles className="mr-2 h-4 w-4" />
            {planned.length
              ? t('gameDetails.bracketRegenerateSchedule', { defaultValue: 'Rebuild schedule' })
              : t('gameDetails.bracketGenerateSchedule', { defaultValue: 'Build compact schedule' })}
          </Button>

          {waves.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/80 dark:text-gray-300">
                  <tr><th className="px-2 py-2 text-left">{t('gameDetails.bracketWave', { defaultValue: 'Wave / time' })}</th>{selectedCourts.map((court) => <th key={court.id} className="min-w-32 px-2 py-2 text-left">{court.name}</th>)}</tr>
                </thead>
                <tbody>
                  {waves.map(([waveStart, rows], waveIndex) => (
                    <tr key={waveStart} className="border-t border-gray-100 align-top dark:border-gray-800">
                      <td className="whitespace-nowrap px-2 py-2 font-semibold">{t('gameDetails.bracketWaveNumber', { defaultValue: 'Wave {{number}}', number: waveIndex + 1 })}<br /><span className="font-normal text-gray-500">{timeLabel(waveStart)}</span></td>
                      {selectedCourts.map((court) => {
                        const row = rows.find((fixture) => fixture.courtId === court.id);
                        return <td key={court.id} className="px-2 py-2">{row ? <><span className="font-semibold">{row.groupName}</span><br /><span className="text-gray-500 dark:text-gray-400">{row.label}</span></> : <span className="text-gray-300 dark:text-gray-700">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {planned.length ? (
            <details className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <summary className="cursor-pointer text-sm font-semibold">
                {t('gameDetails.bracketFineTune', { defaultValue: 'Fine-tune individual fixtures' })}
              </summary>
              <div className="mt-3 space-y-2">
                {[...planned].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtName.localeCompare(b.courtName)).map((row) => {
                  const key = bracketPlannerFixtureKey(row.leagueGroupId, row.slotKey);
                  return (
                    <div key={key} className="grid grid-cols-[1fr_8.5rem_5rem] items-end gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800/60">
                      <div className="min-w-0"><p className="truncate text-xs font-semibold">{row.groupName} · {row.label}</p><select value={row.courtId} onChange={(e) => updateFixture(key, { courtId: e.target.value })} className={`${controlClass} text-xs`}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></div>
                      <label className="text-[10px] text-gray-500">{t('common.dateTime', { defaultValue: 'Start' })}<input type="datetime-local" value={localTimeValue(row.startTime)} onChange={(e) => { const start = new Date(e.target.value); const duration = scheduleDurationMinutes(row); updateFixture(key, { startTime: start.toISOString(), endTime: new Date(start.getTime() + duration * 60_000).toISOString() }); }} className={`${controlClass} text-xs`} /></label>
                      <label className="text-[10px] text-gray-500">{t('common.minutes', { defaultValue: 'Minutes' })}<input type="number" min={5} max={1440} step={5} value={scheduleDurationMinutes(row)} onChange={(e) => updateFixture(key, { endTime: new Date(new Date(row.startTime).getTime() + Number(e.target.value) * 60_000).toISOString() })} className={`${controlClass} text-xs`} /></label>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          {validationError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {validationError === 'overlap'
                ? t('gameDetails.bracketScheduleOverlap', { defaultValue: 'Two fixtures overlap on the same court.' })
                : validationError === 'feeder'
                  ? t('gameDetails.bracketScheduleFeederConflict', { defaultValue: 'A later-round fixture starts before its feeder matches finish.' })
                  : t('gameDetails.bracketScheduleIncomplete', { defaultValue: 'Build a schedule for every playable fixture.' })}
            </p>
          ) : planned.length ? (
            <p className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {t('gameDetails.bracketScheduleReady', { defaultValue: '{{count}} fixtures ready to publish', count: planned.length })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t('gameDetails.bracketScheduleLaterHint', { defaultValue: 'The bracket will be created without public fixture times. You can schedule games later.' })}
        </p>
      )}
    </div>
  );
}
