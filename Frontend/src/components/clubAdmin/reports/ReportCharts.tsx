/**
 * Report visuals. One hue (`--ca-game`) for every magnitude — series identity is never needed
 * (each chart has one series; the section title names it), so there is no legend box except the
 * heatmap's sequential scale. Thin marks, 4 px rounded data-ends, recessive grid, crosshair/hover
 * tooltips, and every chart carries its numbers as text (visually hidden table or visible labels).
 */
import { useId, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClubReport } from '@shared/clubAdmin/contract';
import type { ConsoleFormat } from '../console/format';
import { cx } from '../console/classes';
import { tickEvery } from './reportPeriod';
import { HEAT_STEPS, heatFill, heatStep, heatmapHours } from './heatmap';

type TooltipLike = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

const AXIS_TICK = { fill: 'var(--ui-muted-foreground)', fontSize: 11 };

function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-ca-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-muted-foreground tabular-nums">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily trend (one metric at a time — never two y-scales)
// ---------------------------------------------------------------------------

export type TrendMetric = 'occupancy' | 'games' | 'players' | 'collected';

type TrendRow = { date: string; value: number };

export function DailyTrendChart({
  daily,
  metric,
  fmt,
  formatValue,
  label,
}: {
  daily: ClubReport['daily'];
  metric: TrendMetric;
  fmt: ConsoleFormat;
  formatValue: (v: number) => string;
  label: string;
}) {
  const { t } = useTranslation('clubAdmin');
  const gradientId = useId().replace(/:/g, '');
  const rows: TrendRow[] = daily.map((d) => ({
    date: d.date,
    value:
      metric === 'occupancy' ? d.occupancyPct : metric === 'games' ? d.games : metric === 'players' ? d.players : (d.collectedCents ?? 0),
  }));
  const every = tickEvery(rows.length);
  const ticks = rows.filter((_, i) => i % every === 0).map((r) => r.date);

  return (
    <div>
      <div className="h-48 w-full lg:h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ca-game)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--ca-game)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--ui-border)" strokeWidth={1} />
            <YAxis
              width={metric === 'collected' ? 56 : 36}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              allowDecimals={metric === 'occupancy'}
              domain={metric === 'occupancy' ? [0, 100] : [0, 'auto']}
              tickFormatter={(v: number) => formatValue(v)}
            />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(d: string) => (every === 1 ? fmt.weekdayShort(d) : `${fmt.dayOfMonth(d)}`)}
            />
            <Tooltip
              cursor={{ stroke: 'var(--ui-muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={(p: TooltipLike) => {
                const row = p.active ? (p.payload?.[0]?.payload as TrendRow | undefined) : undefined;
                return row ? <TooltipBox title={fmt.dateMedium(row.date)}>{`${label}: ${formatValue(row.value)}`}</TooltipBox> : null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--ca-game)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={rows.length <= 14 ? { r: 3, fill: 'var(--ca-game)', stroke: 'var(--ca-surface)', strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: 'var(--ca-game)', stroke: 'var(--ca-surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{t('reports.table.day')}</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <th scope="row">{fmt.dateMedium(r.date)}</th>
              <td>{formatValue(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekday × hour heatmap (sequential: one hue, light → dark, 5 steps + empty)
// ---------------------------------------------------------------------------

export function OccupancyHeatmap({ heatmap, fmt }: { heatmap: number[][]; fmt: ConsoleFormat }) {
  const { t } = useTranslation('clubAdmin');
  const hours = heatmapHours(heatmap);
  const weekdays = useMemo(() => {
    const long = new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', timeZone: 'UTC' });
    // 2026-01-05 is a Monday; noon UTC keeps the weekday stable in every zone.
    return Array.from({ length: 7 }, (_, i) => {
      const instant = new Date(Date.UTC(2026, 0, 5 + i, 12));
      return { i, short: fmt.weekdayShort(instant.toISOString().slice(0, 10)), long: long.format(instant) };
    });
  }, [fmt]);
  return (
    <div className="space-y-3">
      <table className="w-full table-fixed border-separate border-spacing-[2px] text-[11px]">
        <caption className="sr-only">{t('reports.heatmap.caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-11">
              <span className="sr-only">{t('reports.heatmap.hour')}</span>
            </th>
            {weekdays.map((w) => (
              <th key={w.i} scope="col" className="pb-1 text-center font-medium text-muted-foreground" abbr={w.long}>
                {w.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <th scope="row" className="pe-1 text-end font-normal text-muted-foreground tabular-nums">
                {fmt.wallTime(h * 60)}
              </th>
              {weekdays.map((w) => {
                const v = heatmap[w.i]?.[h] ?? 0;
                const text = t('reports.heatmap.cell', { day: w.long, hour: fmt.wallTime(h * 60), pct: fmt.percent(v) });
                return (
                  <td key={w.i} className="h-6 rounded-[4px] p-0 lg:h-7" style={{ background: heatFill(heatStep(v)) }} title={text}>
                    <span className="sr-only">{fmt.percent(v)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground" aria-hidden>
        <span>{t('reports.heatmap.legend')}</span>
        {[-1, 0, 1, 2, 3, 4].map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="h-3 w-5 rounded-[3px]" style={{ background: heatFill(s) }} />
            <span className="tabular-nums">
              {s < 0 ? fmt.percent(0) : s === 4 ? `> ${fmt.percent(HEAT_STEPS[4])}` : `${fmt.percent(HEAT_STEPS[s] + 1)}–${fmt.percent(HEAT_STEPS[s + 1])}`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars with direct labels (per court, game types, payment methods)
// ---------------------------------------------------------------------------

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  valueText: string;
  sub?: string;
}

export function HBarList({ rows, max, ariaLabel }: { rows: BarRow[]; max?: number; ariaLabel: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5" aria-label={ariaLabel}>
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {r.valueText}
              {r.sub ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">{r.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ca-sunken" aria-hidden>
            <div
              className={cx('h-full rounded-full bg-ca-game', r.value <= 0 && 'opacity-0')}
              style={{ width: `${Math.max(r.value > 0 ? 2 : 0, Math.min(100, (r.value / top) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Rating trend (weekly average, 1–5; empty weeks leave a gap)
// ---------------------------------------------------------------------------

type RatingRow = { weekStart: string; avg: number | null; count: number };

export function RatingTrendChart({ trend, fmt }: { trend: ClubReport['ratingTrend']; fmt: ConsoleFormat }) {
  const { t } = useTranslation('clubAdmin');
  const rows: RatingRow[] = trend.map((w) => ({ weekStart: w.weekStart, avg: w.averageStars, count: w.count }));
  const every = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <div>
      <div className="h-36 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--ui-border)" strokeWidth={1} />
            <YAxis domain={[1, 5]} ticks={[1, 3, 5]} width={24} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <XAxis
              dataKey="weekStart"
              ticks={rows.filter((_, i) => i % every === 0).map((r) => r.weekStart)}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickFormatter={(d: string) => fmt.dateMedium(d).replace(/^[^,]*,\s*/, '')}
            />
            <Tooltip
              cursor={{ stroke: 'var(--ui-muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={(p: TooltipLike) => {
                const row = p.active ? (p.payload?.[0]?.payload as RatingRow | undefined) : undefined;
                return row ? (
                  <TooltipBox title={t('reports.rating.week', { date: fmt.dateMedium(row.weekStart) })}>
                    {row.avg == null ? t('reports.rating.none') : t('reports.rating.value', { avg: fmt.number(row.avg), count: row.count })}
                  </TooltipBox>
                ) : null;
              }}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="var(--ca-game)"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: 'var(--ca-game)', stroke: 'var(--ca-surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('reports.rating.title')}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekStart}>
              <th scope="row">{t('reports.rating.week', { date: fmt.dateMedium(r.weekStart) })}</th>
              <td>{r.avg == null ? t('reports.rating.none') : t('reports.rating.value', { avg: fmt.number(r.avg), count: r.count })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
