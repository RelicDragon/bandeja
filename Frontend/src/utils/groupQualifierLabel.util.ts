/** Group letter from canonical order (A, B, C, …). */
export function groupLetterAtIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

export function buildGroupQualifierLabels(
  includedGroups: Array<{ id: string; name: string }>,
  qualifiers: Record<string, string[]>
): Map<string, string> {
  const labels = new Map<string, string>();
  for (let gi = 0; gi < includedGroups.length; gi++) {
    const group = includedGroups[gi];
    const letter = groupLetterAtIndex(gi);
    const ids = qualifiers[group.id] ?? [];
    for (let rank = 0; rank < ids.length; rank++) {
      const id = ids[rank];
      if (id) labels.set(id, `${letter}${rank + 1}`);
    }
  }
  return labels;
}

export function qualifierLabelForParticipant(
  participantId: string | undefined,
  qualifierLabels: Map<string, string> | undefined,
  _seed: number
): string | undefined {
  if (!participantId) return undefined;
  return qualifierLabels?.get(participantId) ?? undefined;
}
