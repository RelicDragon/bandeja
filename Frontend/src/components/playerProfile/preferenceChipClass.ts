const CHIP_BASE =
  'w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 border';

export const PREFERENCE_CHIP_SELECTED_CLASS =
  'bg-blue-600 border-blue-600 text-white shadow-[0_0_6px_rgba(37,99,235,0.55)]';

export const PREFERENCE_CHIP_UNSET_CLASS =
  'bg-gray-200 dark:bg-gray-800 border-dashed border-gray-500 dark:border-gray-400 text-gray-800 dark:text-gray-100';

export function getPreferenceChipClassName(selected: boolean): string {
  return `${CHIP_BASE} ${selected ? PREFERENCE_CHIP_SELECTED_CLASS : PREFERENCE_CHIP_UNSET_CLASS}`;
}
