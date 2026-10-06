/**
 * Block (hold) create / edit sheet and the "it overlaps — create anyway?" confirmation.
 * Times are club wall-clock: start = club date + minutes in the club zone, end = start + duration
 * (absolute minutes, so a DST night still blocks exactly 90 minutes).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Minus, Plus, Repeat } from 'lucide-react';
import type { HoldLabel, HoldOverlapDetails, ScheduleHoldSlot } from '@shared/clubAdmin/contract';
import { clubLocalDate, clubLocalMinutes, clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import { holdOverlapDetails } from '@/api/clubAdminErrors';
import { useCreateHoldMutation, useUpdateHoldMutation } from '@/queries/clubAdmin';
import { ConsoleSheet } from '../console/ConsoleSheet';
import { Field, FilterChips, inputClass } from '../console/controls';
import type { ConsoleFormat } from '../console/format';
import { buttonClass, cx } from '../console/classes';
import { HOLD_LABELS, type ScheduleCourtColumn } from './scheduleModel';

const DURATIONS = [60, 90, 120];
const MAX_REPEAT = 26;

export type HoldSheetTarget =
  | { kind: 'create'; courtId: string; date: string; startMin: number; durationMin: number }
  | { kind: 'edit'; hold: ScheduleHoldSlot };

interface FormState {
  courtId: string;
  date: string;
  startMin: number;
  durationMin: number;
  label: HoldLabel;
  customerName: string;
  customerPhone: string;
  note: string;
  repeatWeeks: number;
}

function initialForm(target: HoldSheetTarget, timeZone: string): FormState {
  if (target.kind === 'create') {
    return {
      courtId: target.courtId,
      date: target.date,
      startMin: target.startMin,
      durationMin: target.durationMin,
      label: 'WALK_IN',
      customerName: '',
      customerPhone: '',
      note: '',
      repeatWeeks: 1,
    };
  }
  const h = target.hold;
  const start = new Date(h.startTime);
  return {
    courtId: h.courtId,
    date: clubLocalDate(start, timeZone),
    startMin: clubLocalMinutes(start, timeZone),
    durationMin: Math.round((Date.parse(h.endTime) - start.getTime()) / 60_000),
    label: h.label,
    customerName: h.customerName ?? '',
    customerPhone: h.customerPhone ?? '',
    note: h.note ?? '',
    repeatWeeks: 1,
  };
}

export function HoldOverlapSheet({
  open,
  onOpenChange,
  details,
  courtName,
  fmt,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: HoldOverlapDetails | null;
  courtName: (courtId: string) => string;
  fmt: ConsoleFormat;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  return (
    <ConsoleSheet
      nested
      open={open}
      onOpenChange={onOpenChange}
      modalId="club-admin-hold-overlap"
      title={t('hold.overlap.title')}
      description={t('hold.overlap.body')}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={buttonClass('secondary')} onClick={() => onOpenChange(false)}>
            {t('common.back')}
          </button>
          <button type="button" className={buttonClass('danger')} onClick={onConfirm} disabled={pending}>
            {t('hold.overlap.confirm')}
          </button>
        </div>
      }
    >
      <ul className="space-y-1.5">
        {(details?.overlaps ?? []).map((o, i) => (
          <li key={`${o.id ?? i}`} className="flex items-center gap-3 rounded-xl bg-ca-sunken px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{t(`kind.short.${o.kind}`)}</span>
              <span className="text-muted-foreground"> · {courtName(o.courtId)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmt.timeRange(o.startTime, o.endTime)}</span>
          </li>
        ))}
        {(details?.overlaps.length ?? 0) === 0 ? <li className="text-sm text-muted-foreground">{t('hold.overlap.unknown')}</li> : null}
      </ul>
    </ConsoleSheet>
  );
}

export function HoldSheet({
  open,
  onOpenChange,
  target,
  courts,
  rowMinutes,
  clubId,
  timeZone,
  nowMs,
  fmt,
  isV2,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: HoldSheetTarget | null;
  courts: ScheduleCourtColumn[];
  rowMinutes: number[];
  clubId: string;
  timeZone: string;
  nowMs: number;
  fmt: ConsoleFormat;
  isV2: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  const [form, setForm] = useState<FormState | null>(null);
  const [overlap, setOverlap] = useState<HoldOverlapDetails | null>(null);
  const create = useCreateHoldMutation(clubId, timeZone);
  const update = useUpdateHoldMutation(clubId, timeZone);
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open && target) {
      setForm(initialForm(target, timeZone));
      setOverlap(null);
    }
  }, [open, target, timeZone]);

  const bookable = courts.filter((c) => c.id && (c.isActive || c.id === form?.courtId));
  const startOptions = useMemo(() => {
    const set = new Set(rowMinutes);
    if (form) set.add(form.startMin);
    return [...set].sort((a, b) => a - b);
  }, [rowMinutes, form]);

  if (!form || !target) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const startAt = clubWallTimeToUtc(form.date, form.startMin, timeZone);
  const endAt = new Date(startAt.getTime() + form.durationMin * 60_000);
  const inPast = endAt.getTime() <= nowMs;
  const durations = DURATIONS.includes(form.durationMin) ? DURATIONS : [...DURATIONS, form.durationMin].sort((a, b) => a - b);
  const isEdit = target.kind === 'edit';
  const disabledReason = inPast ? t('hold.inPast') : !form.courtId ? t('hold.pickCourt') : null;

  const body = (force: boolean) => ({
    courtId: form.courtId,
    startTime: startAt.toISOString(),
    endTime: endAt.toISOString(),
    label: form.label,
    note: form.note.trim() || null,
    ...(isV2
      ? { customerName: form.customerName.trim() || null, customerPhone: form.customerPhone.trim() || null }
      : {}),
    ...(force ? { force: true } : {}),
  });

  const submit = async (force = false) => {
    try {
      if (target.kind === 'edit') {
        await update.mutateAsync({ holdId: target.hold.holdId, patch: body(force) });
      } else {
        await create.mutateAsync({ ...body(force), ...(isV2 && form.repeatWeeks > 1 ? { repeatWeeks: form.repeatWeeks } : {}) });
      }
      setOverlap(null);
      onOpenChange(false);
    } catch (e) {
      const details = holdOverlapDetails(e);
      if (details) setOverlap(details);
    }
  };

  const courtName = (id: string) => courts.find((c) => c.id === id)?.name ?? t('common.court');

  return (
    <>
      <ConsoleSheet
        open={open}
        onOpenChange={(o) => !pending && onOpenChange(o)}
        modalId="club-admin-hold-sheet"
        title={isEdit ? t('hold.editTitle') : t('hold.createTitle')}
        description={`${courtName(form.courtId)} · ${fmt.dateMedium(form.date)} · ${fmt.timeRange(startAt.toISOString(), endAt.toISOString())}`}
        footer={
          <div className="space-y-2">
            {disabledReason ? <p className="text-center text-xs text-muted-foreground">{disabledReason}</p> : null}
            <button
              type="button"
              className={buttonClass('primary', 'w-full')}
              disabled={!!disabledReason || pending}
              onClick={() => void submit(false)}
            >
              {pending ? t('common.saving') : isEdit ? t('common.save') : t('hold.create')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('hold.court')} htmlFor="ca-hold-court">
              <select
                id="ca-hold-court"
                className={inputClass}
                value={form.courtId}
                onChange={(e) => set('courtId', e.target.value)}
              >
                {bookable.map((c) => (
                  <option key={c.key} value={c.id ?? ''}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('hold.start')} htmlFor="ca-hold-start">
              <select
                id="ca-hold-start"
                className={cx(inputClass, 'tabular-nums')}
                value={form.startMin}
                onChange={(e) => set('startMin', Number(e.target.value))}
              >
                {startOptions.map((m) => (
                  <option key={m} value={m}>
                    {fmt.wallTime(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t('hold.duration')}>
            <FilterChips
              ariaLabel={t('hold.duration')}
              options={durations.map((d) => ({ value: String(d), label: t('common.minutesShort', { count: d }) }))}
              selected={[String(form.durationMin)]}
              onToggle={(v) => set('durationMin', Number(v))}
            />
          </Field>

          <Field label={t('hold.label')}>
            <FilterChips
              ariaLabel={t('hold.label')}
              options={HOLD_LABELS.map((l) => ({ value: l, label: t(`holdLabel.${l}`) }))}
              selected={[form.label]}
              onToggle={(v) => set('label', v)}
            />
          </Field>

          {isV2 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('hold.customerName')} htmlFor="ca-hold-name">
                <input
                  id="ca-hold-name"
                  className={inputClass}
                  value={form.customerName}
                  autoComplete="off"
                  maxLength={80}
                  onChange={(e) => set('customerName', e.target.value)}
                />
              </Field>
              <Field label={t('hold.customerPhone')} htmlFor="ca-hold-phone">
                <input
                  id="ca-hold-phone"
                  className={inputClass}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={32}
                  value={form.customerPhone}
                  onChange={(e) => set('customerPhone', e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <Field label={t('hold.note')} htmlFor="ca-hold-note">
            <textarea
              id="ca-hold-note"
              className={cx(inputClass, 'min-h-[4.5rem] resize-none')}
              rows={2}
              maxLength={300}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>

          {isV2 && !isEdit ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-ca-sunken px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span>
                  <span className="block font-medium">{t('hold.repeat')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {form.repeatWeeks > 1 ? t('hold.repeatWeeks', { count: form.repeatWeeks }) : t('hold.repeatOff')}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-ca-surface disabled:opacity-40"
                  onClick={() => set('repeatWeeks', Math.max(1, form.repeatWeeks - 1))}
                  disabled={form.repeatWeeks <= 1}
                  aria-label={t('hold.repeatLess')}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                  {form.repeatWeeks}
                </span>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-ca-surface disabled:opacity-40"
                  onClick={() => set('repeatWeeks', Math.min(MAX_REPEAT, form.repeatWeeks + 1))}
                  disabled={form.repeatWeeks >= MAX_REPEAT}
                  aria-label={t('hold.repeatMore')}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </ConsoleSheet>
      <HoldOverlapSheet
        open={!!overlap}
        onOpenChange={(o) => !o && setOverlap(null)}
        details={overlap}
        courtName={courtName}
        fmt={fmt}
        pending={pending}
        onConfirm={() => void submit(true)}
      />
    </>
  );
}
