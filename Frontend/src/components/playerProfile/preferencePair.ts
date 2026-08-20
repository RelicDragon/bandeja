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
