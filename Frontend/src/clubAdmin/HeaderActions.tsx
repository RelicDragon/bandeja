import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useConsoleChrome } from './consoleChrome';

/** Contextual header actions for the current page (rendered in the console top bar). */
export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useConsoleChrome()?.actionsSlot;
  if (!slot) return null;
  return createPortal(children, slot);
}
