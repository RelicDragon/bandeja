import { create } from 'zustand';
import type { AgentClientPriceQuote, AgentClientProgress } from './agentClientExecutor';

/**
 * This device's view of a client-executed action while (and right after) it runs; the server
 * action (`status` / `result`) takes over once reported. Kept outside the card so scrolling
 * the card out of view or leaving the chat doesn't lose the progress.
 */
export type AgentClientLocalState =
  | { stage: 'progress'; progress: AgentClientProgress }
  /** The adapter quoted a price before writing: one more tap to go on. */
  | { stage: 'price'; quote: AgentClientPriceQuote }
  /** Reported; `notConnected` adds the Connected clubs hand-off. */
  | { stage: 'finished'; notConnected: boolean; leaseExpired: boolean }
  /** 409 ACTION_HANDLED: claimed / settled on another device. */
  | { stage: 'handled' }
  /** An earlier run died mid-call; the outcome is unknown until the lease sweep. */
  | { stage: 'interrupted' }
  /** Done at the club, the report didn't get through; retried on resume. */
  | { stage: 'report_pending' }
  | { stage: 'error'; message: string };

interface AgentClientExecStoreState {
  byAction: Record<string, AgentClientLocalState>;
  set: (actionId: string, state: AgentClientLocalState | null) => void;
}

export const useAgentClientExecStore = create<AgentClientExecStoreState>((set) => ({
  byAction: {},
  set: (actionId, state) =>
    set((s) => {
      const byAction = { ...s.byAction };
      if (state) byAction[actionId] = state;
      else delete byAction[actionId];
      return { byAction };
    }),
}));

export function useAgentClientLocalState(actionId: string | null): AgentClientLocalState | null {
  return useAgentClientExecStore((s) => (actionId ? (s.byAction[actionId] ?? null) : null));
}

const priceAnswers = new Map<string, (ok: boolean) => void>();

/** Executor side: wait for the card's answer to a price quote. */
export function awaitAgentClientPriceAnswer(actionId: string, quote: AgentClientPriceQuote): Promise<boolean> {
  useAgentClientExecStore.getState().set(actionId, { stage: 'price', quote });
  return new Promise((resolve) => {
    priceAnswers.set(actionId, resolve);
  });
}

/** Card side: "Book for …" (true) or "Stop" (false). */
export function answerAgentClientPrice(actionId: string, ok: boolean): void {
  const resolve = priceAnswers.get(actionId);
  priceAnswers.delete(actionId);
  resolve?.(ok);
}
