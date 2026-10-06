/**
 * `/my-clubs/:clubId/club/pricing` (`billing.configure`) — currency, each court's base rate
 * (`pricePerHourCents`, the fallback), price rules (label, court, weekdays, time range, price),
 * a weekly preview of which price applies when, which block reasons are billable, and a live
 * quote tester against the saved prices (`GET /pricing/quote`). One draft, saved from the sticky
 * save bar: changed base rates (`PATCH /courts/:id`) then `PUT /pricing`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import type { ClubAdminCourt, ClubPricing, HoldLabel, IsoWeekday } from '@shared/clubAdmin/contract';
import { clubWallTimeToUtc, isClubDate, isClubTime, timeToMinutes } from '@shared/clubAdmin/clubTime';
import { FilterChips, Field, inputClass } from '@/components/clubAdmin/console/controls';
import { useConsoleFormat, type ConsoleFormat } from '@/components/clubAdmin/console/format';
import { Card, EmptyState, ErrorState, Section, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { SaveBar, UnsavedChangesGuard } from '@/components/clubAdmin/club/formChrome';
import { useFormBottomPadding, validationFieldErrors } from '@/components/clubAdmin/club/formHooks';
import { WEEKDAYS } from '@/components/clubAdmin/club/hoursModel';
import {
  buildPricingBody,
  centsToInput,
  dayPriceSegments,
  parseMoneyInput,
  ruleMinuteToTime,
  timeToRuleMinute,
  validateRule,
  type PriceRuleDraft,
  type PriceSegment,
} from '@/components/clubAdmin/club/pricingModel';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import {
  useClubCourtsQuery,
  useClubPricingQuery,
  usePriceQuoteQuery,
  useSaveClubPricingMutation,
} from '@/queries/clubAdmin/clubArea';
import { SUPPORTED_CURRENCIES } from '@/utils/currency';

const BILLABLE_CANDIDATES: HoldLabel[] = ['WALK_IN', 'PHONE', 'ACADEMY', 'OTHER'];
const RULE_TONES = [
  'bg-primary-500/75',
  'bg-amber-500/75',
  'bg-emerald-500/75',
  'bg-sky-500/75',
  'bg-rose-500/75',
  'bg-violet-500/75',
  'bg-teal-500/75',
  'bg-orange-500/75',
];

interface RuleUi extends PriceRuleDraft {
  priceText: string;
  startText: string;
  endText: string;
}

interface PricingDraft {
  currency: string;
  rules: RuleUi[];
  billable: HoldLabel[];
  /** courtId → base rate text (major units). */
  baseRates: Record<string, string>;
}

let ruleSeq = 0;

function ruleFromText(r: RuleUi): RuleUi {
  return {
    ...r,
    pricePerHourCents: parseMoneyInput(r.priceText) ?? -1,
    startMinute: isClubTime(r.startText) ? timeToRuleMinute(r.startText, false) : NaN,
    endMinute: isClubTime(r.endText) ? timeToRuleMinute(r.endText, true) : NaN,
  };
}

function toDraft(p: ClubPricing, courts: readonly ClubAdminCourt[]): PricingDraft {
  return {
    currency: p.currency,
    rules: p.rules.map((r) => ({
      ...r,
      key: r.id,
      priceText: centsToInput(r.pricePerHourCents),
      startText: ruleMinuteToTime(r.startMinute),
      endText: ruleMinuteToTime(r.endMinute),
    })),
    billable: p.billableHoldLabels.filter((l) => l !== 'MAINTENANCE'),
    baseRates: Object.fromEntries(courts.map((c) => [c.id, centsToInput(c.pricePerHourCents)])),
  };
}

function snapshot(d: PricingDraft): string {
  return JSON.stringify({
    body: buildPricingBody(d.currency, d.rules, d.billable),
    text: d.rules.map((r) => [r.priceText, r.startText, r.endText]),
    base: d.baseRates,
  });
}

