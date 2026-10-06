/**
 * `/my-clubs/:clubId/reports?period=7|30|90|custom&from&to&compare=1` — club reports
 * (`reports.view`; revenue, the collected KPI and the payments CSV only with `reports.revenue`).
 * Dates are club-local; definitions are the server's (`docs/domains/club-admin.md` → Reports).
 * KPI row with deltas vs the previous period of the same length, daily trend (one metric at a time),
 * weekday × hour heatmap, per-court and game-type bars, revenue, top regulars, rating trend, CSV.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Download,
  Gauge,
  Minus,
  Star,
  Swords,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { CLUB_REPORT_MAX_DAYS, type ClubReport, type ClubReportMetrics } from '@shared/clubAdmin/contract';
import { daysBetweenInclusive, isClubDate } from '@shared/clubAdmin/clubTime';
import { clubAdminBillingApi, type ReportCsvDataset } from '@/api/clubAdminBilling';
import { parseClubAdminError } from '@/api/clubAdminErrors';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { paymentsPath } from '@/clubAdmin/consoleNav';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { CLUB_PAYMENT_METHODS, formatCents } from '@/components/clubAdmin/billing/money';
import { personName } from '@/components/clubAdmin/console/bookingText';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { SegmentedControl, inputClass } from '@/components/clubAdmin/console/controls';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { Card, EmptyState, ErrorState, KpiTile, Section, SectionLink, Skeleton } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx } from '@/components/clubAdmin/console/classes';
import { deliverCsv, reportCsvFileName } from '@/components/clubAdmin/reports/csvDownload';
import { DailyTrendChart, HBarList, OccupancyHeatmap, RatingTrendChart, type TrendMetric } from '@/components/clubAdmin/reports/ReportCharts';
import { clampRange, metricDelta, previousRange, resolvePeriod, type MetricDelta, type ReportPeriodMode } from '@/components/clubAdmin/reports/reportPeriod';
import { clubAdminBillingKeys, toastClubAdminError, useClubReportQuery } from '@/queries/clubAdmin';
import type { BasicUser } from '@/types';

function DeltaLine({ delta, text }: { delta: MetricDelta | null; text: (d: MetricDelta) => string }) {
  const { t } = useTranslation('clubAdmin');
  if (!delta) return null;
  const Icon: LucideIcon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <p
      className={cx(
        'mt-0.5 inline-flex items-center gap-1 text-xs font-medium tabular-nums',
        delta.direction === 'up' ? 'text-ca-ok' : delta.direction === 'down' ? 'text-ca-warn' : 'text-muted-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t('reports.kpi.vsPrevious', { change: text(delta) })}</span>
    </p>
  );
}

function ChartCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cx('p-3.5 lg:p-4', className)}>{children}</Card>;
}

function hasActivity(m: ClubReportMetrics): boolean {
  return m.games.total > 0 || m.occupancy.bookedMinutes > 0 || m.holds.total > 0 || (m.revenue?.collectedCents ?? 0) > 0 || m.reviews.count > 0;
}

export function ClubReportsPage() {
  const { t } = useTranslation('clubAdmin');
  const { t: tApp } = useTranslation();
  const qc = useQueryClient();
  const { clubId, context, today, timeZone, can } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  const [params, setParams] = useSearchParams();
  useConsoleHeader({ title: t('nav.reports') });

  const period = resolvePeriod(params, today);
  const canRevenue = can('reports.revenue');
  const q = { from: period.from, to: period.to, compare: period.compare };
  const reportQ = useClubReportQuery(clubId, q);
  const report: ClubReport | undefined = reportQ.data;
  const stale = reportQ.isPlaceholderData;

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

  const setMode = (mode: ReportPeriodMode) =>
    mode === 'custom' ? setParam({ period: 'custom', from: period.from, to: period.to }) : setParam({ period: mode === '30' ? null : mode, from: null, to: null });
  const setCustom = (from: string, to: string) => {
    const r = clampRange(from, to);
    if (r) setParam({ period: 'custom', from: r.from, to: r.to });
  };

  const [metric, setMetric] = useState<TrendMetric>('occupancy');
  const [exporting, setExporting] = useState<ReportCsvDataset | null>(null);
  const exportCsv = async (dataset: ReportCsvDataset) => {
    setExporting(dataset);
    try {
      const blob = await clubAdminBillingApi.exportReportCsv(clubId, { from: period.from, to: period.to, dataset });
      const result = await deliverCsv(blob, reportCsvFileName(context.club.name, dataset, period.from, period.to));
      if (result === 'downloaded') toast.success(t('reports.export.done'));
    } catch (e) {
      toastClubAdminError(e);
    } finally {
      setExporting(null);
    }
  };

  const cur = report?.current;
  const prev = period.compare ? (report?.previous ?? null) : null;
  const revenue = canRevenue ? cur?.revenue : undefined;
  const currency = revenue?.currency ?? context.club.currency;
  const money = (c: number) => formatCents(c, currency, fmt.locale);
  const signed = useMemo(() => {
    const num = new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
    const pct = new Intl.NumberFormat(fmt.locale, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
    return { num: (n: number) => num.format(n), pct: (n: number) => pct.format(n / 100) };
  }, [fmt.locale]);
  const pctText = (d: MetricDelta) => (d.pct == null ? signed.num(d.diff) : signed.pct(d.pct));
  const ppText = (d: MetricDelta) => t('reports.kpi.points', { value: signed.num(Math.round(d.diff * 10) / 10) });
  const delta = (pick: (m: ClubReportMetrics) => number | null | undefined) => (cur && prev ? metricDelta(pick(cur), pick(prev)) : null);

  const prevRange = previousRange(period);
  const rangeLabel = `${fmt.dateMedium(period.from)} – ${fmt.dateMedium(period.to)}`;
  const parsedError = reportQ.isError ? parseClubAdminError(reportQ.error) : null;
  const loading = reportQ.isPending;

  const trendOptions: Array<{ value: TrendMetric; label: string }> = [
    { value: 'occupancy', label: t('reports.trend.occupancy') },
    { value: 'games', label: t('reports.trend.games') },
    { value: 'players', label: t('reports.trend.players') },
    ...(revenue ? [{ value: 'collected' as const, label: t('reports.trend.collected') }] : []),
  ];
  const trendMetric = trendOptions.some((o) => o.value === metric) ? metric : 'occupancy';
  const trendFormat = (v: number) =>
    trendMetric === 'occupancy' ? fmt.percent(v) : trendMetric === 'collected' ? money(v) : fmt.number(v);

  return (
    <ConsolePullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: clubAdminBillingKeys.reportsAll(clubId) })}>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-8 lg:p-6">
        {/* Period controls */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<ReportPeriodMode>
              ariaLabel={t('reports.period.label')}
              value={period.mode}
              onChange={setMode}
              options={[
                { value: '7', label: t('reports.period.days', { count: 7 }) },
                { value: '30', label: t('reports.period.days', { count: 30 }) },
                { value: '90', label: t('reports.period.days', { count: 90 }) },
                { value: 'custom', label: t('reports.period.custom') },
              ]}
            />
            <button
              type="button"
              aria-pressed={period.compare}
              onClick={() => setParam({ compare: period.compare ? null : '1' })}
              className={cx(
                'inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 motion-reduce:transition-none',
                period.compare ? 'border-primary-600 bg-primary-600/10 text-primary-700 dark:border-primary-400 dark:text-primary-300' : 'border-border bg-ca-surface text-foreground hover:bg-muted'
              )}
            >
              <span className={cx('relative h-4 w-7 rounded-full transition-colors', period.compare ? 'bg-primary-600 dark:bg-primary-400' : 'bg-ca-sunken')} aria-hidden>
                <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-[inset-inline-start]', period.compare ? 'start-3.5' : 'start-0.5')} />
              </span>
              {t('reports.period.compare')}
            </button>
          </div>
          {period.mode === 'custom' ? (
            <div className="grid max-w-md grid-cols-2 gap-2">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>{t('reports.period.from')}</span>
                <input
                  type="date"
                  className={cx(inputClass, 'py-2 text-sm tabular-nums')}
                  value={period.from}
                  max={period.to}
                  onChange={(e) => isClubDate(e.target.value) && setCustom(e.target.value, period.to)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>{t('reports.period.to')}</span>
                <input
                  type="date"
                  className={cx(inputClass, 'py-2 text-sm tabular-nums')}
                  value={period.to}
                  min={period.from}
                  onChange={(e) => isClubDate(e.target.value) && setCustom(period.from, e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <p className="px-1 text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {rangeLabel}
            {period.mode === 'custom' && daysBetweenInclusive(period.from, period.to) >= CLUB_REPORT_MAX_DAYS
              ? ` · ${t('reports.period.max', { count: CLUB_REPORT_MAX_DAYS })}`
              : ''}
            {period.compare ? ` · ${t('reports.period.vs', { range: `${fmt.dateMedium(prevRange.from)} – ${fmt.dateMedium(prevRange.to)}` })}` : ''}
          </p>
        </div>

        {parsedError && !report ? (
          parsedError.suffix === 'rangeTooLarge' ? (
            <ErrorState title={t('errors.rangeTooLarge')} body={t('reports.period.max', { count: CLUB_REPORT_MAX_DAYS })} />
          ) : (
            <ErrorState kind={parsedError.network ? 'offline' : 'error'} onRetry={() => void reportQ.refetch()} />
          )
        ) : (
          <div className={cx('space-y-5 transition-opacity duration-150', stale && 'opacity-60')} aria-busy={loading || stale}>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiTile icon={Gauge} tone="primary" label={t('reports.kpi.occupancy')} loading={loading} value={cur ? fmt.percent(cur.occupancy.pct) : '—'}>
                <DeltaLine delta={delta((m) => m.occupancy.pct)} text={ppText} />
              </KpiTile>
              <KpiTile
                icon={Swords}
                label={t('reports.kpi.games')}
                loading={loading}
                value={cur ? fmt.number(cur.games.total) : '—'}
                hint={cur && (cur.games.cancelled > 0 || cur.games.noShows > 0) ? t('reports.kpi.cancelledNoShows', { cancelled: cur.games.cancelled, noShows: cur.games.noShows }) : undefined}
              >
                <DeltaLine delta={delta((m) => m.games.total)} text={pctText} />
              </KpiTile>
              <KpiTile icon={Users} label={t('reports.kpi.players')} loading={loading} value={cur ? fmt.number(cur.players.unique) : '—'}>
                <DeltaLine delta={delta((m) => m.players.unique)} text={pctText} />
              </KpiTile>
              <KpiTile
                icon={UserPlus}
                label={t('reports.kpi.newPlayers')}
                loading={loading}
                value={cur ? fmt.number(cur.players.new) : '—'}
                hint={cur ? t('reports.kpi.returning', { count: cur.players.returning }) : undefined}
              >
                <DeltaLine delta={delta((m) => m.players.new)} text={pctText} />
              </KpiTile>
              {canRevenue ? (
                <KpiTile icon={CircleDollarSign} tone="ok" label={t('reports.kpi.collected')} loading={loading} value={revenue ? money(revenue.collectedCents) : '—'}>
                  <DeltaLine delta={delta((m) => m.revenue?.collectedCents)} text={pctText} />
                </KpiTile>
              ) : null}
              <KpiTile
                icon={Star}
                label={t('reports.kpi.rating')}
                loading={loading}
                value={cur?.reviews.averageStars != null ? fmt.number(cur.reviews.averageStars) : '—'}
                hint={cur ? t('reports.kpi.reviews', { count: cur.reviews.count }) : undefined}
              >
                <DeltaLine
                  delta={delta((m) => m.reviews.averageStars)}
                  text={(d) => signed.num(d.diff)}
                />
              </KpiTile>
            </div>

            {loading ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
                <Skeleton className="h-72 rounded-2xl" />
                <Skeleton className="h-72 rounded-2xl" />
              </div>
            ) : report && cur && !hasActivity(cur) ? (
              <Card>
                <EmptyState icon={BarChart3} title={t('reports.emptyTitle')} body={t('reports.emptyPeriodBody')} />
              </Card>
            ) : report && cur ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Section title={t('reports.trend.title')} id="ca-r-trend" className="lg:col-span-2">
                  <ChartCard>
                    <SegmentedControl<TrendMetric>
                      size="sm"
                      className="mb-3 max-w-full overflow-x-auto"
                      ariaLabel={t('reports.trend.metric')}
                      value={trendMetric}
                      onChange={setMetric}
                      options={trendOptions}
                    />
                    <DailyTrendChart
                      daily={report.daily}
                      metric={trendMetric}
                      fmt={fmt}
                      formatValue={trendFormat}
                      label={trendOptions.find((o) => o.value === trendMetric)?.label ?? ''}
                    />
                  </ChartCard>
                </Section>

                <Section title={t('reports.heatmap.title')} id="ca-r-heat">
                  <ChartCard>
                    <OccupancyHeatmap heatmap={report.heatmap} fmt={fmt} />
                  </ChartCard>
                </Section>

                <div className="space-y-5">
                  <Section title={t('reports.courts.title')} id="ca-r-courts">
                    <ChartCard>
                      {report.perCourt.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('reports.courts.none')}</p>
                      ) : (
                        <HBarList
                          ariaLabel={t('reports.courts.title')}
                          max={100}
                          rows={report.perCourt.map((c) => ({
                            key: c.courtId,
                            label: c.name,
                            value: c.occupancyPct,
                            valueText: fmt.percent(c.occupancyPct),
                            sub: t('reports.courts.games', { count: c.games }),
                          }))}
                        />
                      )}
                    </ChartCard>
                  </Section>
                  <Section title={t('reports.types.title')} id="ca-r-types">
                    <ChartCard>
                      {Object.keys(cur.games.byEntityType).length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('reports.types.none')}</p>
                      ) : (
                        <HBarList
                          ariaLabel={t('reports.types.title')}
                          rows={Object.entries(cur.games.byEntityType)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, n]) => ({
                              key: type,
                              label: tApp(`games.entityTypes.${type}`, { defaultValue: type }),
                              value: n,
                              valueText: fmt.number(n),
                            }))}
                        />
                      )}
                    </ChartCard>
                  </Section>
                </div>

                {revenue ? (
                  <Section
                    title={t('reports.revenue.title')}
                    id="ca-r-revenue"
                    action={can('billing.collect') ? <SectionLink to={`${paymentsPath(clubId)}?from=${period.from}&to=${period.to}`}>{t('reports.revenue.ledger')}</SectionLink> : null}
                  >
                    <ChartCard className="space-y-4">
                      <dl className="grid grid-cols-2 gap-3">
                        {(
                          [
                            ['expected', revenue.expectedCents],
                            ['charged', revenue.chargedCents],
                            ['collected', revenue.collectedCents],
                            ['outstanding', revenue.outstandingCents],
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k} className="rounded-xl bg-ca-sunken px-3 py-2.5">
                            <dt className="text-xs text-muted-foreground">{t(`reports.revenue.${k}`)}</dt>
                            <dd className={cx('text-lg font-semibold tabular-nums', k === 'collected' ? 'text-ca-ok' : k === 'outstanding' && v > 0 ? 'text-ca-warn' : 'text-foreground')}>
                              {money(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs text-muted-foreground">{t('reports.revenue.definitions')}</p>
                      {CLUB_PAYMENT_METHODS.some((m) => (revenue.byMethod[m] ?? 0) > 0) ? (
                        <HBarList
                          ariaLabel={t('reports.revenue.byMethod')}
                          rows={CLUB_PAYMENT_METHODS.filter((m) => (revenue.byMethod[m] ?? 0) > 0).map((m) => ({
                            key: m,
                            label: t(`billing.method.${m}`),
                            value: revenue.byMethod[m] ?? 0,
                            valueText: money(revenue.byMethod[m] ?? 0),
                          }))}
                        />
                      ) : null}
                    </ChartCard>
                  </Section>
                ) : null}

                <Section title={t('reports.regulars.title')} id="ca-r-regulars">
                  <ChartCard>
                    {report.topRegulars.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('reports.regulars.none')}</p>
                    ) : (
                      <ol className="divide-y divide-border">
                        {report.topRegulars.map((r, i) => (
                          <li key={r.user.id} className="flex items-center gap-3 py-2">
                            <span className="w-5 shrink-0 text-end text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                            <PlayerAvatar
                              player={
                                {
                                  id: r.user.id,
                                  firstName: r.user.firstName ?? undefined,
                                  lastName: r.user.lastName ?? undefined,
                                  avatar: r.user.avatar,
                                  level: 0,
                                  socialLevel: 0,
                                } as BasicUser
                              }
                              inlineFace
                              inlineFaceSize="md"
                              subscribePresence={false}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{personName(r.user) || '—'}</span>
                            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{t('reports.regulars.games', { count: r.games })}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </ChartCard>
                </Section>

                <Section title={t('reports.rating.title')} id="ca-r-rating">
                  <ChartCard>
                    {report.ratingTrend.some((w) => w.count > 0) ? (
                      <RatingTrendChart trend={report.ratingTrend} fmt={fmt} />
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('reports.rating.empty')}</p>
                    )}
                  </ChartCard>
                </Section>
              </div>
            ) : null}

            <Section title={t('reports.export.title')} id="ca-r-export">
              <ChartCard>
                <p className="mb-3 text-sm text-muted-foreground">{t('reports.export.body', { range: rangeLabel })}</p>
                <div className="flex flex-wrap gap-2">
                  {(['bookings', ...(canRevenue ? (['payments'] as const) : []), 'players'] as ReportCsvDataset[]).map((ds) => (
                    <button
                      key={ds}
                      type="button"
                      className={buttonClass('secondary')}
                      disabled={exporting !== null}
                      aria-busy={exporting === ds}
                      onClick={() => void exportCsv(ds)}
                    >
                      <Download className={cx('h-4 w-4', exporting === ds && 'motion-safe:animate-bounce')} aria-hidden />
                      {t(`reports.export.${ds}`)}
                    </button>
                  ))}
                </div>
              </ChartCard>
            </Section>

            <p className="px-1 text-xs text-muted-foreground">{t('reports.timezoneNote', { zone: report?.timezone ?? timeZone })}</p>
          </div>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
