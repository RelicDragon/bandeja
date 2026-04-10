import { create } from 'zustand';
import { socketService } from '@/services/socketService';
import { invitesApi } from '@/api';
import { useHeaderStore } from './headerStore';
import { useAuthStore } from './authStore';
import { usePresenceStore } from './presenceStore';
import { useUserTeamsStore } from './userTeamsStore';
import { Game, Invite } from '@/types';
import { logChatSocketQueueTrim } from '@/services/chat/chatDiagnostics';

interface GameUpdateData {
  gameId: string;
  senderId: string;
  game: Game;
  forceUpdate?: boolean;
}

interface InviteDeletedData {
  inviteId: string;
  gameId?: string;
}

export interface ChatMessageData {
  contextType: string;
  contextId: string;
  message: any;
  messageId?: string;
  timestamp?: string;
  syncSeq?: number;
}

interface ChatReactionData {
  contextType: string;
  contextId: string;
  reaction: any;
  syncSeq?: number;
}

interface ChatReadReceiptData {
  contextType: string;
  contextId: string;
  readReceipt: any;
  syncSeq?: number;
}

interface ChatDeletedData {
  contextType: string;
  contextId: string;
  messageId: string;
  syncSeq?: number;
}

export interface ChatUnreadCountData {
  contextType: string;
  contextId: string;
  unreadCount: number;
  lastMessage?: unknown;
}

interface ChatMessageTranscriptionData {
  contextType: string;
  contextId: string;
  messageId: string;
  audioTranscription: { transcription: string; languageCode: string | null };
  timestamp?: string;
  syncSeq?: number;
}

interface BetCreatedData {
  gameId: string;
  bet: any;
}

interface BetUpdatedData {
  gameId: string;
  bet: any;
}

interface BetDeletedData {
  gameId: string;
  betId: string;
}

interface BetResolvedData {
  gameId: string;
  betId: string;
  winnerId: string;
  loserId: string;
}

interface GameResultsUpdatedData {
  gameId: string;
}

interface GameCancelledData {
  gameId: string;
  entityType: string;
  name?: string;
  cancelledAt: string;
  cancelledByUser?: import('@/types').BasicUser;
}

interface PollVoteData {
  contextType: string;
  contextId: string;
  pollId: string;
  messageId: string;
  updatedPoll: any;
  syncSeq?: number;
}

interface NewBugData {
  timestamp: string;
}

export type ChatRoomEvent =
  | { kind: 'message'; data: ChatMessageData }
  | { kind: 'reaction'; data: ChatReactionData }
  | { kind: 'readReceipt'; data: ChatReadReceiptData }
  | { kind: 'deleted'; data: ChatDeletedData }
  | { kind: 'messageUpdated'; data: ChatMessageData }
  | { kind: 'transcription'; data: ChatMessageTranscriptionData }
  | { kind: 'pollVote'; data: PollVoteData };

const CHAT_ROOM_QUEUE_CAP = 280;
const CHAT_FIFO_CAP = 500;

function chatRoomKey(contextType: string, contextId: string): string {
  return `${contextType}:${contextId}`;
}

function capQueue<T>(q: T[], cap: number, label: string): T[] {
  if (q.length <= cap) return q;
  logChatSocketQueueTrim(label, q.length - cap, cap);
  return q.slice(-cap);
}

