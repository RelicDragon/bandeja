import { useTranslation } from 'react-i18next';
import type { LeagueGroup } from '@/api/leagues';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import type { LeagueGroupGameProgressRow } from '@/utils/leagueGroupGameProgress';

const RING_SIZE = 24;
const STROKE = 2.5;

function ProgressRing({
  finished,
  total,
  color,
  label,
  ariaLabelKey,
}: {
  finished: number;
  total: number;
  color: string;
  label: string;
  ariaLabelKey: string;
}) {
  const { t } = useTranslation();
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, finished / total) : 0;
  const dashOffset = circumference * (1 - ratio);
  const center = RING_SIZE / 2;

  return (
    <div
      className="min-w-0 rounded-lg border border-gray-200/90 px-2 py-1.5 shadow-sm dark:border-gray-700/90"
      style={{ borderLeftWidth: 3, borderLeftColor: color, backgroundColor: getLeagueGroupSoftColor(color, '0c') }}
      title={t(ariaLabelKey, {
        name: label,
        finished,
        total,
      })}
    >
      <span className="mb-1 block max-w-[5rem] truncate text-[10px] font-semibold leading-tight text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90 shrink-0" aria-hidden>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            className="stroke-gray-200 dark:stroke-gray-700"
            strokeWidth={STROKE}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className="text-xs font-medium tabular-nums leading-none text-gray-900 dark:text-white">
          {finished}
          <span className="font-normal text-gray-500 dark:text-gray-400">/{total}</span>
        </span>
      </div>
    </div>
  );
}

interface LeagueGroupScheduleProgressProps {
  groups: LeagueGroup[];
  progress: LeagueGroupGameProgressRow[];
  ariaLabelKey?: string;
}

export const LeagueGroupScheduleProgress = ({
  groups,
  progress,
  ariaLabelKey = 'gameDetails.scheduleGroupProgressAria',
}: LeagueGroupScheduleProgressProps) => {
  const rows = progress.filter((row) => row.total > 0);
  if (rows.length === 0) return null;

  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {rows.map((row) => {
        const group = groupById.get(row.groupId);
        if (!group) return null;
        return (
          <ProgressRing
            key={row.groupId}
            finished={row.finished}
            total={row.total}
            color={getLeagueGroupColor(group.color)}
            label={group.name}
            ariaLabelKey={ariaLabelKey}
          />
        );
      })}
    </div>
  );
};
