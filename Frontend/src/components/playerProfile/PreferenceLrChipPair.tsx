import { PreferenceLrChip } from './PreferenceLrChip';
import { preferenceGroupAriaLabel, resolvePreferenceChipSelection } from './preferencePair';

export interface PreferenceLrChipPairProps {
  group: 'hand' | 'courtSide';
  groupLabel: string;
  left: boolean | undefined;
  right: boolean | undefined;
  leftLabel: string;
  rightLabel: string;
  leftTitle: string;
  rightTitle: string;
}

export function PreferenceLrChipPair({
  group,
  groupLabel,
  left,
  right,
  leftLabel,
  rightLabel,
  leftTitle,
  rightTitle,
}: PreferenceLrChipPairProps) {
  const selection = resolvePreferenceChipSelection({ left, right });

  return (
    <div
      className="flex gap-1"
      role="group"
      aria-label={preferenceGroupAriaLabel(groupLabel, leftTitle, rightTitle, selection)}
    >
      <PreferenceLrChip
        selected={selection.leftSelected}
        label={leftLabel}
        title={leftTitle}
        testId={`preference-chip-${group}-left`}
      />
      <PreferenceLrChip
        selected={selection.rightSelected}
        label={rightLabel}
        title={rightTitle}
        testId={`preference-chip-${group}-right`}
      />
    </div>
  );
}
