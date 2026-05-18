/** Name emphasis when serve guide marks this roster row as server (ball shown alongside). */
export function servingPlayerNameClassName(
  isServing: boolean,
  variant: 'panel' | 'tvLight' | 'tvDark' | 'broadcast'
): string {
  const serve = 'font-extrabold text-primary-700 dark:text-primary-300';
  switch (variant) {
    case 'panel':
      return isServing
        ? `min-w-0 truncate text-base leading-tight ${serve}`
        : 'min-w-0 truncate text-base font-bold leading-tight dark:text-gray-100';
    case 'tvLight':
      return isServing
        ? `min-w-0 truncate text-[clamp(0.95rem,2.8vw,1.75rem)] leading-tight ${serve}`
        : 'min-w-0 truncate text-[clamp(0.95rem,2.8vw,1.75rem)] font-bold leading-tight text-gray-900';
    case 'tvDark':
      return isServing
        ? 'min-w-0 truncate text-[clamp(0.95rem,2.8vw,1.75rem)] font-extrabold leading-tight text-primary-300'
        : 'min-w-0 truncate text-[clamp(0.95rem,2.8vw,1.75rem)] font-bold leading-tight text-white';
    case 'broadcast':
      return isServing
        ? 'min-w-0 truncate text-sm font-bold text-primary-700 sm:text-[0.95rem] dark:text-primary-300'
        : 'min-w-0 truncate text-sm font-medium sm:text-[0.95rem]';
  }
}
