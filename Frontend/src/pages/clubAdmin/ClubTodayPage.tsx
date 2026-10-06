/**
 * `/my-clubs/:clubId` — Today. KPIs, "Needs attention", "Up next", 7-day occupancy and the setup
 * checklist, all for the **club-local** today. Uses `GET /dashboard`; on a backend without it the
 * numbers are derived from today's schedule (no week chart in that mode).
 */
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock,
  Gauge,
  LayoutGrid,
  MapPinOff,
  RefreshCcw,
  Star,
  Swords,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ClubDashboard } from '@shared/clubAdmin/contract';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { sectionPath } from '@/clubAdmin/consoleNav';
import { BookingRow } from '@/components/clubAdmin/console/BookingRow';
import { ConsolePullToRefresh } from '@/components/clubAdmin/console/ConsolePullToRefresh';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { AttentionRow, EmptyState, ErrorState, KpiTile, RowList, Section, SectionLink, Skeleton, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { attentionRows, type AttentionIcon } from '@/components/clubAdmin/today/attentionModel';
import { deriveDashboard } from '@/components/clubAdmin/today/deriveDashboard';
import { SetupChecklistCard } from '@/components/clubAdmin/today/SetupChecklistCard';
import { WeekOccupancyChart } from '@/components/clubAdmin/today/WeekOccupancyChart';
import { useScheduleModel } from '@/components/clubAdmin/schedule/useScheduleModel';
import { clubAdminKeys, useClubDashboardQuery, useClubScheduleQuery } from '@/queries/clubAdmin';

const ATTENTION_ICON: Record<AttentionIcon, LucideIcon> = {
  conflict: AlertTriangle,
  sync: RefreshCcw,
  courts: LayoutGrid,
  court: MapPinOff,
  money: Wallet,
  reviews: Star,
};

function hours(minutes: number): number {
  return Math.round(minutes / 6) / 10;
}

export function ClubTodayPage() {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const { clubId, context, today, timeZone, nowMs, can } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  useConsoleHeader({ title: t('nav.today') });

  const dashboardQ = useClubDashboardQuery(clubId, today);
  const legacyMode = dashboardQ.isSuccess && dashboardQ.data === null;
  const scheduleQ = useClubScheduleQuery(clubId, today, { enabled: legacyMode });
  const { model } = useScheduleModel(legacyMode ? scheduleQ.data : undefined, today);

  const dashboard: ClubDashboard | null = useMemo(() => {
    if (dashboardQ.data) return dashboardQ.data;
    if (!legacyMode || !scheduleQ.data || !model) return null;
    return deriveDashboard({
      schedule: scheduleQ.data,
      window: model.window,
      courts: model.courts,
      nowMs,
      currency: context.club.currency,
      setup: context.setup,
    });
  }, [dashboardQ.data, legacyMode, scheduleQ.data, model, nowMs, context.club.currency, context.setup]);

  const loading = !dashboard && (dashboardQ.isPending || (legacyMode && (scheduleQ.isPending || !model)));
  const failed = !dashboard && (dashboardQ.isError || (legacyMode && scheduleQ.isError));
  const refresh = () => qc.invalidateQueries({ queryKey: clubAdminKeys.club(clubId) });

  const scheduleHref = (date: string) => `${sectionPath(clubId, 'schedule')}?date=${date}`;
  const rows = dashboard ? attentionRows(dashboard.attention, clubId, can) : [];
  const k = dashboard?.kpis;
  const showRevenue = can('reports.revenue') && k && k.expectedRevenueCents != null;

  return (
    <ConsolePullToRefresh onRefresh={refresh}>
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-8 lg:p-6">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <p className="text-[15px] font-semibold text-foreground">{fmt.dateLong(today)}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{fmt.time(new Date(nowMs))}</p>
        </div>

        {failed ? (
          <ErrorState onRetry={() => void refresh()} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="min-w-0 space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiTile
                  icon={Gauge}
                  label={t('today.kpi.occupancy')}
                  loading={loading}
                  tone="primary"
                  value={k ? fmt.percent(k.occupancyPct) : '—'}
                >
                  {k ? (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ca-sunken" aria-hidden>
                      <div
                        className="h-full rounded-full bg-ca-game transition-[width] duration-200 motion-reduce:transition-none"
                        style={{ width: `${Math.max(0, Math.min(100, k.occupancyPct))}%` }}
                      />
                    </div>
                  ) : null}
                </KpiTile>
                <KpiTile
                  icon={Clock}
                  label={t('today.kpi.bookedHours')}
                  loading={loading}
                  value={k ? t('today.kpi.hoursValue', { hours: fmt.number(hours(k.bookedMinutes)) }) : '—'}
                  hint={k ? t('today.kpi.ofOpenHours', { hours: fmt.number(hours(k.openMinutes)) }) : undefined}
                />
                <KpiTile
                  icon={Swords}
                  label={t('today.kpi.games')}
                  loading={loading}
                  value={k ? fmt.number(k.games) : '—'}
                  hint={k ? t('today.kpi.holdsAndExternal', { holds: k.holds, external: k.externalBookings }) : undefined}
                />
                <KpiTile icon={Users} label={t('today.kpi.players')} loading={loading} value={k ? fmt.number(k.players) : '—'} />
                {showRevenue && k ? (
                  <>
                    <KpiTile
                      icon={CircleDollarSign}
                      label={t('today.kpi.expected')}
                      value={fmt.money(k.expectedRevenueCents ?? 0, k.currency)}
                    />
                    {k.collectedCents != null ? (
                      <KpiTile
                        icon={Wallet}
                        label={t('today.kpi.collected')}
                        tone="ok"
                        value={fmt.money(k.collectedCents, k.currency)}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>

              <Section title={t('today.attention.title')} id="ca-attention">
                {loading ? (
                  <Skeleton className="h-16 rounded-2xl" />
                ) : rows.length === 0 ? (
                  <RowList>
                    <div className="flex items-center gap-3 px-3.5 py-3 text-sm text-muted-foreground">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ca-ok-bg text-ca-ok">
                        <Check className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      {t('today.attention.allClear')}
                    </div>
                  </RowList>
                ) : (
                  <RowList>
                    {rows.map((r) => (
                      <AttentionRow
                        key={r.id}
                        icon={ATTENTION_ICON[r.icon]}
                        tone={r.tone}
                        title={t(r.titleKey, {
                          ...r.values,
                          amount: r.amount ? fmt.money(r.amount.cents, r.amount.currency) : '',
                        })}
                        to={r.to ?? undefined}
                      />
                    ))}
                  </RowList>
                )}
              </Section>

              <Section
                title={t('today.upNext.title')}
                id="ca-upnext"
                action={can('schedule.view') ? <SectionLink to={scheduleHref(today)}>{t('today.upNext.openSchedule')}</SectionLink> : null}
              >
                {loading ? (
                  <SkeletonRows rows={3} />
                ) : !dashboard || dashboard.upNext.length === 0 ? (
                  <RowList>
                    <EmptyState compact icon={CalendarClock} title={t('today.upNext.emptyTitle')} body={t('today.upNext.emptyBody')} />
                  </RowList>
                ) : (
                  <RowList>
                    {dashboard.upNext.map((b) => (
                      <BookingRow
                        key={b.id}
                        item={b}
                        fmt={fmt}
                        nowMs={nowMs}
                        to={can('schedule.view') ? `${scheduleHref(today)}&focus=${encodeURIComponent(b.id)}` : undefined}
                      />
                    ))}
                  </RowList>
                )}
              </Section>
            </div>

            <div className="min-w-0 space-y-6">
              {dashboard && dashboard.week.length > 0 ? (
                <Section title={t('today.week.title')} id="ca-week">
                  <div className="rounded-2xl border border-border bg-ca-surface p-3 pt-4">
                    <WeekOccupancyChart week={dashboard.week} today={today} fmt={fmt} scheduleHref={scheduleHref} />
                  </div>
                </Section>
              ) : loading ? (
                <Skeleton className="h-44 rounded-2xl" />
              ) : null}
              <SetupChecklistCard />
              <p className="px-1 text-xs text-muted-foreground">{t('today.timezoneNote', { zone: timeZone })}</p>
            </div>
          </div>
        )}
      </div>
    </ConsolePullToRefresh>
  );
}
