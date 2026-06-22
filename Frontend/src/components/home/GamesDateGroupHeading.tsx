interface GamesDateGroupHeadingProps {
  label: string;
  className?: string;
}

export function GamesDateGroupHeading({ label, className = '' }: GamesDateGroupHeadingProps) {
  return (
    <div className={`mb-3 mt-1 flex items-center gap-3 px-1 ${className}`.trim()}>
      <div className="h-px min-w-[1rem] flex-1 bg-gray-300 dark:bg-gray-600" aria-hidden />
      <p className="shrink-0 text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</p>
      <div className="h-px min-w-[1rem] flex-1 bg-gray-300 dark:bg-gray-600" aria-hidden />
    </div>
  );
}
