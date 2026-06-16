type Props = {
  compact?: boolean;
};

export function BooktimeBookingCardSkeleton({ compact = false }: Props) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800 ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5'
      }`}
    >
      <div className="animate-pulse space-y-2 pr-12">
        <div className="h-3.5 w-2/5 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/3 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
