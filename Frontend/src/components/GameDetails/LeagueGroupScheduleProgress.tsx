import { useTranslation } from 'react-i18next';
import type { LeagueGroup } from '@/api/leagues';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import type { LeagueGroupGameProgressRow } from '@/utils/leagueGroupGameProgress';

const RING_SIZE = 24;
const STROKE = 2.5;
const ALL_GROUPS_COLOR = '#64748b';

function ProgressRing({
  finished,
  total,
  color,
  label,
  ariaLabelKey,
  onClick,
  isSelected,
}: {
  finished: number;
  total: number;
  color: string;
  label: string;
  ariaLabelKey: string;
  onClick?: () => void;
  isSelected?: boolean;
}) {
  const { t } = useTranslation();
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, finished / total) : 0;
  const dashOffset = circumference * (1 - ratio);
  const center = RING_SIZE / 2;

  const title = t(ariaLabelKey, { name: label, finished, total });
  const style = {
    borderLeftWidth: 3,
    borderLeftColor: color,
    backgroundColor: getLeagueGroupSoftColor(color, '0c'),
    ...(isSelected ? { boxShadow: `0 0 0 2px ${color}` } : {}),
  } as const;
  const className =
    'shrink-0 rounded-lg border border-gray-200/90 px-2 py-1.5 text-left shadow-sm transition dark:border-gray-700/90' +
    (onClick ? ' cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600' : '');

  const content = (
    <>
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        title={title}
        onClick={onClick}
        aria-pressed={isSelected}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={style} title={title}>
      {content}
    </div>
  );
}

interface LeagueGroupScheduleProgressProps {
  groups: LeagueGroup[];
  progress: LeagueGroupGameProgressRow[];
  selectedGroupId?: string;
  allGroupId?: string;
  ariaLabelKey?: string;
  onGroupSelect?: (groupId: string) => void;
}

export const LeagueGroupScheduleProgress = ({
  groups,
  progress,
  selectedGroupId,
  allGroupId = 'ALL',
  ariaLabelKey = 'gameDetails.scheduleGroupProgressAria',
  onGroupSelect,
}: LeagueGroupScheduleProgressProps) => {
  const { t } = useTranslation();
  const rows = progress.filter((row) => row.total > 0);
  const allProgress = rows.reduce(
    (acc, row) => ({ finished: acc.finished + row.finished, total: acc.total + row.total }),
    { finished: 0, total: 0 }
  );
  if (rows.length === 0) return null;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const showAllChip = Boolean(onGroupSelect && groups.length > 1);

  return (
    <div className="w-full min-w-0 overflow-x-auto pb-0.5 touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2">
      {showAllChip && (
        <ProgressRing
          key={allGroupId}
          finished={allProgress.finished}
          total={allProgress.total}
          color={ALL_GROUPS_COLOR}
          label={t('gameDetails.planner.scopeAll')}
          ariaLabelKey={ariaLabelKey}
          isSelected={selectedGroupId === allGroupId}
          onClick={() => onGroupSelect!(allGroupId)}
        />
      )}
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
            isSelected={selectedGroupId === row.groupId}
            onClick={onGroupSelect ? () => onGroupSelect(row.groupId) : undefined}
          />
        );
      })}
      </div>
    </div>
  );
};
