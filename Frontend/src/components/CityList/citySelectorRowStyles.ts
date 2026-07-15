/** Shared calm row language for city-selector browse + unified search. */
export const CITY_SELECTOR_ROW_IDLE =
  'border border-gray-200/70 dark:border-gray-700/70 bg-gray-50/60 dark:bg-gray-800/40 hover:bg-gray-100/80 dark:hover:bg-gray-800/65 hover:border-gray-300/90 dark:hover:border-gray-600';

export const CITY_SELECTOR_ROW_SELECTED =
  'border border-primary-400/50 bg-primary-50/85 dark:bg-primary-900/30 dark:border-primary-500/35';

export const CITY_SELECTOR_ROW_BASE =
  'w-full min-w-0 text-left rounded-xl transition-[colors,transform,border-color] duration-150 active:scale-[0.99]';

export const CITY_SELECTOR_CHECK =
  'shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white text-[0.65rem] font-semibold';

export const CITY_SELECTOR_ROW_PAD = 'px-3 py-2.5';

export function citySelectorRowClassName(isSelected: boolean, extra = ''): string {
  return `${CITY_SELECTOR_ROW_BASE} ${isSelected ? CITY_SELECTOR_ROW_SELECTED : CITY_SELECTOR_ROW_IDLE} ${extra}`.trim();
}
