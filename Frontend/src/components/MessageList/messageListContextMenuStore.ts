import { useSyncExternalStore } from 'react';
import type { ContextMenuState } from '@/components/MessageItem';

const CLOSED_MENU_STATE: ContextMenuState = {
  isOpen: false,
  messageId: null,
  position: { x: 0, y: 0 },
};

let menuState: ContextMenuState = CLOSED_MENU_STATE;
const listeners = new Set<() => void>();
let isScrolling = false;
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeMessageListContextMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMessageListContextMenuSnapshot(): ContextMenuState {
  return menuState;
}

export function resetMessageListContextMenu(): void {
  if (!menuState.isOpen && menuState === CLOSED_MENU_STATE) return;
  menuState = CLOSED_MENU_STATE;
  emit();
}

export function openMessageListContextMenu(messageId: string, position: { x: number; y: number }): void {
  if (isScrolling) return;
  menuState = { isOpen: true, messageId, position };
  emit();
}

export function closeMessageListContextMenu(): void {
  if (!menuState.isOpen) return;
  menuState = { ...menuState, isOpen: false, messageId: null };
  emit();
}

export function handleMessageListContextMenuScrollStart(): void {
  isScrolling = true;
  if (menuState.isOpen) closeMessageListContextMenu();

  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling = false;
  }, 150);
}

export function useRowContextMenuState(messageId: string): ContextMenuState {
  return useSyncExternalStore(
    subscribeMessageListContextMenu,
    () => {
      const snapshot = menuState;
      return snapshot.isOpen && snapshot.messageId === messageId ? snapshot : CLOSED_MENU_STATE;
    },
    () => CLOSED_MENU_STATE
  );
}
