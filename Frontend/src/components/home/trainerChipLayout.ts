export function getTrainerChipClassName({
  isSelected,
  hasTrainings,
}: {
  isSelected: boolean;
  hasTrainings: boolean;
}): string {
  const base = 'relative flex-shrink-0 flex flex-col items-center min-w-[5rem] w-max p-2 rounded-xl border-2 transition-all';

  if (isSelected) {
    return `${base} bg-primary-100 dark:bg-primary-900/40 border-primary-500 dark:border-primary-400`;
  }

  if (!hasTrainings) {
    return `${base} opacity-60 border-gray-200 dark:border-gray-600 hover:opacity-100 hover:border-primary-300 dark:hover:border-primary-600`;
  }

  return `${base} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600`;
}
