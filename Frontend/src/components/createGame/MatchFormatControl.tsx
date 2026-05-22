interface MatchFormatControlProps {
  playersPerMatch: number;
  allowedCounts: number[];
  onChange: (count: number) => void;
  label: string;
  label1v1: string;
  label2v2: string;
  /** Roster has 2 slots — show format but lock to singles (1v1). */
  disabled?: boolean;
}

export const MatchFormatControl = ({
  playersPerMatch,
  allowedCounts,
  onChange,
  label,
  label1v1,
  label2v2,
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
          const optionLabel = count === 2 ? label1v1 : count === 4 ? label2v2 : String(count);
          return (
            <button
              key={count}
              type="button"
              disabled={disabled}
              onClick={() => onChange(count)}
              className={`flex-1 h-10 rounded-md font-semibold text-sm transition-all disabled:cursor-not-allowed ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
              }`}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
};
