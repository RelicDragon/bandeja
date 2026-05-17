import type {
  Game,
  GameInviteOutcome,
  GameInviteOutcomeType,
  GameParticipant,
  ParticipantStatus,
} from '@/types';

export type InviteDeletedSocketPayload = {
  inviteId: string;
  gameId?: string;
  participant?: GameParticipant;
  participantPatch?: {
    id?: string;
    userId: string;
    status: string;
    inviteClosedAt?: string | null;
  };
  removedParticipantId?: string;
  removedUserId?: string;
  inviteOutcome?: {
    userId: string;
    outcome: GameInviteOutcomeType;
    closedAt: string;
    invitedByUserId: string | null;
  };
};

export function isPendingGameInviteStatus(status: ParticipantStatus | string | undefined): boolean {
  return status === 'INVITED';
}

export function isPendingGameInvite(p: Pick<GameParticipant, 'status'> | { status?: string | null }): boolean {
  return p.status === 'INVITED';
}

export function participantBlocksInvitePlayerPicker(p: Pick<GameParticipant, 'status'>): boolean {
  const s = p.status;
  return s === 'PLAYING' || s === 'NON_PLAYING' || s === 'IN_QUEUE' || s === 'GUEST' || s === 'INVITED';
}

/** User still tied to the game as player, queue, guest, or pending invite (not outcome-only). */
export function userHasActiveGameMembership(game: Game, userId: string | undefined): boolean {
  if (!userId) return false;
  return (game.participants ?? []).some(
    (p) =>
      p.userId === userId &&
      (p.status === 'PLAYING' ||
        p.status === 'NON_PLAYING' ||
        p.status === 'IN_QUEUE' ||
        p.status === 'GUEST' ||
        p.status === 'INVITED'),
  );
}

export function removeInviteOutcomeFromGame(game: Game, userId: string): Game {
  const next = (game.inviteOutcomes ?? []).filter((o) => o.userId !== userId);
  if (next.length === (game.inviteOutcomes ?? []).length) return game;
  return { ...game, inviteOutcomes: next };
}

/** Apply invite-deleted socket payload; return null if game should drop out of the current user's list. */
export function applyInviteDeletedToGame(
  game: Game,
  payload: InviteDeletedSocketPayload,
  currentUserId: string | undefined,
): Game | null {
  if (payload.gameId && payload.gameId !== game.id) return game;
  const merged = mergeGameWithInviteDeletedPayload(game, payload);
  if (!currentUserId) return merged;
  if (payload.removedUserId === currentUserId) return null;
  if (!userHasActiveGameMembership(merged, currentUserId)) return null;
  return merged;
}

export function applyInviteDeletedToGames(
  games: Game[],
  payload: InviteDeletedSocketPayload,
  currentUserId: string | undefined,
): Game[] {
  if (!payload.gameId) return games;
  return games.flatMap((g) => {
    if (g.id !== payload.gameId) return [g];
    const next = applyInviteDeletedToGame(g, payload, currentUserId);
    return next ? [next] : [];
  });
}

export function getSortedInviteOutcomes(outcomes: GameInviteOutcome[] | undefined): GameInviteOutcome[] {
  if (!outcomes?.length) return [];
  return outcomes.slice().sort((a, b) => {
    const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return ta - tb;
  });
}

export function mergeGameWithInviteDeletedPayload(game: Game, payload: InviteDeletedSocketPayload): Game {
  const gid = payload.gameId;
  if (gid && gid !== game.id) return game;

  let participants = [...(game.participants ?? [])];
  const inviteOutcomes = [...(game.inviteOutcomes ?? [])];

  if (payload.removedParticipantId || payload.removedUserId) {
    const rid = payload.removedParticipantId;
    const uid = payload.removedUserId;
    participants = participants.filter((p) => {
      if (rid && (p as { id?: string }).id === rid) return false;
      if (uid && p.userId === uid) return false;
      return true;
    });
  }

  if (payload.inviteOutcome) {
    const o = payload.inviteOutcome;
    const idx = inviteOutcomes.findIndex((row) => row.userId === o.userId);
    const stub: GameInviteOutcome = {
      id: `temp-${o.userId}`,
      gameId: game.id,
      userId: o.userId,
      outcome: o.outcome,
      invitedByUserId: o.invitedByUserId,
      closedAt: o.closedAt,
      user: inviteOutcomes[idx]?.user ?? ({ id: o.userId } as GameInviteOutcome['user']),
      invitedByUser: inviteOutcomes[idx]?.invitedByUser,
    };
    if (idx >= 0) {
      inviteOutcomes[idx] = { ...inviteOutcomes[idx], ...stub };
    } else {
      inviteOutcomes.push(stub);
    }
  }

  if (payload.participant) {
    const incoming = payload.participant;
    const byId =
      (incoming as { id?: string }).id != null
        ? participants.findIndex((p) => (p as { id?: string }).id === (incoming as { id?: string }).id)
        : -1;
    const byUser = participants.findIndex((p) => p.userId === incoming.userId);
    const idx = byId >= 0 ? byId : byUser;
    if (idx >= 0) {
      participants[idx] = { ...participants[idx], ...incoming };
    } else {
      participants.push(incoming);
    }
    return { ...game, participants, inviteOutcomes };
  }

  if (payload.participantPatch) {
    const patch = payload.participantPatch;
    const idx =
      patch.id != null
        ? participants.findIndex((p) => (p as { id?: string }).id === patch.id)
        : participants.findIndex((p) => p.userId === patch.userId);
    if (idx >= 0) {
      const cur = participants[idx];
      participants[idx] = {
        ...cur,
        status: patch.status as GameParticipant['status'],
        inviteClosedAt: patch.inviteClosedAt !== undefined ? patch.inviteClosedAt : cur.inviteClosedAt,
      };
    }
    return { ...game, participants, inviteOutcomes };
  }

  if (payload.removedParticipantId || payload.removedUserId || payload.inviteOutcome) {
    return { ...game, participants, inviteOutcomes };
  }

  return game;
}
