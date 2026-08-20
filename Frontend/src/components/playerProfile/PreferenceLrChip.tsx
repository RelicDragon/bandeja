import { getPreferenceChipClassName } from './preferenceChipClass';

export interface PreferenceLrChipProps {
  selected: boolean;
  label: string;
  title: string;
  testId: string;
}

export function PreferenceLrChip({ selected, label, title, testId }: PreferenceLrChipProps) {
  return (
    <div
      className={getPreferenceChipClassName(selected)}
      title={title}
      aria-pressed={selected}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
    >
      <span className="text-[8px] font-semibold leading-none truncate">{label}</span>
    </div>
  );
}
