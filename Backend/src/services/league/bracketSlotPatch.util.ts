export type BracketSlotSideUpdate = {
  slotId: string;
  side?: 'A' | 'B';
};

export function hasDuplicateBracketSlotSideUpdates(
  updates: BracketSlotSideUpdate[]
): boolean {
  const keys = new Set(updates.map((update) => `${update.slotId}:${update.side ?? '_'}`));
  return keys.size !== updates.length;
}

export function stalePlayingParticipantIds(
  participants: Array<{
    id: string;
    userId: string;
    status: string;
    role: string;
  }>,
  allowedUserIds: ReadonlySet<string>
): string[] {
  return participants
    .filter(
      (participant) =>
        participant.role === 'PARTICIPANT' &&
        participant.status === 'PLAYING' &&
        !allowedUserIds.has(participant.userId)
    )
    .map((participant) => participant.id);
}
