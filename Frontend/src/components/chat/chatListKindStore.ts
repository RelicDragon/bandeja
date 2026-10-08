import { create } from 'zustand';
import type { ChatListKind } from './chatListSections';

/**
 * The All / Games / Groups chip. Kept outside the list so it survives the list
 * unmounting while a thread is open on mobile.
 */
export const useChatListKindStore = create<{
  kind: ChatListKind;
  setKind: (kind: ChatListKind) => void;
  /** "Show N more" under the first invitation. */
  invitesExpanded: boolean;
  toggleInvitesExpanded: () => void;
}>((set) => ({
  kind: 'all',
  setKind: (kind) => set({ kind }),
  invitesExpanded: false,
  toggleInvitesExpanded: () => set((s) => ({ invitesExpanded: !s.invitesExpanded })),
}));
