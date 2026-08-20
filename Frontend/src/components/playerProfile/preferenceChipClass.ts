const CHIP_BASE =
  'w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 border';

export const PREFERENCE_CHIP_SELECTED_CLASS =
  'bg-blue-500 dark:bg-blue-500 border-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]';

export const PREFERENCE_CHIP_UNSET_CLASS =
  'bg-transparent border-dashed border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500';

export function getPreferenceChipClassName(selected: boolean): string {
  return `${CHIP_BASE} ${selected ? PREFERENCE_CHIP_SELECTED_CLASS : PREFERENCE_CHIP_UNSET_CLASS}`;
}
