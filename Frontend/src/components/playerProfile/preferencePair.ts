export type PreferencePair = {
  left: boolean | undefined;
  right: boolean | undefined;
};

export type PreferenceChipSelection = {
  leftSelected: boolean;
  rightSelected: boolean;
};

/** Display L/R as independent flags; missing values are unset. Both-true stays both-true. */
export function resolvePreferenceChipSelection(pair: PreferencePair): PreferenceChipSelection {
  return {
    leftSelected: pair.left === true,
    rightSelected: pair.right === true,
  };
}

export function preferenceGroupAriaLabel(
  groupLabel: string,
  leftTitle: string,
  rightTitle: string,
  selection: PreferenceChipSelection,
): string {
  const selected = [
    selection.leftSelected ? leftTitle : null,
    selection.rightSelected ? rightTitle : null,
  ].filter((title): title is string => title != null);
  return selected.length > 0 ? `${groupLabel}: ${selected.join(', ')}` : groupLabel;
}
