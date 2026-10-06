/**
 * 7-day occupancy, one series (no legend — the section title names it). Single hue (primary),
 * 4 px rounded data-ends from one baseline, ≤ 24 px bars, hairline recessive grid, per-bar hover
 * tooltip; tapping a day opens its schedule. A visually hidden table carries the same numbers.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClubDashboard } from '@shared/clubAdmin/contract';
import type { ConsoleFormat } from '../console/format';

type Row = { date: string; label: string; pct: number; bookedMinutes: number; isToday: boolean };

type TooltipLike = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

function ChartTooltip({ active, payload, fmt }: TooltipLike & { fmt: ConsoleFormat }) {
  const { t } = useTranslation('clubAdmin');
  const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-border bg-ca-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{fmt.dateMedium(row.date)}</p>
      <p className="text-muted-foreground tabular-nums">
        {t('today.week.tooltip', { pct: fmt.percent(row.pct), hours: fmt.number(Math.round(row.bookedMinutes / 6) / 10) })}
      </p>
    </div>
  );
}

export function WeekOccupancyChart({
  week,
  today,
  fmt,
  scheduleHref,
}: {
  week: ClubDashboard['week'];
  today: string;
  fmt: ConsoleFormat;
  scheduleHref: (date: string) => string;
}) {
  const { t } = useTranslation('clubAdmin');
  const navigate = useNavigate();
  const rows: Row[] = week.map((d) => ({
    date: d.date,
    label: d.date === today ? t('common.today') : fmt.weekdayShort(d.date),
    pct: Math.max(0, Math.min(100, d.occupancyPct)),
    bookedMinutes: d.bookedMinutes,
    isToday: d.date === today,
  }));

  return (
    <div>
      <div className="h-36 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--ui-border)" strokeWidth={1} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              width={36}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--ui-muted-foreground)', fontSize: 11 }}
              tickFormatter={(v: number) => fmt.percent(v)}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: 'var(--ui-muted-foreground)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--ui-muted)', opacity: 0.6 }}
              content={(props: TooltipLike) => <ChartTooltip active={props.active} payload={props.payload} fmt={fmt} />}
            />
            <Bar
              dataKey="pct"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              fill="var(--ca-game)"
              isAnimationActive={false}
              cursor="pointer"
              onClick={(entry: { payload?: Row }) => {
                if (entry?.payload?.date) navigate(scheduleHref(entry.payload.date));
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('today.week.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('today.week.day')}</th>
            <th scope="col">{t('today.kpi.occupancy')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <th scope="row">{fmt.dateMedium(r.date)}</th>
              <td>{fmt.percent(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
