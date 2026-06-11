import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components';

type GameActionTone = 'danger' | 'primary' | 'success';

const tones: Record<GameActionTone, { chip: string; button: string }> = {
  danger: {
    chip: 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400',
    button:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm shadow-red-600/20 hover:shadow-md hover:shadow-red-600/30',
  },
  primary: {
    chip: 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400',
    button:
      'bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white shadow-sm shadow-primary-600/20 hover:shadow-md hover:shadow-primary-600/30',
  },
  success: {
    chip: 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400',
    button:
      'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-sm shadow-green-600/20 hover:shadow-md hover:shadow-green-600/30',
  },
};

interface GameActionCardProps {
  icon: LucideIcon;
  title: string;
  tone?: GameActionTone;
  buttonLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}

export const GameActionCard = ({
  icon: Icon,
  title,
  tone = 'primary',
  buttonLabel,
  onClick,
  disabled,
  hint,
}: GameActionCardProps) => (
  <Card>
    <div className="space-y-3 p-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone].chip}`}>
            <Icon size={18} />
          </span>
          <h2 className="section-title">{title}</h2>
        </div>
        {buttonLabel && onClick && (
          <button
            onClick={onClick}
            disabled={disabled}
            className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone].button}`}
          >
            {buttonLabel}
          </button>
        )}
      </div>
      {hint && <p className="whitespace-pre-line text-sm text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  </Card>
);
