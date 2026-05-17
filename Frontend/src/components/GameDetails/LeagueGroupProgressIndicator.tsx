const RING_SIZE = 24;
const STROKE = 2.5;

interface LeagueGroupProgressIndicatorProps {
  finished: number;
  total: number;
  color: string;
}

export function LeagueGroupProgressIndicator({ finished, total, color }: LeagueGroupProgressIndicatorProps) {
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, finished / total) : 0;
  const dashOffset = circumference * (1 - ratio);
  const center = RING_SIZE / 2;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
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
  );
}
