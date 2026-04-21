export type AutomaticGenerationKind = 'two' | 'four' | 'fallback';

export type AutomaticGenerationCopyKey = AutomaticGenerationKind | 'fourFixedTeams';

export const automaticGenerationKind = (slots: number | undefined | null): AutomaticGenerationKind => {
  if (slots === 2) return 'two';
  if (slots === 4) return 'four';
  return 'fallback';
};

export const automaticGenerationCopyKey = (
  slots: number | undefined | null,
  hasFixedTeams?: boolean,
): AutomaticGenerationCopyKey => {
  const kind = automaticGenerationKind(slots);
  if (kind === 'four' && hasFixedTeams) return 'fourFixedTeams';
  return kind;
};
