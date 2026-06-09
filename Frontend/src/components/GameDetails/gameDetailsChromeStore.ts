import { create } from 'zustand';
import type { Sport } from '@/sport/sportRegistry';
import type { BugStatus, BugType, ChatType } from '@/types';

export interface GameDetailsSportTagState {
  sport: Sport;
  showSport: boolean;
  playersPerMatch: number;
  showMatchFormat: boolean;
}

export interface BugsFilterState {
  status: BugStatus | null;
  type: BugType | null;
  createdByMe: boolean;
}

interface GameDetailsChromeState {
  gameDetailsSportTag: GameDetailsSportTagState | null;
  gameDetailsCanAccessChat: boolean;
  gameDetailsTableViewOverride: boolean | null;
  gameDetailsCanShowTableView: boolean;
  gameDetailsOccludesSideChat: boolean;
  gameDetailsTableAddRoundCallback: (() => void) | null;
  gameDetailsTableIsEditing: boolean;
  bugsButtonSlidingUp: boolean;
  bugsButtonSlidingDown: boolean;
  openBugModal: boolean;
  bugsFilter: BugsFilterState;
  viewingGroupChannelId: string | null;
  viewingUserChatId: string | null;
  viewingGameChatId: string | null;
  viewingGameChatChatType: ChatType | null;
  setGameDetailsTableAddRound: (callback: (() => void) | null, isEditing: boolean) => void;
  setGameDetailsSportTag: (sportTag: GameDetailsSportTagState | null) => void;
  setGameDetailsCanAccessChat: (canAccessChat: boolean) => void;
  setGameDetailsTableViewOverride: (override: boolean | null) => void;
  setGameDetailsCanShowTableView: (can: boolean) => void;
  setGameDetailsOccludesSideChat: (occludes: boolean) => void;
  setBugsButtonSlidingUp: (sliding: boolean) => void;
  setBugsButtonSlidingDown: (sliding: boolean) => void;
  setOpenBugModal: (open: boolean) => void;
  setBugsFilter: (filter: BugsFilterState | ((prev: BugsFilterState) => BugsFilterState)) => void;
  setViewingGroupChannelId: (id: string | null) => void;
  setViewingUserChatId: (id: string | null) => void;
  setViewingGameChatId: (id: string | null) => void;
  setViewingGameChat: (id: string | null, chatType: ChatType | null) => void;
}

export const useGameDetailsChromeStore = create<GameDetailsChromeState>((set) => ({
  gameDetailsSportTag: null,
  gameDetailsCanAccessChat: false,
  gameDetailsTableViewOverride: null,
  gameDetailsCanShowTableView: false,
  gameDetailsOccludesSideChat: false,
  gameDetailsTableAddRoundCallback: null,
  gameDetailsTableIsEditing: false,
  bugsButtonSlidingUp: false,
  bugsButtonSlidingDown: false,
  openBugModal: false,
  bugsFilter: { status: null, type: null, createdByMe: false },
  viewingGroupChannelId: null,
  viewingUserChatId: null,
  viewingGameChatId: null,
  viewingGameChatChatType: null,
  setGameDetailsTableAddRound: (callback, isEditing) =>
    set({ gameDetailsTableAddRoundCallback: callback, gameDetailsTableIsEditing: isEditing }),
  setGameDetailsSportTag: (sportTag) => set({ gameDetailsSportTag: sportTag }),
  setGameDetailsCanAccessChat: (canAccessChat) => set({ gameDetailsCanAccessChat: canAccessChat }),
  setGameDetailsTableViewOverride: (override) => set({ gameDetailsTableViewOverride: override }),
  setGameDetailsCanShowTableView: (can) => set({ gameDetailsCanShowTableView: can }),
  setGameDetailsOccludesSideChat: (occludes) => set({ gameDetailsOccludesSideChat: occludes }),
  setBugsButtonSlidingUp: (sliding) => set({ bugsButtonSlidingUp: sliding }),
  setBugsButtonSlidingDown: (sliding) => set({ bugsButtonSlidingDown: sliding }),
  setOpenBugModal: (open) => set({ openBugModal: open }),
  setBugsFilter: (filter) =>
    set((state) => ({ bugsFilter: typeof filter === 'function' ? filter(state.bugsFilter) : filter })),
  setViewingGroupChannelId: (id) => set({ viewingGroupChannelId: id }),
  setViewingUserChatId: (id) => set({ viewingUserChatId: id }),
  setViewingGameChatId: (id) =>
    set((s) => ({
      viewingGameChatId: id,
      viewingGameChatChatType: id ? s.viewingGameChatChatType : null,
    })),
  setViewingGameChat: (id, chatType) => set({ viewingGameChatId: id, viewingGameChatChatType: chatType }),
}));
