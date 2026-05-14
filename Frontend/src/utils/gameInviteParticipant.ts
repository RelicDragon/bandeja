import type { Game, GameParticipant, ParticipantStatus } from '@/types';

export type InviteDeletedSocketPayload = {
  inviteId: string;
  gameId?: string;
  participant?: GameParticipant;
  participantPatch?: {
    id?: string;
    userId: string;
    status: ParticipantStatus;
    inviteClosedAt?: string | null;
  };
};

export function isPendingGameInviteStatus(status: ParticipantStatus | string | undefined): boolean {
  return status === 'INVITED';
}

export function isPendingGameInvite(p: Pick<GameParticipant, 'status'> | { status?: string | null }): boolean {
  return p.status === 'INVITED';
}

export function isTerminalInviteStatus(status: ParticipantStatus | string | undefined): boolean {
  return status === 'INVITE_DECLINED' || status === 'INVITE_CANCELLED';
}

export function participantBlocksInvitePlayerPicker(p: Pick<GameParticipant, 'status'>): boolean {
  if (isTerminalInviteStatus(p.status)) return false;
  const s = p.status;
  return s === 'PLAYING' || s === 'NON_PLAYING' || s === 'IN_QUEUE' || s === 'GUEST' || s === 'INVITED';
}

export function getSortedTerminalInviteParticipants(participants: GameParticipant[] | undefined): GameParticipant[] {
  if (!participants?.length) return [];
  return participants
    .filter((p) => isTerminalInviteStatus(p.status))
    .slice()
    .sort((a, b) => {
      const ta = a.inviteClosedAt ? new Date(a.inviteClosedAt).getTime() : 0;
      const tb = b.inviteClosedAt ? new Date(b.inviteClosedAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
}

export function sortParticipantsForGameDetails(participants: GameParticipant[] | undefined): GameParticipant[] {
  if (!participants?.length) return [];
  const nonTerminal = participants.filter((p) => !isTerminalInviteStatus(p.status));
  const terminal = getSortedTerminalInviteParticipants(participants);
  return [...nonTerminal, ...terminal];
}

export function mergeGameWithInviteDeletedPayload(game: Game, payload: InviteDeletedSocketPayload): Game {
  const gid = payload.gameId;
  if (gid && gid !== game.id) return game;

  const participants = [...(game.participants ?? [])];

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
    return { ...game, participants };
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
        status: patch.status,
        inviteClosedAt: patch.inviteClosedAt !== undefined ? patch.inviteClosedAt : cur.inviteClosedAt,
      };
      return { ...game, participants };
    }
    return game;
  }

  return game;
}
