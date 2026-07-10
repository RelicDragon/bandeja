import type { ComponentType, ReactNode, SVGProps } from 'react';
import { User, Users2 } from 'lucide-react';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

function splitMatchFormatLabel(label: string): { primary: string; secondary?: string } {
  const m = label.match(/^(.+?)\s*(\([^)]+\))$/);
  if (m) return { primary: m[1].trim(), secondary: m[2] };
  return { primary: label };
}

interface MatchFormatControlProps {
  playersPerMatch: number;
  allowedCounts: number[];
  onChange: (count: number) => void;
  labelSingles: string;
  labelDoubles: string;
  hintSingles: string;
  hintDoubles: string;
  /** Roster has 2 slots — show format but lock to singles (1v1). */
  disabled?: boolean;
}

export const MatchFormatControl = ({
  playersPerMatch,
  allowedCounts,
  onChange,
  labelSingles,
  labelDoubles,
  hintSingles,
  hintDoubles,
  disabled = false,
}: MatchFormatControlProps) => {
  if (allowedCounts.length <= 1) return null;

  return (
    <div>
      <div
        className={`flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {allowedCounts.map((count) => {
          const selected = playersPerMatch === count;
          const isSingles = count === 2;
          const isDoubles = count === 4;
          const mainLabel = isSingles ? labelSingles : isDoubles ? labelDoubles : String(count);
          const hintRaw = isSingles ? hintSingles : isDoubles ? hintDoubles : null;
          const hintLabel = hintRaw?.trim() ? hintRaw : null;
          const FormatIcon = isSingles ? User : isDoubles ? Users2 : null;
          const iconClass = selected
            ? 'text-white'
            : 'text-gray-500 dark:text-gray-400';
          const { primary: hintPrimary, secondary: hintSecondary } = hintLabel
            ? splitMatchFormatLabel(hintLabel)
            : { primary: '' };

          const iconRow = (Icon: LucideIcon, content: ReactNode) => (
            <span className="flex items-center justify-center gap-1 leading-tight">
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${iconClass}`}
                strokeWidth={2.25}
                aria-hidden
              />
              {content}
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${iconClass}`}
                strokeWidth={2.25}
                aria-hidden
              />
            </span>
          );

          const hintContent = hintLabel ? (
            hintSecondary ? (
              <span className="inline-flex flex-wrap items-baseline justify-center gap-x-0.5">
                <span className="text-[11px] font-bold tracking-tight">{hintPrimary}</span>
                <span
                  className={`text-[10px] font-semibold ${
                    selected ? 'text-white/85' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {hintSecondary}
                </span>
              </span>
            ) : (
              <span
                className={`text-[10px] font-medium ${
                  selected ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {hintLabel}
              </span>
            )
          ) : null;

          return (
            <button
              key={count}
              type="button"
              disabled={disabled}
              onClick={() => onChange(count)}
              className={`flex-1 min-h-10 py-1.5 px-1 rounded-md transition-all disabled:cursor-not-allowed ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm ring-1 ring-primary-600/30'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
              }`}
            >
              <span className="flex flex-col items-center justify-center gap-0.5 leading-tight">
                <span className="text-sm font-semibold">{mainLabel}</span>
                {hintContent && FormatIcon ? iconRow(FormatIcon, hintContent) : hintContent}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
