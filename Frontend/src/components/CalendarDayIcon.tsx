import { Calendar } from 'lucide-react';

interface CalendarDayIconProps {
  day: number;
  size?: number;
  className?: string;
}

export const CalendarDayIcon = ({ day, size = 20, className = 'text-primary-600 dark:text-primary-400' }: CalendarDayIconProps) => {
  const dayClass =
    size <= 14 ? 'bottom-[2px] text-[5px]' : size <= 16 ? 'bottom-[2.5px] text-[6px]' : 'bottom-[3px] text-[7px]';

  return (
    <span className="relative inline-flex shrink-0" aria-hidden>
      <Calendar size={size} className={className} />
      <span className={`absolute inset-x-0 ${dayClass} text-center font-bold tabular-nums leading-none ${className}`}>
        {day}
      </span>
    </span>
  );
};
