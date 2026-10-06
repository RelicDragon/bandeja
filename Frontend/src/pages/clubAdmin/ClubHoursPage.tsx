/**
 * `/my-clubs/:clubId/club/hours` (`club.edit`) — weekly opening hours and upcoming closures,
 * one draft saved with `PUT /hours` from the sticky save bar. `close <= open` runs past midnight
 * and says so ("closes next day"); closures are closed all day or special hours for one date.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarPlus, Copy, Moon, Trash2 } from 'lucide-react';
import type { ClubWeeklyHoursDay } from '@shared/clubAdmin/contract';
import { addDaysToDate } from '@shared/clubAdmin/clubTime';
import { SegmentedControl, inputClass } from '@/components/clubAdmin/console/controls';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { Card, EmptyState, ErrorState, Section, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { SaveBar, UnsavedChangesGuard } from '@/components/clubAdmin/club/formChrome';
import { useFormBottomPadding, validationFieldErrors } from '@/components/clubAdmin/club/formHooks';
import {
  CLOSURE_NOTE_MAX,
  buildHoursBody,
  closesNextDay,
  closureToDraft,
  copyMondayToAll,
  hasHoursErrors,
  normalizeWeekly,
  validateHours,
  type ClosureDraft,
} from '@/components/clubAdmin/club/hoursModel';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { useClubHoursQuery, useSaveClubHoursMutation } from '@/queries/clubAdmin/clubArea';

interface HoursDraft {
  weekly: ClubWeeklyHoursDay[];
  closures: ClosureDraft[];
}

let closureSeq = 0;

function snapshot(d: HoursDraft): string {
  return JSON.stringify(buildHoursBody(d.weekly, d.closures));
}

export function ClubHoursPage() {
  const { t } = useTranslation('clubAdmin');
  const { clubId, timeZone, today } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const hub = `${consoleBase(clubId)}/club`;
  useConsoleHeader({ title: t('club.pages.hours.title'), backTo: hub });

  const hours = useClubHoursQuery(clubId);
  const save = useSaveClubHoursMutation(clubId);
  const [base, setBase] = useState<string | null>(null);
  const [draft, setDraft] = useState<HoursDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (hours.data && !draft) {
      const d = { weekly: normalizeWeekly(hours.data.weekly), closures: hours.data.closures.map(closureToDraft) };
      setDraft(d);
      setBase(snapshot(d));
    }
  }, [hours.data, draft]);

  const dirty = !!draft && base !== null && snapshot(draft) !== base;
  const errors = useMemo(() => (draft ? validateHours(draft.weekly, draft.closures, today) : null), [draft, today]);
  const bottomPad = useFormBottomPadding(dirty);

  const weekdayName = useMemo(() => {
    let f: Intl.DateTimeFormat;
    try {
      f = new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', timeZone: 'UTC' });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
    }
    // 2024-01-01 is a Monday: ISO weekday n is Jan n.
    return (weekday: number) => f.format(new Date(Date.UTC(2024, 0, weekday, 12)));
  }, [fmt.locale]);

  if (hours.isPending) return <SkeletonRows rows={7} className="mx-auto w-full max-w-2xl p-4 lg:p-6" />;
  if (hours.isError || !hours.data) return <ErrorState onRetry={() => void hours.refetch()} />;
  if (!draft) return <SkeletonRows rows={7} className="mx-auto w-full max-w-2xl p-4 lg:p-6" />;

  const setDay = (weekday: number, patch: Partial<ClubWeeklyHoursDay>) =>
    setDraft((d) => (d ? { ...d, weekly: d.weekly.map((x) => (x.weekday === weekday ? { ...x, ...patch } : x)) } : d));
  const setClosure = (key: string, patch: Partial<ClosureDraft>) =>
    setDraft((d) => (d ? { ...d, closures: d.closures.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : d));
  const addClosure = () => {
    closureSeq += 1;
    const taken = new Set(draft.closures.map((c) => c.date));
    let date = addDaysToDate(today, 1);
    while (taken.has(date)) date = addDaysToDate(date, 1);
    setDraft((d) =>
      d ? { ...d, closures: [...d.closures, { key: `new-${closureSeq}`, date, allDay: true, open: '10:00', close: '18:00', note: '' }] } : d
    );
  };

  const onSave = async () => {
    if (errors && hasHoursErrors(errors)) {
      setShowErrors(true);
      toast.error(t('club.form.fixErrors'));
      return;
    }
    try {
      const saved = await save.mutateAsync(buildHoursBody(draft.weekly, draft.closures));
      const d = { weekly: normalizeWeekly(saved.weekly), closures: saved.closures.map(closureToDraft) };
      setDraft(d);
      setBase(snapshot(d));
      setShowErrors(false);
      setServerError(null);
      toast.success(t('common.saved'));
    } catch (e) {
      const fields = validationFieldErrors(e);
      if (fields) {
        setServerError(Object.entries(fields).map(([f, m]) => `${f}: ${m}`).join(' · '));
        toast.error(t('club.form.fixErrors'));
      }
    }
  };

  const weekdayErr = (weekday: ClubWeeklyHoursDay['weekday']) => (showErrors ? errors?.weekly[weekday] : undefined);
  const closureErr = (key: string) => (showErrors ? errors?.closures[key] : undefined);
  const sortedClosures = [...draft.closures].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 lg:p-6" style={{ paddingBottom: bottomPad }}>
      {!hours.data.configured ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ca-warn-bg px-3.5 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-ca-warn">{t('club.hours.notConfigured')}</p>
          {!dirty ? (
            <button type="button" className={buttonClass('secondary', 'min-h-9')} disabled={save.isPending} onClick={() => void onSave()}>
              {t('club.hours.useTheseHours')}
            </button>
          ) : null}
        </div>
      ) : null}
      {serverError ? (
        <p role="alert" className="rounded-xl bg-ca-danger-bg px-3.5 py-2.5 text-sm text-destructive">
          {t('club.profile.errors.server', { message: serverError })}
        </p>
      ) : null}

      <Section
        title={t('club.hours.weekly')}
        action={
          <button
            type="button"
            className={buttonClass('ghost', 'min-h-9 px-2.5 text-[13px]')}
            onClick={() => setDraft((d) => (d ? { ...d, weekly: copyMondayToAll(d.weekly) } : d))}
          >
            <Copy className="h-4 w-4" aria-hidden />
            {t('club.hours.copyMonday')}
          </button>
        }
      >
        <Card className="divide-y divide-border">
          {draft.weekly.map((d) => {
            const name = weekdayName(d.weekday);
            const nextDay = !d.closed && closesNextDay(d.open, d.close);
            const err = weekdayErr(d.weekday);
            return (
              <div key={d.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3" role="group" aria-label={name}>
                <span className="w-24 shrink-0 text-sm font-medium capitalize text-foreground">{name}</span>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    role="switch"
                    className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                    checked={!d.closed}
                    onChange={(e) => setDay(d.weekday, { closed: !e.target.checked })}
                    aria-label={t('club.hours.openOn', { day: name })}
                  />
                  {d.closed ? t('club.hours.closed') : t('club.hours.open')}
                </label>
                {!d.closed ? (
                  <div className="ms-auto flex items-center gap-1.5">
                    <input
                      type="time"
                      className={cx(inputClass, 'w-[7.5rem] py-2', err && 'border-destructive')}
                      value={d.open}
                      aria-label={t('club.hours.opensAt', { day: name })}
                      onChange={(e) => setDay(d.weekday, { open: e.target.value })}
                    />
                    <span className="text-muted-foreground" aria-hidden>
                      –
                    </span>
                    <input
                      type="time"
                      className={cx(inputClass, 'w-[7.5rem] py-2', err && 'border-destructive')}
                      value={d.close}
                      aria-label={t('club.hours.closesAt', { day: name })}
                      onChange={(e) => setDay(d.weekday, { close: e.target.value })}
                    />
                  </div>
                ) : null}
                {nextDay ? (
                  <p className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:ps-[6.75rem]">
                    <Moon className="h-3.5 w-3.5" aria-hidden />
                    {t('club.hours.closesNextDay', { time: fmt.wallTime(Number(d.close.slice(0, 2)) * 60 + Number(d.close.slice(3, 5))) })}
                  </p>
                ) : null}
                {err ? (
                  <p className="w-full text-xs text-destructive sm:ps-[6.75rem]" role="alert">
                    {t(`club.hours.errors.${err}`)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </Card>
      </Section>

      <Section
        title={t('club.hours.closures')}
        action={
          <button type="button" className={buttonClass('ghost', 'min-h-9 px-2.5 text-[13px]')} onClick={addClosure}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t('club.hours.addClosure')}
          </button>
        }
      >
        {sortedClosures.length === 0 ? (
          <Card>
            <EmptyState compact icon={CalendarPlus} title={t('club.hours.noClosures')} body={t('club.hours.noClosuresBody')} />
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedClosures.map((c) => {
              const err = closureErr(c.key);
              return (
                <Card key={c.key} className="space-y-3 p-3.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      min={today}
                      className={cx(inputClass, 'flex-1 py-2', (err === 'date' || err === 'duplicateDate' || err === 'pastDate') && 'border-destructive')}
                      value={c.date}
                      aria-label={t('club.hours.closureDate')}
                      onChange={(e) => setClosure(c.key, { date: e.target.value })}
                    />
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={t('club.hours.removeClosure')}
                      onClick={() => setDraft((d) => (d ? { ...d, closures: d.closures.filter((x) => x.key !== c.key) } : d))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <SegmentedControl<'allDay' | 'special'>
                    size="sm"
                    ariaLabel={t('club.hours.closureKind')}
                    value={c.allDay ? 'allDay' : 'special'}
                    onChange={(v) => setClosure(c.key, { allDay: v === 'allDay' })}
                    options={[
                      { value: 'allDay', label: t('club.hours.closedAllDay') },
                      { value: 'special', label: t('club.hours.specialHours') },
                    ]}
                  />
                  {!c.allDay ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        className={cx(inputClass, 'py-2', err === 'time' && 'border-destructive')}
                        value={c.open}
                        aria-label={t('club.hours.specialOpens')}
                        onChange={(e) => setClosure(c.key, { open: e.target.value })}
                      />
                      <span className="text-muted-foreground" aria-hidden>
                        –
                      </span>
                      <input
                        type="time"
                        className={cx(inputClass, 'py-2', err === 'time' && 'border-destructive')}
                        value={c.close}
                        aria-label={t('club.hours.specialCloses')}
                        onChange={(e) => setClosure(c.key, { close: e.target.value })}
                      />
                    </div>
                  ) : null}
                  {!c.allDay && closesNextDay(c.open, c.close) ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Moon className="h-3.5 w-3.5" aria-hidden />
                      {t('club.hours.closesNextDayShort')}
                    </p>
                  ) : null}
                  <input
                    type="text"
                    maxLength={CLOSURE_NOTE_MAX}
                    className={cx(inputClass, 'py-2')}
                    placeholder={t('club.hours.closureNote')}
                    aria-label={t('club.hours.closureNote')}
                    value={c.note}
                    onChange={(e) => setClosure(c.key, { note: e.target.value })}
                  />
                  {err ? (
                    <p className="text-xs text-destructive" role="alert">
                      {t(`club.hours.errors.${err}`)}
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <SaveBar
        visible={dirty}
        saving={save.isPending}
        onSave={() => void onSave()}
        onDiscard={() => {
          setDraft({ weekly: normalizeWeekly(hours.data.weekly), closures: hours.data.closures.map(closureToDraft) });
          setShowErrors(false);
          setServerError(null);
        }}
      />
      <UnsavedChangesGuard dirty={dirty} fallback={hub} />
    </div>
  );
}
