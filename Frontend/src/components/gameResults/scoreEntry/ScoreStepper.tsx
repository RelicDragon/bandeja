import { Minus, Plus } from 'lucide-react';

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  onValueClick: () => void;
  max: number;
  orientation: 'horizontal' | 'vertical';
  valueAriaLabel: string;
}

const STEP_BUTTON_CLASS =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-xs transition-all duration-150 hover:bg-gray-50 hover:text-gray-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white';

export const ScoreStepper = ({
  value,
  onChange,
  onValueClick,
  max,
  orientation,
  valueAriaLabel,
}: ScoreStepperProps) => {
  const decrement = (
    <button
      type="button"
      aria-label="-1"
      onClick={() => onChange(Math.max(0, value - 1))}
      disabled={value <= 0}
      className={STEP_BUTTON_CLASS}
    >
      <Minus className="h-5 w-5" />
    </button>
  );

  const increment = (
    <button
      type="button"
      aria-label="+1"
      onClick={() => onChange(value + 1)}
      disabled={value >= max}
      className={STEP_BUTTON_CLASS}
    >
      <Plus className="h-5 w-5" />
    </button>
  );

  const valueButton = (
    <button
      type="button"
      aria-label={valueAriaLabel}
      onClick={onValueClick}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-gray-200 bg-white shadow-sm transition-all duration-150 hover:border-primary-400 hover:shadow-md active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-500 sm:h-[4.5rem] sm:w-[4.5rem]"
    >
      <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white sm:text-4xl">
        {value}
      </span>
    </button>
  );

  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col items-center gap-2">
        {increment}
        {valueButton}
        {decrement}
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-2">
      {decrement}
      {valueButton}
      {increment}
    </div>
  );
};
