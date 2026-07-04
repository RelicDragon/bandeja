import type {
  BasicUser,
  EntityType,
  Game,
  GameParticipant,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@/types';

export type CancelledGameParticipantSnapshot = {
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  user: BasicUser;
};

export type CancelledGame410Payload = {
  cancelled?: boolean;
  chatArchived?: boolean;
  entityType?: EntityType;
  name?: string | null;
  sport?: Sport;
  cancelledAt?: string;
  cancelledByUser?: BasicUser | null;
  parentId?: string | null;
  participants?: CancelledGameParticipantSnapshot[];
};

export type ArchivedGameChatMeta = {
  cancelledAt: string;
  cancelledByUser?: BasicUser | null;
  chatArchived: boolean;
};

export function isCancelledGame410Payload(
  data: unknown
): data is CancelledGame410Payload & { cancelled: true } {
  const d = data as CancelledGame410Payload | undefined;
  return d?.cancelled === true;
}

export function buildArchivedGameStub(gameId: string, payload: CancelledGame410Payload): Game {
  const cancelledAt = payload.cancelledAt ?? new Date().toISOString();
  const participants: GameParticipant[] = (payload.participants ?? []).map((p) => ({
    id: `archived-${p.userId}`,
    userId: p.userId,
    role: p.role,
    status: p.status,
    joinedAt: cancelledAt,
    user: p.user,
  }));

  return {
    id: gameId,
    entityType: payload.entityType ?? 'GAME',
    sport: payload.sport ?? 'PADEL',
    gameType: 'CLASSIC',
    name: payload.name,
    city: {} as Game['city'],
    startTime: cancelledAt,
    endTime: cancelledAt,
    maxParticipants: Math.max(participants.length, 4),
    minParticipants: 2,
    isPublic: true,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'ARCHIVED',
    resultsStatus: 'NONE',
    participants,
    parentId: payload.parentId ?? undefined,
  } as Game;
}

export function archivedMetaFrom410(payload: CancelledGame410Payload): ArchivedGameChatMeta {
  return {
    cancelledAt: payload.cancelledAt ?? new Date().toISOString(),
    cancelledByUser: payload.cancelledByUser ?? null,
    chatArchived: payload.chatArchived !== false,
  };
}

export function layoutInfoFrom410(
  payload: CancelledGame410Payload
): {
  entityType: string;
  name: string | null;
  sport?: Sport;
  cancelledAt: string;
  cancelledByUser?: BasicUser | null;
  participants?: CancelledGameParticipantSnapshot[];
} {
  return {
    entityType: payload.entityType ?? 'GAME',
    name: payload.name ?? null,
    sport: payload.sport,
    cancelledAt: payload.cancelledAt ?? new Date().toISOString(),
    cancelledByUser: payload.cancelledByUser ?? null,
    participants: payload.participants,
  };
}

export function isCancelledGameParticipant(
  participants: CancelledGameParticipantSnapshot[] | undefined,
  userId: string | undefined
): boolean {
  if (!participants?.length || !userId) return false;
  return participants.some((p) => p.userId === userId);
}
