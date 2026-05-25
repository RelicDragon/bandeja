import { useTranslation } from 'react-i18next';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { BracketColumn } from '@/utils/leagueBracketLayout';

interface BracketColumnPickerProps {
  columns: BracketColumn[];
  selectedColumnId: string;
  onSelect: (columnId: string) => void;
  layoutIdPrefix: string;
}

export function BracketColumnPicker({
  columns,
  selectedColumnId,
  onSelect,
  layoutIdPrefix,
}: BracketColumnPickerProps) {
  const { t } = useTranslation();
  if (columns.length <= 1) return null;

  if (columns.length <= 4) {
    return (
      <div className="flex w-full justify-center overflow-x-auto">
        <SegmentedSwitch
          tabs={columns.map((col) => ({
            id: col.id,
            label: col.label,
          }))}
          activeId={selectedColumnId}
          onChange={onSelect}
          showOnlyActiveTabText={false}
          layoutId={`${layoutIdPrefix}-bracket-column`}
          className="w-fit max-w-full"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <label className="sr-only" htmlFor={`${layoutIdPrefix}-bracket-column-select`}>
        {t('gameDetails.bracketColumnPickerLabel')}
      </label>
      <select
        id={`${layoutIdPrefix}-bracket-column-select`}
        value={selectedColumnId}
        onChange={(e) => onSelect(e.target.value)}
        className="max-w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        {columns.map((col) => (
          <option key={col.id} value={col.id}>
            {col.label}
          </option>
        ))}
      </select>
    </div>
  );
}
