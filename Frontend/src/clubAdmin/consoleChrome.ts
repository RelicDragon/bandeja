/**
 * Console chrome: pages declare their header (title, back target, full-height mode) with
 * primitives only, and render header actions through a portal slot (`HeaderActions`), so a page
 * re-render never feeds back into layout state.
 */
import { createContext, useContext, useEffect } from 'react';

export interface ConsoleHeaderState {
  title: string;
  /** Fallback when there is no in-app history to pop. Set = page shows a back button. */
  backTo: string | null;
  /** Page owns its own scrolling (schedule grid): content area does not scroll. */
  fill: boolean;
}

export const EMPTY_HEADER: ConsoleHeaderState = { title: '', backTo: null, fill: false };

export interface ConsoleChromeValue {
  setHeader: (h: ConsoleHeaderState) => void;
  actionsSlot: HTMLElement | null;
}

export const ConsoleChromeContext = createContext<ConsoleChromeValue | null>(null);

export function useConsoleChrome(): ConsoleChromeValue | null {
  return useContext(ConsoleChromeContext);
}

export function useConsoleHeader({ title, backTo = null, fill = false }: Partial<ConsoleHeaderState>): void {
  const setHeader = useConsoleChrome()?.setHeader;
  useEffect(() => {
    setHeader?.({ title: title ?? '', backTo, fill });
  }, [setHeader, title, backTo, fill]);
}

/** Legacy pages (courts, settings) still declare `{ title, backTo }`. */
export function useClubAdminScreen({ title, backTo }: { title: string; backTo: string }): void {
  useConsoleHeader({ title, backTo });
}
