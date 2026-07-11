import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';

interface LocationTimeStepHeaderProps {
  icon: LucideIcon;
  title: string;
  done?: boolean;
  trailing?: string | null;
}

export const LocationTimeStepHeader = ({
  icon: Icon,
  title,
  done = false,
  trailing,
}: LocationTimeStepHeaderProps) => (
  <div className="mb-2 flex items-center gap-2">
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
        done
          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {done ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
    </span>
    <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
    {trailing ? (
      <span
        className={`ml-auto max-w-[45%] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
          done
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
        }`}
      >
        {trailing}
      </span>
    ) : null}
  </div>
);
