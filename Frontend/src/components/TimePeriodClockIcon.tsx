interface TimePeriodClockIconProps {
  startTime: Date | string;
  endTime?: Date | string | null;
  timezone?: string;
  size?: number;
  className?: string;
}

function getTimeParts(date: Date | string, timezone: string): { hours: number; minutes: number } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  return {
    hours: parseInt(parts.find((p) => p.type === 'hour')!.value, 10),
    minutes: parseInt(parts.find((p) => p.type === 'minute')!.value, 10),
  };
}

function timeToAngle(hours: number, minutes: number): number {
  const totalMinutes = (hours % 12) * 60 + minutes;
  return (totalMinutes / (12 * 60)) * 360 - 90;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSector(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  let end = endAngle;
  if (end <= startAngle) end += 360;
  const largeArc = end - startAngle > 180 ? 1 : 0;
  const startPt = polarToCartesian(cx, cy, r, startAngle);
  const endPt = polarToCartesian(cx, cy, r, end);
  return `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y} Z`;
}

export const TimePeriodClockIcon = ({
  startTime,
  endTime,
  timezone,
  size = 20,
  className = 'text-primary-600 dark:text-primary-400',
}: TimePeriodClockIconProps) => {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const cx = 12;
  const cy = 12;
  const faceRadius = 10.5;
  const periodRadius = 13.5;
  const strokeWidth = size <= 14 ? 1.75 : 2;
  const tickRadius = faceRadius * 0.72;
  const dotRadius = size <= 14 ? 0.32 : 0.38;
  const majorDotRadius = size <= 14 ? 0.72 : 0.88;
  const majorHours = new Set([0, 3, 6, 9]);
  const hourTicks = Array.from({ length: 12 }, (_, hour) =>
    polarToCartesian(cx, cy, tickRadius, timeToAngle(hour, 0))
  );

  let periodArc: string | null = null;
  if (endTime) {
    const start = getTimeParts(startTime, tz);
    const end = getTimeParts(endTime, tz);
    periodArc = describeSector(
      cx,
      cy,
      periodRadius,
      timeToAngle(start.hours, start.minutes),
      timeToAngle(end.hours, end.minutes)
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="-2.5 -2.5 29 29"
      fill="none"
      className={`inline-flex shrink-0 ${className}`}
      aria-hidden
    >
      {periodArc && (
        <path
          d={periodArc}
          className="fill-amber-400/55 dark:fill-amber-500/45 stroke-current"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
      <circle cx={cx} cy={cy} r={faceRadius} stroke="currentColor" strokeWidth={strokeWidth} />
      {hourTicks.map((tick, hour) => (
        <circle
          key={hour}
          cx={tick.x}
          cy={tick.y}
          r={majorHours.has(hour) ? majorDotRadius : dotRadius}
          fill="currentColor"
        />
      ))}
    </svg>
  );
};
