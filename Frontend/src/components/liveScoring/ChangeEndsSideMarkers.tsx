import type { CSSProperties } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CourtFlipBounceArrow } from '@/components/liveScoring/CourtFlipBounceArrow';
import { SCHEMATIC_SIDE_RAIL_PX } from './liveSchematicFit';

function ChangeEndsBounceArrow({ direction }: { direction: 'up' | 'down' }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;
  const sign = direction === 'up' ? 1 : -1;

  return (
    <CourtFlipBounceArrow axis="y" sign={sign} className="inline-flex">
      <Icon size={12} strokeWidth={2.5} className="shrink-0 text-sky-800 dark:text-sky-100" />
    </CourtFlipBounceArrow>
  );
}

export function ChangeEndsSideTag({
  label,
  side,
  className,
  style,
}: {
  label: string;
  side: 'left' | 'right';
  className?: string;
  style?: CSSProperties;
}) {
  void side;
  return (
    <div
      aria-hidden
      className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-sky-500 bg-sky-100 px-0.5 py-1 shadow-md ring-2 ring-sky-400/40 dark:border-sky-400 dark:bg-sky-950/70 dark:ring-sky-500/30${className ? ` ${className}` : ''}`}
      style={{ width: SCHEMATIC_SIDE_RAIL_PX, ...style }}
    >
      <ChangeEndsBounceArrow direction="up" />
      <span className="max-h-full text-center text-[9px] font-extrabold leading-tight text-sky-950 [text-orientation:mixed] [writing-mode:vertical-rl] dark:text-sky-50">
        {label}
      </span>
      <ChangeEndsBounceArrow direction="down" />
    </div>
  );
}