export function ClubPricingPage() {
  const { t } = useTranslation('clubAdmin');
  const { clubId, timeZone } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const hub = `${consoleBase(clubId)}/club`;
  useConsoleHeader({ title: t('club.pages.pricing.title'), backTo: hub });

  const pricingQ = useClubPricingQuery(clubId);
  const courtsQ = useClubCourtsQuery(clubId);
  const save = useSaveClubPricingMutation(clubId);
  const [draft, setDraft] = useState<PricingDraft | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const courts = useMemo(() => courtsQ.data ?? [], [courtsQ.data]);

  useEffect(() => {
    if (pricingQ.data && courtsQ.data && !draft) {
      const d = toDraft(pricingQ.data, courtsQ.data);
      setDraft(d);
      setBase(snapshot(d));
    }
  }, [pricingQ.data, courtsQ.data, draft]);

  const dirty = !!draft && base !== null && snapshot(draft) !== base;
  const bottomPad = useFormBottomPadding(dirty);

  const ruleErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of draft?.rules ?? []) {
      const e = validateRule(r);
      if (e) out[r.key] = e;
    }
    return out;
  }, [draft]);
  const baseRateErrors = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [id, text] of Object.entries(draft?.baseRates ?? {})) if (text.trim() && parseMoneyInput(text) === null) out[id] = true;
    return out;
  }, [draft]);

  if (pricingQ.isPending || courtsQ.isPending) return <SkeletonRows rows={6} className="mx-auto w-full max-w-3xl p-4 lg:p-6" />;
  if (pricingQ.isError || courtsQ.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void pricingQ.refetch();
          void courtsQ.refetch();
        }}
      />
    );
  }
  if (!draft || !pricingQ.data) return <SkeletonRows rows={6} className="mx-auto w-full max-w-3xl p-4 lg:p-6" />;

  const setRule = (key: string, patch: Partial<RuleUi>) =>
    setDraft((d) => (d ? { ...d, rules: d.rules.map((r) => (r.key === key ? ruleFromText({ ...r, ...patch }) : r)) } : d));
  const addRule = () => {
    ruleSeq += 1;
    const r: RuleUi = ruleFromText({
      key: `new-${ruleSeq}`,
      courtId: null,
      label: '',
      weekdays: [1, 2, 3, 4, 5],
      startMinute: 0,
      endMinute: 0,
      pricePerHourCents: 0,
      priceText: '',
      startText: '18:00',
      endText: '22:00',
    });
    setDraft((d) => (d ? { ...d, rules: [...d.rules, r] } : d));
  };

  const onSave = async () => {
    if (Object.keys(ruleErrors).length > 0 || Object.keys(baseRateErrors).length > 0) {
      setShowErrors(true);
      toast.error(t('club.form.fixErrors'));
      return;
    }
    const baseRates: Record<string, number | null> = {};
    for (const c of courts) {
      const text = draft.baseRates[c.id] ?? '';
      const cents = parseMoneyInput(text);
      if (cents !== c.pricePerHourCents) baseRates[c.id] = cents;
    }
    try {
      const saved = await save.mutateAsync({ pricing: buildPricingBody(draft.currency, draft.rules, draft.billable), baseRates });
      const nextCourts = courts.map((c) => (c.id in baseRates ? { ...c, pricePerHourCents: baseRates[c.id] } : c));
      const d = toDraft(saved, nextCourts);
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

  const weekdayShort = (wd: number) => fmt.weekdayShort(`2024-01-0${wd}`);
  const ruleTone = (key: string) => RULE_TONES[Math.max(0, draft.rules.findIndex((r) => r.key === key)) % RULE_TONES.length];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 lg:p-6" style={{ paddingBottom: bottomPad }}>
      {serverError ? (
        <p role="alert" className="rounded-xl bg-ca-danger-bg px-3.5 py-2.5 text-sm text-destructive">
          {t('club.profile.errors.server', { message: serverError })}
        </p>
      ) : null}

      <Section title={t('club.pricing.baseTitle')}>
        <Card className="space-y-4 p-4">
          <Field label={t('club.profile.currency')} htmlFor="ca-pricing-currency" hint={t('club.pricing.currencyHint')}>
            <select
              id="ca-pricing-currency"
              className={inputClass}
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
            >
              {(SUPPORTED_CURRENCIES as string[]).includes(draft.currency) ? null : <option value={draft.currency}>{draft.currency}</option>}
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {courts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('club.pricing.noCourts')}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-foreground">{t('club.pricing.baseRates')}</p>
              <p className="text-xs text-muted-foreground">{t('club.pricing.baseRatesHint')}</p>
              {courts.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <label htmlFor={`ca-base-${c.id}`} className={cx('min-w-0 flex-1 truncate text-sm', c.isActive ? 'text-foreground' : 'text-muted-foreground')}>
                    {c.name}
                  </label>
                  <div className="relative w-36">
                    <input
                      id={`ca-base-${c.id}`}
                      type="text"
                      inputMode="decimal"
                      className={cx(inputClass, 'py-2 pe-12 text-end tabular-nums', showErrors && baseRateErrors[c.id] && 'border-destructive')}
                      placeholder="—"
                      value={draft.baseRates[c.id] ?? ''}
                      onChange={(e) => setDraft({ ...draft, baseRates: { ...draft.baseRates, [c.id]: e.target.value } })}
                    />
                    <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {t('club.pricing.perHourUnit', { currency: draft.currency })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section
        title={t('club.pricing.rulesTitle')}
        action={
          <button type="button" className={buttonClass('ghost', 'min-h-9 px-2.5 text-[13px]')} onClick={addRule}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('club.pricing.addRule')}
          </button>
        }
      >
        <p className="px-1 text-xs text-muted-foreground">{t('club.pricing.rulesHint')}</p>
        {draft.rules.length === 0 ? (
          <Card>
            <EmptyState compact icon={Calculator} title={t('club.pricing.noRules')} body={t('club.pricing.noRulesBody')} />
          </Card>
        ) : (
          <div className="space-y-2">
            {draft.rules.map((r, i) => {
              const err = showErrors ? ruleErrors[r.key] : undefined;
              return (
                <Card key={r.key} className="space-y-3 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={cx('h-3 w-3 shrink-0 rounded-full', ruleTone(r.key))} aria-hidden />
                    <input
                      type="text"
                      className={cx(inputClass, 'flex-1 py-2')}
                      placeholder={t('club.pricing.rulePlaceholder', { n: i + 1 })}
                      aria-label={t('club.pricing.ruleLabel')}
                      maxLength={80}
                      value={r.label ?? ''}
                      onChange={(e) => setRule(r.key, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      className={iconButtonClass}
                      aria-label={t('club.pricing.removeRule', { n: i + 1 })}
                      onClick={() => setDraft({ ...draft, rules: draft.rules.filter((x) => x.key !== r.key) })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className={cx(inputClass, 'py-2')}
                      aria-label={t('club.pricing.ruleCourt')}
                      value={r.courtId ?? ''}
                      onChange={(e) => setRule(r.key, { courtId: e.target.value || null })}
                    >
                      <option value="">{t('club.pricing.allCourts')}</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={cx(inputClass, 'py-2 pe-12 text-end tabular-nums', err === 'price' && 'border-destructive')}
                        aria-label={t('club.pricing.rulePrice')}
                        placeholder="0"
                        value={r.priceText}
                        onChange={(e) => setRule(r.key, { priceText: e.target.value })}
                      />
                      <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {t('club.pricing.perHourUnit', { currency: draft.currency })}
                      </span>
                    </div>
                  </div>
                  <FilterChips
                    className={cx('flex-wrap overflow-visible', err === 'weekdays' && 'rounded-xl ring-1 ring-destructive')}
                    ariaLabel={t('club.pricing.ruleDays')}
                    options={WEEKDAYS.map((wd) => ({ value: String(wd), label: weekdayShort(wd) }))}
                    selected={r.weekdays.map(String)}
                    onToggle={(v) => {
                      const wd = Number(v) as IsoWeekday;
                      setRule(r.key, { weekdays: r.weekdays.includes(wd) ? r.weekdays.filter((x) => x !== wd) : [...r.weekdays, wd] });
                    }}
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      className={cx(inputClass, 'py-2', err === 'range' && 'border-destructive')}
                      aria-label={t('club.pricing.ruleFrom')}
                      value={r.startText}
                      onChange={(e) => setRule(r.key, { startText: e.target.value })}
                    />
                    <span className="text-muted-foreground" aria-hidden>
                      –
                    </span>
                    <input
                      type="time"
                      className={cx(inputClass, 'py-2', err === 'range' && 'border-destructive')}
                      aria-label={t('club.pricing.ruleTo')}
                      value={r.endText}
                      onChange={(e) => setRule(r.key, { endText: e.target.value })}
                    />
                  </div>
                  {err ? (
                    <p className="text-xs text-destructive" role="alert">
                      {t(`club.pricing.errors.${err}`)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('club.pricing.endHint')}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <WeekPreview draft={draft} courts={courts} fmt={fmt} tone={ruleTone} weekdayShort={weekdayShort} />

      <Section title={t('club.pricing.billableTitle')}>
        <Card className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">{t('club.pricing.billableHint')}</p>
          <FilterChips
            className="flex-wrap overflow-visible"
            ariaLabel={t('club.pricing.billableTitle')}
            options={BILLABLE_CANDIDATES.map((l) => ({ value: l, label: t(`holdLabel.${l}`) }))}
            selected={draft.billable}
            onToggle={(l) =>
              setDraft({ ...draft, billable: draft.billable.includes(l) ? draft.billable.filter((x) => x !== l) : [...draft.billable, l] })
            }
          />
          <p className="text-xs text-muted-foreground">{t('club.pricing.maintenanceNever')}</p>
        </Card>
      </Section>

      <QuoteTester courts={courts} dirty={dirty} />

      <SaveBar
        visible={dirty}
        saving={save.isPending}
        onSave={() => void onSave()}
        onDiscard={() => {
          const d = toDraft(pricingQ.data, courts);
          setDraft(d);
          setShowErrors(false);
          setServerError(null);
        }}
      />
      <UnsavedChangesGuard dirty={dirty} fallback={hub} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly preview
// ---------------------------------------------------------------------------

function WeekPreview({
  draft,
  courts,
  fmt,
  tone,
  weekdayShort,
}: {
  draft: PricingDraft;
  courts: readonly ClubAdminCourt[];
  fmt: ConsoleFormat;
  tone: (ruleKey: string) => string;
  weekdayShort: (wd: number) => string;
}) {
  const { t } = useTranslation('clubAdmin');
  const [courtId, setCourtId] = useState<string>(() => courts.find((c) => c.isActive)?.id ?? courts[0]?.id ?? '');
  const court = courts.find((c) => c.id === courtId) ?? null;
  const baseCents = court ? parseMoneyInput(draft.baseRates[court.id] ?? '') : null;
  const valid = draft.rules.filter((r) => validateRule(r) === null);

  const label = (s: PriceSegment) => {
    const range = `${fmt.wallTime(s.startMinute)}–${s.endMinute >= 1440 ? fmt.wallTime(0) : fmt.wallTime(s.endMinute)}`;
    if (s.source.kind === 'none') return `${range} · ${t('club.pricing.noPrice')}`;
    const price = fmt.money(s.source.pricePerHourCents, draft.currency);
    if (s.source.kind === 'base') return `${range} · ${t('club.pricing.baseRateShort')} · ${price}`;
    const key = s.source.ruleKey;
    const rule = draft.rules.find((r) => r.key === key);
    const name = rule?.label?.trim() || t('club.pricing.rulePlaceholder', { n: draft.rules.findIndex((r) => r.key === key) + 1 });
    return `${range} · ${name} · ${price}`;
  };

  return (
    <Section
      title={t('club.pricing.previewTitle')}
      action={
        courts.length > 0 ? (
          <select
            className={cx(inputClass, 'w-auto py-1.5 text-sm')}
            aria-label={t('club.pricing.previewCourt')}
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <Card className="space-y-2 p-4">
        <div className="flex justify-between ps-12 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{fmt.wallTime((h % 24) * 60)}</span>
          ))}
        </div>
        <ul className="space-y-1.5">
          {WEEKDAYS.map((wd) => {
            const segs = dayPriceSegments(valid, court?.id ?? null, baseCents, wd);
            return (
              <li key={wd} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-medium capitalize text-muted-foreground">{weekdayShort(wd)}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-ca-sunken" role="list" aria-label={weekdayShort(wd)}>
                  {segs.map((s) => (
                    <div
                      key={s.startMinute}
                      role="listitem"
                      aria-label={label(s)}
                      title={label(s)}
                      className={cx(
                        'absolute inset-y-0 flex items-center justify-center overflow-hidden border-e border-background/60 text-[10px] font-semibold text-white tabular-nums',
                        s.source.kind === 'rule' ? tone(s.source.ruleKey) : s.source.kind === 'base' ? 'bg-muted-foreground/40' : 'bg-stripes'
                      )}
                      style={{ insetInlineStart: `${(s.startMinute / 1440) * 100}%`, width: `${((s.endMinute - s.startMinute) / 1440) * 100}%` }}
                    >
                      {s.source.kind !== 'none' && s.endMinute - s.startMinute >= 180
                        ? fmt.money(s.source.pricePerHourCents, draft.currency)
                        : null}
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t('club.pricing.previewHint')}</p>
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Quote tester (saved prices)
// ---------------------------------------------------------------------------

function QuoteTester({ courts, dirty }: { courts: readonly ClubAdminCourt[]; dirty: boolean }) {
  const { t } = useTranslation('clubAdmin');
  const { clubId, timeZone, today } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const [courtId, setCourtId] = useState(() => courts.find((c) => c.isActive)?.id ?? courts[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState(90);

  const q = useMemo(() => {
    if (!courtId || !isClubDate(date) || !isClubTime(time)) return null;
    const start = timeToMinutes(time);
    return {
      courtId,
      startTime: clubWallTimeToUtc(date, start, timeZone).toISOString(),
      endTime: clubWallTimeToUtc(date, start + duration, timeZone).toISOString(),
    };
  }, [courtId, date, time, duration, timeZone]);
  const quote = usePriceQuoteQuery(clubId, q);

  if (courts.length === 0) return null;
  return (
    <Section title={t('club.pricing.quoteTitle')}>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className={cx(inputClass, 'py-2')} aria-label={t('common.court')} value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" className={cx(inputClass, 'py-2')} aria-label={t('club.pricing.quoteDate')} value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className={cx(inputClass, 'py-2')} aria-label={t('club.pricing.quoteTime')} value={time} onChange={(e) => setTime(e.target.value)} />
          <select
            className={cx(inputClass, 'py-2')}
            aria-label={t('club.pricing.quoteDuration')}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {t('common.minutesShort', { count: m })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-ca-sunken px-3.5 py-3" aria-live="polite">
          <span className="text-sm text-muted-foreground">{t('club.pricing.quoteResult')}</span>
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {!q
              ? '—'
              : quote.isPending
                ? '…'
                : quote.isError
                  ? t('club.pricing.quoteError')
                  : quote.data?.amountCents == null
                    ? t('club.pricing.noPrice')
                    : fmt.money(quote.data.amountCents, quote.data.currency)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{dirty ? t('club.pricing.quoteSavedOnlyDirty') : t('club.pricing.quoteSavedOnly')}</p>
      </Card>
    </Section>
  );
}