interface SocketEventsState {
  gameUpdates: Map<string, GameUpdateData>;
  lastGameUpdate: GameUpdateData | null;
  lastNewInvite: Invite | null;
  lastInviteDeleted: InviteDeletedData | null;
  lastChatMessage: ChatMessageData | null;
  lastChatReaction: ChatReactionData | null;
  lastChatReadReceipt: ChatReadReceiptData | null;
  lastChatDeleted: ChatDeletedData | null;
  lastChatMessageUpdated: ChatMessageData | null;
  lastChatMessageTranscription: ChatMessageTranscriptionData | null;
  lastChatUnreadCount: ChatUnreadCountData | null;
  lastSyncRequired: { timestamp: string } | null;
  syncRequiredEpoch: number;
  lastBetCreated: BetCreatedData | null;
  lastBetUpdated: BetUpdatedData | null;
  lastBetDeleted: BetDeletedData | null;
  lastBetResolved: BetResolvedData | null;
  lastGameResultsUpdated: GameResultsUpdatedData | null;
  lastGameCancelled: GameCancelledData | null;
  lastPollVote: PollVoteData | null;
  lastNewBug: NewBugData | null;
  chatRoomQueues: Record<string, ChatRoomEvent[]>;
  chatRoomPushSeq: Record<string, number>;
  listChatMessageQueue: ChatMessageData[];
  listChatUnreadQueue: ChatUnreadCountData[];
  listChatMessageSeq: number;
  listChatUnreadSeq: number;
  groupUnreadInbound: ChatUnreadCountData[];
  groupUnreadSeq: number;
  userChatMessageQueue: ChatMessageData[];
  userChatReadReceiptQueue: ChatReadReceiptData[];
  takeChatRoomQueue: (key: string) => ChatRoomEvent[];
  takeListChatMessages: () => ChatMessageData[];
  takeListChatUnreads: () => ChatUnreadCountData[];
  takeGroupUnreadInbound: () => ChatUnreadCountData[];
  takeUserChatMessages: () => ChatMessageData[];
  takeUserChatReadReceipts: () => ChatReadReceiptData[];
  initialized: boolean;
  initialize: () => void;
  cleanup: () => void;
  clearLastBetCreated: () => void;
  clearLastBetUpdated: () => void;
  clearLastBetDeleted: () => void;
  clearLastBetResolved: () => void;
  clearLastGameCancelled: () => void;
}

