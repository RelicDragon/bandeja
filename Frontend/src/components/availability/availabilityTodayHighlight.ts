/** Slightly dim days before today in the visible week. */
export const availabilityPastMutedClass = 'opacity-[0.52] saturate-[0.72]';

/** Per-cell + header tint for the current calendar day (no column/row frames). */

export const availabilityTodayHeaderClass = [
  'border-amber-500 bg-amber-200/85',
  'text-amber-950',
  'dark:border-amber-500 dark:bg-amber-600/40 dark:text-amber-50',
].join(' ');

export const availabilityTodayCaptionTextClass = 'font-bold';

/** Unavailable / empty hour or period cell on today — subtle amber tint. */
export const availabilityTodayCellOffClass = [
  'border-amber-400/55 bg-amber-50/90 ring-1 ring-inset ring-amber-200/50',
  'dark:border-amber-500/40 dark:bg-amber-950/30 dark:ring-amber-500/25',
].join(' ');

export const availabilityTodayCellOffHoverClass =
  'hover:bg-amber-100/90 dark:hover:bg-amber-900/40';

/** Available hour or period cell on today — keeps primary fill, strong amber edge. */
export const availabilityTodayCellOnAccentClass = [
  'border-amber-400',
  'ring-2 ring-inset ring-amber-300/95',
  'shadow-[inset_0_0_0_1px_rgba(251,191,36,0.65)]',
  'dark:ring-amber-400/80',
].join(' ');

/** Partially available period bucket on today. */
export const availabilityTodayCellPartialClass = [
  'border-amber-500 bg-amber-200/75',
  'dark:border-amber-500 dark:bg-amber-600/35',
].join(' ');
