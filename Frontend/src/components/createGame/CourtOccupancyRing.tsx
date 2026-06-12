import { memo } from 'react';

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

  const fillClass = loading
    ? 'stroke-gray-300 dark:stroke-gray-600'
    : clamped >= 90
      ? 'stroke-red-500'
      : clamped >= 60
        ? 'stroke-amber-500'
        : selected
          ? 'stroke-primary-600 dark:stroke-primary-400'
          : 'stroke-primary-500';

  return (
    <svg width={size} height={size} className={`shrink-0 -rotate-90 ${loading ? 'animate-pulse' : ''}`}>
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
        strokeDashoffset={loading ? circumference : offset}
      />
    </svg>
  );
});