export const useSocketEventsStore = create<SocketEventsState>((set, get) => {
  let unsubscribeHandlers: Array<() => void> = [];

  return {
    gameUpdates: new Map(),
    lastGameUpdate: null,
    lastNewInvite: null,
    lastInviteDeleted: null,
    lastChatMessage: null,
    lastChatReaction: null,
    lastChatReadReceipt: null,
    lastChatDeleted: null,
    lastChatMessageUpdated: null,
    lastChatMessageTranscription: null,
    lastChatUnreadCount: null,
    lastSyncRequired: null,
    syncRequiredEpoch: 0,
    lastBetCreated: null,
    lastBetUpdated: null,
    lastBetDeleted: null,
    lastBetResolved: null,
    lastGameResultsUpdated: null,
    lastGameCancelled: null,
    lastPollVote: null,
    lastNewBug: null,
    chatRoomQueues: {},
    chatRoomPushSeq: {},
    listChatMessageQueue: [],
    listChatUnreadQueue: [],
    listChatMessageSeq: 0,
    listChatUnreadSeq: 0,
    groupUnreadInbound: [],
    groupUnreadSeq: 0,
    userChatMessageQueue: [],
    userChatReadReceiptQueue: [],
    takeChatRoomQueue: (key) => {
      const q = get().chatRoomQueues[key];
      if (!q?.length) return [];
      set((s) => {
        const next = { ...s.chatRoomQueues };
        delete next[key];
        return { chatRoomQueues: next };
      });
      return q;
    },
    takeListChatMessages: () => {
      const q = get().listChatMessageQueue;
      if (!q.length) return [];
      set({ listChatMessageQueue: [] });
      return q;
    },
    takeListChatUnreads: () => {
      const q = get().listChatUnreadQueue;
      if (!q.length) return [];
      set({ listChatUnreadQueue: [] });
      return q;
    },
    takeGroupUnreadInbound: () => {
      const q = get().groupUnreadInbound;
      if (!q.length) return [];
      set({ groupUnreadInbound: [] });
      return q;
    },
    takeUserChatMessages: () => {
      const q = get().userChatMessageQueue;
      if (!q.length) return [];
      set({ userChatMessageQueue: [] });
      return q;
    },
    takeUserChatReadReceipts: () => {
      const q = get().userChatReadReceiptQueue;
      if (!q.length) return [];
      set({ userChatReadReceiptQueue: [] });
      return q;
    },
    initialized: false,
    initialize: () => {
      if (get().initialized) return;

      const handleNewInvite = (invite: Invite) => {
        const { setPendingInvites, triggerNewInviteAnimation } = useHeaderStore.getState();
        const currentCount = useHeaderStore.getState().pendingInvites;
        setPendingInvites(currentCount + 1);
        triggerNewInviteAnimation();
        set({ lastNewInvite: invite });
      };

      const handleInviteDeleted = (data: InviteDeletedData) => {
        const { setPendingInvites } = useHeaderStore.getState();
        const currentCount = useHeaderStore.getState().pendingInvites;
        setPendingInvites(Math.max(0, currentCount - 1));
        set({ lastInviteDeleted: data });
      };

      const handleGameUpdated = (data: GameUpdateData) => {
        set({ lastGameUpdate: data });
        get().gameUpdates.set(data.gameId, data);
      };

      const handleChatMessage = (data: ChatMessageData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => {
          const roomQ = capQueue(
            [...(s.chatRoomQueues[rk] ?? []), { kind: 'message' as const, data }],
            CHAT_ROOM_QUEUE_CAP,
            `room:${rk}`
          );
          const listQ = capQueue([...s.listChatMessageQueue, data], CHAT_FIFO_CAP, 'listMessage');
          const userQ =
            data.contextType === 'USER'
              ? capQueue([...s.userChatMessageQueue, data], CHAT_FIFO_CAP, 'userMessage')
              : s.userChatMessageQueue;
          return {
            lastChatMessage: data,
            chatRoomQueues: { ...s.chatRoomQueues, [rk]: roomQ },
            chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
            listChatMessageQueue: listQ,
            listChatMessageSeq: s.listChatMessageSeq + 1,
            userChatMessageQueue: userQ,
          };
        });
      };

      const handleChatReaction = (data: ChatReactionData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => ({
          lastChatReaction: data,
          chatRoomQueues: {
            ...s.chatRoomQueues,
            [rk]: capQueue([...(s.chatRoomQueues[rk] ?? []), { kind: 'reaction' as const, data }], CHAT_ROOM_QUEUE_CAP, `room:${rk}`),
          },
          chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
        }));
      };

      const handleChatReadReceipt = (data: ChatReadReceiptData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => {
          const roomQ = capQueue(
            [...(s.chatRoomQueues[rk] ?? []), { kind: 'readReceipt' as const, data }],
            CHAT_ROOM_QUEUE_CAP,
            `room:${rk}`
          );
          const userReadQ =
            data.contextType === 'USER'
              ? capQueue([...s.userChatReadReceiptQueue, data], CHAT_FIFO_CAP, 'userReadReceipt')
              : s.userChatReadReceiptQueue;
          return {
            lastChatReadReceipt: data,
            chatRoomQueues: { ...s.chatRoomQueues, [rk]: roomQ },
            chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
            userChatReadReceiptQueue: userReadQ,
          };
        });
      };

      const handleChatDeleted = (data: ChatDeletedData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => ({
          lastChatDeleted: data,
          chatRoomQueues: {
            ...s.chatRoomQueues,
            [rk]: capQueue([...(s.chatRoomQueues[rk] ?? []), { kind: 'deleted' as const, data }], CHAT_ROOM_QUEUE_CAP, `room:${rk}`),
          },
          chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
        }));
      };

      const handleChatMessageUpdated = (data: ChatMessageData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => ({
          lastChatMessageUpdated: data,
          chatRoomQueues: {
            ...s.chatRoomQueues,
            [rk]: capQueue(
              [...(s.chatRoomQueues[rk] ?? []), { kind: 'messageUpdated' as const, data }],
              CHAT_ROOM_QUEUE_CAP,
              `room:${rk}`
            ),
          },
          chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
        }));
      };

      const handleChatMessageTranscription = (data: ChatMessageTranscriptionData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => ({
          lastChatMessageTranscription: data,
          chatRoomQueues: {
            ...s.chatRoomQueues,
            [rk]: capQueue(
              [...(s.chatRoomQueues[rk] ?? []), { kind: 'transcription' as const, data }],
              CHAT_ROOM_QUEUE_CAP,
              `room:${rk}`
            ),
          },
          chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
        }));
      };

      const handleChatUnreadCount = (data: ChatUnreadCountData) => {
        set((s) => {
          const listU = capQueue([...s.listChatUnreadQueue, data], CHAT_FIFO_CAP, 'listUnread');
          const groupU =
            data.contextType === 'GROUP'
              ? capQueue([...s.groupUnreadInbound, data], CHAT_FIFO_CAP, 'groupUnread')
              : s.groupUnreadInbound;
          return {
            lastChatUnreadCount: data,
            listChatUnreadQueue: listU,
            listChatUnreadSeq: s.listChatUnreadSeq + 1,
            groupUnreadInbound: groupU,
            groupUnreadSeq: data.contextType === 'GROUP' ? s.groupUnreadSeq + 1 : s.groupUnreadSeq,
          };
        });
      };

      const handleSyncRequired = (data: { timestamp: string }) => {
        set((s) => ({
          lastSyncRequired: data,
          syncRequiredEpoch: s.syncRequiredEpoch + 1,
        }));
        invitesApi.getMyInvites('PENDING')
          .then((res) => useHeaderStore.getState().setPendingInvites(res.data.length))
          .catch(() => {});
      };

      const handleBetCreated = (data: BetCreatedData) => {
        set({ lastBetCreated: data });
      };

      const handleBetUpdated = (data: BetUpdatedData) => {
        set({ lastBetUpdated: data });
      };

      const handleBetDeleted = (data: BetDeletedData) => {
        set({ lastBetDeleted: data });
      };

      const handleBetResolved = (data: BetResolvedData) => {
        set({ lastBetResolved: data });
      };

      const handleGameResultsUpdated = (data: GameResultsUpdatedData) => {
        set({ lastGameResultsUpdated: data });
      };

      const handleGameCancelled = (data: GameCancelledData) => {
        set({ lastGameCancelled: data });
      };

      const handlePollVote = (data: PollVoteData) => {
        const rk = chatRoomKey(data.contextType, data.contextId);
        set((s) => ({
          lastPollVote: data,
          chatRoomQueues: {
            ...s.chatRoomQueues,
            [rk]: capQueue([...(s.chatRoomQueues[rk] ?? []), { kind: 'pollVote' as const, data }], CHAT_ROOM_QUEUE_CAP, `room:${rk}`),
          },
          chatRoomPushSeq: { ...s.chatRoomPushSeq, [rk]: (s.chatRoomPushSeq[rk] ?? 0) + 1 },
        }));
      };

      const handleNewBug = (data: NewBugData) => {
        set({ lastNewBug: data });
      };

      const refreshUserTeams = () => {
        useUserTeamsStore.getState().refreshAll().catch(() => {});
      };

      const handleUserTeamInvite = () => refreshUserTeams();
      const handleUserTeamInviteAccepted = () => refreshUserTeams();
      const handleUserTeamInviteDeclined = () => refreshUserTeams();
      const handleUserTeamMemberRemoved = () => refreshUserTeams();
      const handleUserTeamUpdated = () => refreshUserTeams();
      const handleUserTeamDeleted = (data: unknown) => {
        const payload = data as { teamId?: string };
        if (payload?.teamId) useUserTeamsStore.getState().removeTeamLocal(payload.teamId);
        else refreshUserTeams();
      };

      const handlePresenceInitial = (data: Record<string, boolean>) => {
        if (useAuthStore.getState().user?.showOnlineStatus === false) {
          usePresenceStore.getState().clearPresence();
          return;
        }
        if (data && typeof data === 'object') usePresenceStore.getState().setPresenceInitial(data);
      };
      const handlePresenceUpdate = (data: { online?: string[]; offline?: string[] }) => {
        if (useAuthStore.getState().user?.showOnlineStatus === false) return;
        if (data && typeof data === 'object') usePresenceStore.getState().setPresenceBatch(Array.isArray(data.online) ? data.online : [], Array.isArray(data.offline) ? data.offline : []);
      };

      socketService.on('new-invite', handleNewInvite);
      socketService.on('invite-deleted', handleInviteDeleted);
      socketService.on('game-updated', handleGameUpdated);
      socketService.on('chat:message', handleChatMessage);
      socketService.on('chat:reaction', handleChatReaction);
      socketService.on('chat:read-receipt', handleChatReadReceipt);
      socketService.on('chat:deleted', handleChatDeleted);
      socketService.on('chat:message-updated', handleChatMessageUpdated);
      socketService.on('chat:message-transcription', handleChatMessageTranscription);
      socketService.on('chat:unread-count', handleChatUnreadCount);
      socketService.on('sync-required', handleSyncRequired);
      socketService.on('bet:created', handleBetCreated);
      socketService.on('bet:updated', handleBetUpdated);
      socketService.on('bet:deleted', handleBetDeleted);
      socketService.on('bet:resolved', handleBetResolved);
      socketService.on('game-results-updated', handleGameResultsUpdated);
      socketService.on('game-cancelled', handleGameCancelled);
      socketService.on('chat:poll-vote', handlePollVote);
      socketService.on('new-bug', handleNewBug);
      socketService.on('user-team:invite', handleUserTeamInvite);
      socketService.on('user-team:invite-accepted', handleUserTeamInviteAccepted);
      socketService.on('user-team:invite-declined', handleUserTeamInviteDeclined);
      socketService.on('user-team:member-removed', handleUserTeamMemberRemoved);
      socketService.on('user-team:updated', handleUserTeamUpdated);
      socketService.on('user-team:deleted', handleUserTeamDeleted);
      socketService.on('presence-initial', handlePresenceInitial);
      socketService.on('presence-update', handlePresenceUpdate);

      unsubscribeHandlers = [
        () => socketService.off('new-invite', handleNewInvite),
        () => socketService.off('invite-deleted', handleInviteDeleted),
        () => socketService.off('game-updated', handleGameUpdated),
        () => socketService.off('chat:message', handleChatMessage),
        () => socketService.off('chat:reaction', handleChatReaction),
        () => socketService.off('chat:read-receipt', handleChatReadReceipt),
        () => socketService.off('chat:deleted', handleChatDeleted),
        () => socketService.off('chat:message-updated', handleChatMessageUpdated),
        () => socketService.off('chat:message-transcription', handleChatMessageTranscription),
        () => socketService.off('chat:unread-count', handleChatUnreadCount),
        () => socketService.off('sync-required', handleSyncRequired),
        () => socketService.off('bet:created', handleBetCreated),
        () => socketService.off('bet:updated', handleBetUpdated),
        () => socketService.off('bet:deleted', handleBetDeleted),
        () => socketService.off('bet:resolved', handleBetResolved),
        () => socketService.off('game-results-updated', handleGameResultsUpdated),
        () => socketService.off('game-cancelled', handleGameCancelled),
        () => socketService.off('chat:poll-vote', handlePollVote),
        () => socketService.off('new-bug', handleNewBug),
        () => socketService.off('user-team:invite', handleUserTeamInvite),
        () => socketService.off('user-team:invite-accepted', handleUserTeamInviteAccepted),
        () => socketService.off('user-team:invite-declined', handleUserTeamInviteDeclined),
        () => socketService.off('user-team:member-removed', handleUserTeamMemberRemoved),
        () => socketService.off('user-team:updated', handleUserTeamUpdated),
        () => socketService.off('user-team:deleted', handleUserTeamDeleted),
        () => socketService.off('presence-initial', handlePresenceInitial),
        () => socketService.off('presence-update', handlePresenceUpdate),
      ];

      set({ initialized: true });
    },
    cleanup: () => {
      unsubscribeHandlers.forEach(cleanup => cleanup());
      unsubscribeHandlers = [];
      set({
        initialized: false,
        gameUpdates: new Map(),
        lastGameUpdate: null,
        lastNewInvite: null,
        lastInviteDeleted: null,
        lastChatMessage: null,
        lastChatReaction: null,
        lastChatReadReceipt: null,
        lastChatDeleted: null,
        lastChatMessageUpdated: null,
        lastChatMessageTranscription: null,
        lastChatUnreadCount: null,
        lastSyncRequired: null,
        syncRequiredEpoch: 0,
        lastBetCreated: null,
        lastBetUpdated: null,
        lastBetDeleted: null,
        lastBetResolved: null,
        lastGameResultsUpdated: null,
        lastGameCancelled: null,
        lastPollVote: null,
        lastNewBug: null,
        chatRoomQueues: {},
        chatRoomPushSeq: {},
        listChatMessageQueue: [],
        listChatUnreadQueue: [],
        listChatMessageSeq: 0,
        listChatUnreadSeq: 0,
        groupUnreadInbound: [],
        groupUnreadSeq: 0,
        userChatMessageQueue: [],
        userChatReadReceiptQueue: [],
      });
    },
    clearLastBetCreated: () => set({ lastBetCreated: null }),
    clearLastGameCancelled: () => set({ lastGameCancelled: null }),
    clearLastBetUpdated: () => set({ lastBetUpdated: null }),
    clearLastBetDeleted: () => set({ lastBetDeleted: null }),
    clearLastBetResolved: () => set({ lastBetResolved: null }),
  };
});
