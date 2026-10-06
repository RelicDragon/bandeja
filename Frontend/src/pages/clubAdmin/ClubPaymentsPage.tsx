/**
 * `/my-clubs/:clubId/payments?from&to&method` — the payments ledger / cash-up (`billing.collect`,
 * STAFF included). Club-local date range (default today), method filter, totals for the whole
 * range (server-side, voided excluded), keyset list grouped by the club-local payment day.
 * A row opens its booking in the schedule (manual charges have none).
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Wallet } from 'lucide-react';
import type { ClubPaymentMethod, PaymentLedgerItem } from '@shared/clubAdmin/contract';
import { addDaysToDate, clubLocalDate, daysBetweenInclusive, isClubDate } from '@shared/clubAdmin/clubTime';
import { clubAdminBillingApi } from '@/api/clubAdminBilling';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { sectionPath } from '@/clubAdmin/consoleNav';
import { CLUB_PAYMENT_METHODS, formatCents } from '@/components/clubAdmin/billing/money';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { FilterChips, inputClass } from '@/components/clubAdmin/console/controls';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { EmptyState, ErrorState, RowList, Skeleton, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx } from '@/components/clubAdmin/console/classes';
import { personName } from '@/components/clubAdmin/console/bookingText';
import { clubAdminBillingKeys, toastClubAdminError, useClubPaymentsQuery } from '@/queries/clubAdmin';

const LEDGER_MAX_DAYS = 400;
type RangePreset = 'today' | 'yesterday' | 'week' | 'month';

export function ClubPaymentsPage() {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { clubId, context, today, timeZone, can } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const [params, setParams] = useSearchParams();
  useConsoleHeader({ title: t('billing.ledger.title'), backTo: sectionPath(clubId, 'bookings') });

  const rawFrom = params.get('from');
  const rawTo = params.get('to');
  let from = isClubDate(rawFrom) ? rawFrom : today;
  let to = isClubDate(rawTo) ? rawTo : from > today ? from : today;
  if (from > to) [from, to] = [to, from];
  if (daysBetweenInclusive(from, to) > LEDGER_MAX_DAYS) from = addDaysToDate(to, -(LEDGER_MAX_DAYS - 1));
  const methodRaw = params.get('method');
  const method = (CLUB_PAYMENT_METHODS as readonly string[]).includes(methodRaw ?? '') ? (methodRaw as ClubPaymentMethod) : null;

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (!v) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const presets: Record<RangePreset, { from: string; to: string }> = {
    today: { from: today, to: today },
    yesterday: { from: addDaysToDate(today, -1), to: addDaysToDate(today, -1) },
    week: { from: addDaysToDate(today, -6), to: today },
    month: { from: addDaysToDate(today, -29), to: today },
  };
  const activePreset = (Object.keys(presets) as RangePreset[]).find((k) => presets[k].from === from && presets[k].to === to);

  const list = useClubPaymentsQuery(clubId, from, to, method);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const totals = list.data?.pages[0]?.totals;
  const currency = totals?.currency ?? context.club.currency;
  const money = (c: number) => formatCents(c, currency, fmt.locale);
  const groups = useMemo(() => {
    const out: Array<{ date: string; items: PaymentLedgerItem[]; sum: number }> = [];
    for (const p of items) {
      const date = clubLocalDate(new Date(p.paidAt), timeZone);
      let g = out[out.length - 1];
      if (!g || g.date !== date) {
        g = { date, items: [], sum: 0 };
        out.push(g);
      }
      g.items.push(p);
      if (!p.voidedAt) g.sum += p.amountCents;
    }
    return out;
  }, [items, timeZone]);

  const [opening, setOpening] = useState<string | null>(null);
  const openBooking = async (p: PaymentLedgerItem) => {
    if (!can('schedule.view')) return;
    setOpening(p.id);
    try {
      const charge = await qc.fetchQuery({
        queryKey: clubAdminBillingKeys.charge(clubId, p.chargeId),
        queryFn: ({ signal }) => clubAdminBillingApi.getCharge(clubId, p.chargeId, { signal }),
        staleTime: 15_000,
      });
      const start = charge.startTime ?? p.bookingStartTime;
      const date = start ? clubLocalDate(new Date(start), timeZone) : clubLocalDate(new Date(p.paidAt), timeZone);
      const focus =
        charge.source.kind === 'game' ? `game:${charge.source.gameId}` : charge.source.kind === 'hold' ? `hold:${charge.source.holdId}` : null;
      navigate(`${sectionPath(clubId, 'schedule')}?date=${date}${focus ? `&focus=${encodeURIComponent(focus)}` : ''}`);
    } catch (e) {
      toastClubAdminError(e);
    } finally {
      setOpening(null);
    }
  };

  const dayLabel = (date: string) =>
    date === today ? `${t('common.today')} · ${fmt.dateMedium(date)}` : date === addDaysToDate(today, -1) ? `${t('common.yesterday')} · ${fmt.dateMedium(date)}` : fmt.dateLong(date);

  return (
    <ConsolePullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: clubAdminBillingKeys.paymentsAll(clubId) })}>
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-8 lg:p-6">
        <div className="space-y-3">
          <FilterChips<RangePreset>
            ariaLabel={t('billing.ledger.range')}
            options={(Object.keys(presets) as RangePreset[]).map((k) => ({ value: k, label: t(`billing.ledger.preset.${k}`) }))}
            selected={activePreset ? [activePreset] : []}
            onToggle={(k) => setParam({ from: presets[k].from === today && presets[k].to === today ? null : presets[k].from, to: presets[k].to === today ? null : presets[k].to })}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{t('billing.ledger.from')}</span>
              <input
                type="date"
                className={cx(inputClass, 'py-2 text-sm tabular-nums')}
                value={from}
                max={to}
                onChange={(e) => isClubDate(e.target.value) && setParam({ from: e.target.value, to })}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{t('billing.ledger.to')}</span>
              <input
                type="date"
                className={cx(inputClass, 'py-2 text-sm tabular-nums')}
                value={to}
                min={from}
                onChange={(e) => isClubDate(e.target.value) && setParam({ from, to: e.target.value })}
              />
            </label>
          </div>
          <FilterChips<ClubPaymentMethod>
            ariaLabel={t('billing.pay.method')}
            options={CLUB_PAYMENT_METHODS.map((m) => ({ value: m, label: t(`billing.method.${m}`) }))}
            selected={method ? [method] : []}
            onToggle={(m) => setParam({ method: m === method ? null : m })}
          />
        </div>

        <div className="rounded-2xl border border-border bg-ca-surface p-3.5" aria-live="polite">
          <p className="text-xs font-medium text-muted-foreground">{t('billing.ledger.collected')}</p>
          {totals ? (
            <>
              <p className="text-2xl font-semibold tracking-tight text-ca-ok tabular-nums">{money(totals.collectedCents)}</p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {CLUB_PAYMENT_METHODS.filter((m) => (totals.byMethod[m] ?? 0) > 0).map((m) => (
                  <div key={m} className="flex gap-1.5">
                    <dt className="text-muted-foreground">{t(`billing.method.${m}`)}</dt>
                    <dd className="font-medium text-foreground tabular-nums">{money(totals.byMethod[m] ?? 0)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : list.isError ? (
            <p className="text-2xl font-semibold text-muted-foreground">—</p>
          ) : (
            <Skeleton className="mt-1 h-8 w-28" />
          )}
        </div>

        {list.isPending ? (
          <SkeletonRows rows={5} />
        ) : list.isError && items.length === 0 ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={Wallet} title={t('billing.ledger.emptyTitle')} body={t('billing.ledger.emptyBody')} />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.date} aria-label={dayLabel(g.date)}>
                <h2 className="sticky top-0 z-10 -mx-1 flex justify-between gap-2 bg-background/95 px-2 py-2 text-[13px] font-semibold text-muted-foreground backdrop-blur tabular-nums">
                  <span>{dayLabel(g.date)}</span>
                  <span className="font-medium">{money(g.sum)}</span>
                </h2>
                <RowList>
                  {g.items.map((p) => {
                    const meta = [
                      fmt.time(p.paidAt),
                      p.courtName,
                      p.bookingStartTime ? t('billing.ledger.booking', { when: fmt.dateTime(p.bookingStartTime) }) : p.chargeDescription,
                      p.payerName,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    const body = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block text-[15px] font-semibold tabular-nums text-foreground', p.voidedAt && 'line-through opacity-60')}>
                            {money(p.amountCents)}
                            <span className="ms-2 text-xs font-medium text-muted-foreground">{t(`billing.method.${p.method}`)}</span>
                            {p.voidedAt ? <span className="ms-2 text-xs font-semibold uppercase text-muted-foreground">{t('billing.VOID')}</span> : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
                          {personName(p.recordedBy) ? (
                            <span className="block truncate text-xs text-muted-foreground">{t('billing.section.by', { name: personName(p.recordedBy) })}</span>
                          ) : null}
                        </span>
                        {can('schedule.view') ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden /> : null}
                      </>
                    );
                    const cls = 'flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none';
                    return can('schedule.view') ? (
                      <button key={p.id} type="button" className={cx(cls, opening === p.id && 'opacity-60')} disabled={opening === p.id} onClick={() => void openBooking(p)}>
                        {body}
                      </button>
                    ) : (
                      <div key={p.id} className={cls}>
                        {body}
                      </div>
                    );
                  })}
                </RowList>
              </section>
            ))}
            {list.hasNextPage ? (
              list.isFetchNextPageError ? (
                <ErrorState compact onRetry={() => void list.fetchNextPage()} />
              ) : (
                <button type="button" className={buttonClass('secondary', 'w-full')} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                  {list.isFetchingNextPage ? t('common.loading') : t('common.showMore')}
                </button>
              )
            ) : null}
          </div>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
