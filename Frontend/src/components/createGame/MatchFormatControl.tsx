interface MatchFormatControlProps {
  playersPerMatch: number;
  allowedCounts: number[];
  onChange: (count: number) => void;
  label: string;
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
  label,
  labelSingles,
  labelDoubles,
  hintSingles,
  hintDoubles,
  disabled = false,
}: MatchFormatControlProps) => {
  if (allowedCounts.length <= 1) return null;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{label}</label>
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
          const hintLabel = isSingles ? hintSingles : isDoubles ? hintDoubles : null;
          return (
            <button
              key={count}
              type="button"
              disabled={disabled}
              onClick={() => onChange(count)}
              className={`flex-1 min-h-10 py-1.5 rounded-md transition-all disabled:cursor-not-allowed ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
              }`}
            >
              <span className="flex flex-col items-center justify-center leading-tight">
                <span className="text-sm font-semibold">{mainLabel}</span>
                {hintLabel ? (
                  <span
                    className={`text-[10px] font-normal ${
                      selected ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {hintLabel}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
