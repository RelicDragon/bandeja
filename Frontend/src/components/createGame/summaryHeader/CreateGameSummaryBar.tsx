import type { ReactNode } from 'react';

export interface SummaryChipItem {
  key: string;
  icon: ReactNode;
  label?: string;
  scrollKey?: string;
}

interface CreateGameSummaryBarProps {
  chips: SummaryChipItem[];
  onChipClick: (key: string) => void;
}

export const CreateGameSummaryBar = ({ chips, onChipClick }: CreateGameSummaryBarProps) => {
  if (chips.length === 0) return null;

  return (
    <div
      data-floating-summary-bar
      className="absolute inset-x-0 top-0 z-20 border-b border-gray-200/70 dark:border-gray-700/70 bg-white/85 dark:bg-gray-800/85 backdrop-blur-md shadow-sm"
    >
      <div
        className="max-w-2xl mx-auto flex flex-wrap items-center gap-1.5 px-4 py-2"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChipClick(chip.scrollKey ?? chip.key)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 active:scale-95 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:bg-gray-700/60"
          >
            <span className="shrink-0 text-gray-500 dark:text-gray-400">{chip.icon}</span>
            {chip.label ? <span className="max-w-[11rem] truncate">{chip.label}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
};
