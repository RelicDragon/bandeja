import { create } from 'zustand';

export type ChatConnectionState = 'OFFLINE' | 'SYNCING' | 'ONLINE';

type State = {
  chatConnectionState: ChatConnectionState;
  setChatConnectionState: (v: ChatConnectionState) => void;
};

const initialOnline = typeof navigator !== 'undefined' && navigator.onLine;

export const useChatOfflineStore = create<State>((set) => ({
  chatConnectionState: initialOnline ? 'ONLINE' : 'OFFLINE',
  setChatConnectionState: (chatConnectionState) => set({ chatConnectionState }),
}));
