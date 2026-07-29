import './StatusPulseDot.css';

type Tone = 'red' | 'emerald';

type Props = {
  tone?: Tone;
  className?: string;
};

const TONE_BG: Record<Tone, string> = {
  red: 'bg-red-500 dark:bg-red-400 status-pulse-dot--red',
  emerald: 'bg-emerald-500 dark:bg-emerald-400 status-pulse-dot--emerald',
};

/** Pulsating status pip — same motion as calendar unread date-cell dots. */
export function StatusPulseDot({ tone = 'red', className = '' }: Props) {
  return (
    <div
      className={`h-2 w-2 shrink-0 rounded-full border border-white dark:border-gray-900 status-pulse-dot ${TONE_BG[tone]} ${className}`.trim()}
      aria-hidden
    />
  );
}
