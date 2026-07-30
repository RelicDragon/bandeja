import { DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface PlayoffWizardHeaderProps {
  current: number;
  total: number;
  title: string;
  stepLabel: string;
}

export function PlayoffWizardHeader({
  current,
  total,
  title,
  stepLabel,
}: PlayoffWizardHeaderProps) {
  const progress = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  return (
    <DialogHeader className="!flex-col !items-stretch !gap-3 !px-6 !pb-4 !pt-5">
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold tabular-nums text-primary-700 shadow-sm dark:border-primary-800 dark:bg-primary-950/60 dark:text-primary-300">
          {current}/{total}
        </span>
      </div>

      <DialogTitle className="!pr-0 text-center text-xl font-bold tracking-tight">
        {title}
      </DialogTitle>

      <div
        role="progressbar"
        aria-label={stepLabel}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        className="mx-auto h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-500 to-sky-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </DialogHeader>
  );
}
