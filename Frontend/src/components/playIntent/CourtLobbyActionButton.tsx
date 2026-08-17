import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Tone = 'primary' | 'secondary' | 'ghost';

const TONE_CLASS: Record<Tone, string> = {
  primary:
    'bg-emerald-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_10px_22px_-10px_rgba(5,150,105,0.65)] hover:bg-emerald-500 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400',
  secondary:
    'border border-emerald-950/10 bg-white/75 text-emerald-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:bg-emerald-50 focus-visible:ring-emerald-500 dark:border-white/12 dark:bg-white/[0.07] dark:text-emerald-50 dark:hover:bg-white/[0.12]',
  ghost:
    'bg-black/[0.045] text-gray-700 hover:bg-black/[0.07] focus-visible:ring-gray-400 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]',
};

const ICON_WELL_CLASS: Record<Tone, string> = {
  primary: 'bg-white/18',
  secondary: 'bg-emerald-600/10 dark:bg-white/10',
  ghost: 'bg-black/[0.06] dark:bg-white/10',
};

export function CourtLobbyActionButton({
  tone = 'primary',
  icon,
  loading = false,
  className = '',
  children,
  ...props
}: {
  tone?: Tone;
  icon?: ReactNode;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-12 min-w-0 items-center justify-center gap-2.5 rounded-[18px] px-4 text-[15px] font-semibold tracking-[-0.015em] transition-[transform,background-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 enabled:active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 ${TONE_CLASS[tone]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : icon ? (
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${ICON_WELL_CLASS[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  );
}
