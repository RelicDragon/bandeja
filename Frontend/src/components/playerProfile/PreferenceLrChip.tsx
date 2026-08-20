import { getPreferenceChipClassName } from './preferenceChipClass';

export interface PreferenceLrChipProps {
  selected: boolean;
  label: string;
  title: string;
  testId: string;
}

export function PreferenceLrChip({ selected, label, title, testId }: PreferenceLrChipProps) {
  return (
    <span
      className={getPreferenceChipClassName(selected)}
      title={title}
      aria-hidden="true"
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
    >
      <span className="text-[10px] font-semibold leading-none truncate">{label}</span>
    </span>
  );
}
