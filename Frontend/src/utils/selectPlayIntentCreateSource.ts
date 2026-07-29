import type { PlayIntentCreateSource } from '@shared/playIntentCreateSource';

export function selectPlayIntentCreateSource(
  source: PlayIntentCreateSource | undefined,
  selectedInviteeIds: string[],
): PlayIntentCreateSource | undefined {
  if (!source) return undefined;
  const selected = new Set(selectedInviteeIds);
  if (source.type === 'PROPOSAL') {
    return {
      ...source,
      inviteeIds: source.inviteeIds.filter((id) => selected.has(id)),
    };
  }
  return {
    ...source,
    invitees: source.invitees.filter((invitee) => selected.has(invitee.userId)),
  };
}

export function linkedPlayIntentInviteeIds(
  source: PlayIntentCreateSource | undefined,
): Set<string> {
  return new Set(
    source?.type === 'PROPOSAL'
      ? source.inviteeIds
      : source?.invitees.map((invitee) => invitee.userId) ?? [],
  );
}
