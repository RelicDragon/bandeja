type ParticipantRow = {
  userId: string;
  status: string;
  user?: unknown;
  [key: string]: unknown;
};

function mapParticipantRow(p: ParticipantRow) {
  return {
    ...p,
    isPlaying: p.status === 'PLAYING',
  };
}

function enrichParticipantsWithUsers(
  primary: ParticipantRow[],
  userSources: ParticipantRow[]
): ParticipantRow[] {
  if (primary.length === 0) return userSources;

  const usersByUserId = new Map<string, unknown>();
  for (const participant of userSources) {
    if (participant.user) usersByUserId.set(participant.userId, participant.user);
  }

  const enriched = primary.map((participant) =>
    participant.user
      ? participant
      : { ...participant, user: usersByUserId.get(participant.userId) ?? participant.user }
  );

  if (enriched.some((participant) => participant.user)) return enriched;
  return userSources.length > 0 ? userSources : primary;
}

/** Effective roster for @mentions — mirrors frontend resolveGameMentionParticipants. */
export function resolveGameMentionParticipantsFromGame(game: {
  participants?: ParticipantRow[];
  parentId?: string | null;
  parent?: { participants?: ParticipantRow[] } | null;
}): ReturnType<typeof mapParticipantRow>[] {
  const embedded = game.participants ?? [];
  const enrichPool = [...embedded, ...(game.parent?.participants ?? [])];

  if (embedded.length > 0) {
    const resolved = enrichParticipantsWithUsers(embedded, enrichPool);
    if (resolved.some((participant) => participant.user)) {
      return resolved.map(mapParticipantRow);
    }
  }

  if (game.parentId) {
    const parent = game.parent?.participants ?? [];
    if (parent.length > 0) return parent.map(mapParticipantRow);
  }

  if (embedded.length > 0) return embedded.map(mapParticipantRow);

  return [];
}
