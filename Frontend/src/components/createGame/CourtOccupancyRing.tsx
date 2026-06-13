import { memo } from 'react';
import { Check } from 'lucide-react';

interface CourtOccupancyRingProps {
  percent: number;
  size?: number;
  loading?: boolean;
  selected?: boolean;
}

export const CourtOccupancyRing = memo(function CourtOccupancyRing({
  percent,
  size = 36,
  loading = false,
  selected = false,
}: CourtOccupancyRingProps) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circumference * (1 - clamped / 100);

  const trackClass = selected
    ? 'stroke-primary-200 dark:stroke-primary-800'
    : 'stroke-gray-200 dark:stroke-gray-700';

  const fillClass = clamped >= 90
    ? 'stroke-red-500'
    : clamped >= 60
      ? 'stroke-amber-500'
      : selected
        ? 'stroke-primary-600 dark:stroke-primary-400'
        : 'stroke-primary-500';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className={`-rotate-90 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={trackClass}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={fillClass}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {selected ? (
        <Check
          size={Math.round(size * 0.45)}
          strokeWidth={3}
          className="absolute inset-0 m-auto text-primary-600 dark:text-primary-400 pointer-events-none"
          aria-hidden
        />
      ) : null}
    </div>
  );
});
