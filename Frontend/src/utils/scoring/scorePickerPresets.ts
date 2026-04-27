export const SCORE_PICKER_PRESET_LAST_INDEX = 30;

export function splitScorePickerOptions(
  numberOptions: number[],
  keypadMax: number
): { presetValues: number[]; showMoreTile: boolean } {
  if (keypadMax <= SCORE_PICKER_PRESET_LAST_INDEX) {
    return { presetValues: numberOptions, showMoreTile: false };
  }
  return {
    presetValues: numberOptions.filter(n => n <= SCORE_PICKER_PRESET_LAST_INDEX),
    showMoreTile: true,
  };
}
