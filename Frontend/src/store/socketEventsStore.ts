import { create } from 'zustand';
import { socketService } from '@/services/socketService';
import { invitesApi } from '@/api';
import { useHeaderStore } from './headerStore';
import { Game, Invite } from '@/types';

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

interface ChatMessageData {
  contextType: string;
  contextId: string;
  message: any;
  messageId?: string;
  timestamp?: string;
}

interface ChatReactionData {
  contextType: string;
  contextId: string;
  reaction: any;
}

interface ChatReadReceiptData {
  contextType: string;
  contextId: string;
  readReceipt: any;
}

interface ChatDeletedData {
  contextType: string;
  contextId: string;
  messageId: string;
}

interface ChatUnreadCountData {
  contextType: string;
  contextId: string;
  unreadCount: number;
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

interface PollVoteData {
  contextType: string;
  contextId: string;
  pollId: string;
  messageId: string;
  updatedPoll: any;
}

interface NewBugData {
  timestamp: string;
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
  lastChatUnreadCount: ChatUnreadCountData | null;
  lastSyncRequired: { timestamp: string } | null;
  lastBetCreated: BetCreatedData | null;
  lastBetUpdated: BetUpdatedData | null;
  lastBetDeleted: BetDeletedData | null;
  lastBetResolved: BetResolvedData | null;
  lastGameResultsUpdated: GameResultsUpdatedData | null;
  lastPollVote: PollVoteData | null;
  lastNewBug: NewBugData | null;
  initialized: boolean;
  initialize: () => void;
  cleanup: () => void;
  clearLastBetCreated: () => void;
  clearLastBetUpdated: () => void;
  clearLastBetDeleted: () => void;
  clearLastBetResolved: () => void;
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
    lastChatUnreadCount: null,
    lastSyncRequired: null,
    lastBetCreated: null,
    lastBetUpdated: null,
    lastBetDeleted: null,
    lastBetResolved: null,
    lastGameResultsUpdated: null,
    lastPollVote: null,
    lastNewBug: null,
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
        set({ lastChatMessage: data });
      };

      const handleChatReaction = (data: ChatReactionData) => {
        set({ lastChatReaction: data });
      };

      const handleChatReadReceipt = (data: ChatReadReceiptData) => {
        set({ lastChatReadReceipt: data });
      };

      const handleChatDeleted = (data: ChatDeletedData) => {
        set({ lastChatDeleted: data });
      };

      const handleChatUnreadCount = (data: ChatUnreadCountData) => {
        set({ lastChatUnreadCount: data });
      };

      const handleSyncRequired = (data: { timestamp: string }) => {
        set({ lastSyncRequired: data });
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

      const handlePollVote = (data: PollVoteData) => {
        set({ lastPollVote: data });
      };

      const handleNewBug = (data: NewBugData) => {
        set({ lastNewBug: data });
      };

      socketService.on('new-invite', handleNewInvite);
      socketService.on('invite-deleted', handleInviteDeleted);
      socketService.on('game-updated', handleGameUpdated);
      socketService.on('chat:message', handleChatMessage);
      socketService.on('chat:reaction', handleChatReaction);
      socketService.on('chat:read-receipt', handleChatReadReceipt);
      socketService.on('chat:deleted', handleChatDeleted);
      socketService.on('chat:unread-count', handleChatUnreadCount);
      socketService.on('sync-required', handleSyncRequired);
      socketService.on('bet:created', handleBetCreated);
      socketService.on('bet:updated', handleBetUpdated);
      socketService.on('bet:deleted', handleBetDeleted);
      socketService.on('bet:resolved', handleBetResolved);
      socketService.on('game-results-updated', handleGameResultsUpdated);
      socketService.on('poll-vote', handlePollVote);
      socketService.on('new-bug', handleNewBug);

      unsubscribeHandlers = [
        () => socketService.off('new-invite', handleNewInvite),
        () => socketService.off('invite-deleted', handleInviteDeleted),
        () => socketService.off('game-updated', handleGameUpdated),
        () => socketService.off('chat:message', handleChatMessage),
        () => socketService.off('chat:reaction', handleChatReaction),
        () => socketService.off('chat:read-receipt', handleChatReadReceipt),
        () => socketService.off('chat:deleted', handleChatDeleted),
        () => socketService.off('chat:unread-count', handleChatUnreadCount),
        () => socketService.off('sync-required', handleSyncRequired),
        () => socketService.off('bet:created', handleBetCreated),
        () => socketService.off('bet:updated', handleBetUpdated),
        () => socketService.off('bet:deleted', handleBetDeleted),
        () => socketService.off('bet:resolved', handleBetResolved),
        () => socketService.off('game-results-updated', handleGameResultsUpdated),
        () => socketService.off('poll-vote', handlePollVote),
        () => socketService.off('new-bug', handleNewBug),
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
        lastChatUnreadCount: null,
        lastSyncRequired: null,
        lastBetCreated: null,
        lastBetUpdated: null,
        lastBetDeleted: null,
        lastBetResolved: null,
        lastGameResultsUpdated: null,
        lastPollVote: null,
        lastNewBug: null,
      });
    },
    clearLastBetCreated: () => set({ lastBetCreated: null }),
    clearLastBetUpdated: () => set({ lastBetUpdated: null }),
    clearLastBetDeleted: () => set({ lastBetDeleted: null }),
    clearLastBetResolved: () => set({ lastBetResolved: null }),
  };
});
