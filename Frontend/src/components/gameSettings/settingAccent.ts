export type GameSettingIconKey =
  | 'affectsRating'
  | 'isPublic'
  | 'showOnLiveRail'
  | 'anyoneCanInvite'
  | 'suitableForNovices'
  | 'resultsByAnyone'
  | 'allowDirectJoin'
  | 'autoFillFromQueue'
  | 'afterGameGoToBar'
  | 'participantsOnlyChat';

/** Settings whose row keeps a fixed accent on icon and title, whatever the row state. */
const ACCENTS: Partial<Record<GameSettingIconKey, string>> = {
  suitableForNovices: 'text-green-700 dark:text-green-400',
};

/** Title colour override for a settings row, or `undefined` to keep the row's own colour. */
export function settingAccentClass(setting: GameSettingIconKey): string | undefined {
  return ACCENTS[setting];
}
