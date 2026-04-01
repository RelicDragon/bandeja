import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';

type BubbleVariant = 'channel' | 'own' | 'other';

const variantClasses: Record<BubbleVariant, string> = {
  channel:
    'bg-black/[0.06] dark:bg-white/[0.1] text-gray-800 dark:text-gray-100 border-black/[0.08] dark:border-white/[0.12] hover:bg-black/[0.1] dark:hover:bg-white/[0.14]',
  own: 'bg-white/[0.18] text-white border-white/[0.22] hover:bg-white/[0.26]',
  other:
    'bg-black/[0.06] dark:bg-white/[0.08] text-blue-900 dark:text-blue-50 border-black/[0.08] dark:border-white/[0.12] hover:bg-black/[0.1] dark:hover:bg-white/[0.12]',
};

type Props = {
  direction: 'back' | 'forward';
  variant: BubbleVariant;
  'aria-label': string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
};

export const AudioSkip10Button: React.FC<Props> = ({
  direction,
  variant,
  'aria-label': ariaLabel,
  onClick,
  disabled,
  className = '',
}) => {
  const Icon = direction === 'back' ? Undo2 : Redo2;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex-shrink-0 inline-flex items-center justify-center gap-0.5 min-w-[2.25rem] h-9 px-1.5 rounded-full border backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-[transform,opacity,background-color] active:scale-[0.94] disabled:opacity-30 disabled:pointer-events-none disabled:active:scale-100 ${variantClasses[variant]} ${className}`}
    >
      <Icon className="w-[14px] h-[14px] shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="text-[10px] font-semibold tabular-nums leading-none pr-px">10</span>
    </button>
  );
};
