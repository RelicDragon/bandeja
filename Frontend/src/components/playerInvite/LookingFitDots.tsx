import type { FitCheck } from '@/api/playIntents';

const DIM_ORDER = ['dates', 'clubs', 'time', 'level', 'gender'] as const;

type Props = {
  fit: FitCheck[];
};

export function LookingFitDots({ fit }: Props) {
  const byDim = new Map(fit.map((check) => [check.dimension, check.ok]));
  const okCount = DIM_ORDER.filter((dimension) => byDim.get(dimension) === true).length;
  return (
    <div
      className="inline-flex items-center gap-[3px] rounded-full bg-gray-100/90 px-1.5 py-1 dark:bg-white/[0.07]"
      aria-label={`${okCount}/5`}
    >
      {DIM_ORDER.map((dimension) => {
        const ok = byDim.get(dimension) === true;
        return (
          <span
            key={dimension}
            className={`h-1.5 w-1.5 rounded-full ${
              ok
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
        );
      })}
    </div>
  );
}
