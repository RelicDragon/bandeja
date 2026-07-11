interface CreateGameStepHeaderProps {
  step: number;
  title: string;
}

export const CreateGameStepHeader = ({ step, title }: CreateGameStepHeaderProps) => (
  <div className="flex items-center gap-2.5 pt-3 pb-0.5">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
      {step}
    </span>
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      {title}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent dark:from-gray-800" />
  </div>
);
