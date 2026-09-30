import { create } from 'zustand';
import {
  agentRunReducer,
  createRunState,
  isTerminalPhase,
  type AgentRunAction,
  type AgentRunLiveState,
} from './agentRunReducer';

/**
 * Keep recent runs in memory after their chat view unmounts, so coming back to a chat
 * resumes from the last event id instead of replaying the whole run.
 */
const MAX_RUNS = 20;

interface AgentRunStoreState {
  runs: Record<string, AgentRunLiveState>;
  /**
   * State to attach with. Reuses the stored run unless it only failed client-side (401/404 on
   * a previous attach): that one is replaced by a fresh state, which replays from the start.
   */
  ensureRun: (runId: string, chatId: string | null) => AgentRunLiveState;
  dispatch: (runId: string, action: AgentRunAction) => void;
}

/** Oldest finished run first, then the oldest overall. Insertion order = age. */
function pickEvictable(runs: Record<string, AgentRunLiveState>): string | undefined {
  const ids = Object.keys(runs);
  return ids.find((id) => isTerminalPhase(runs[id].phase)) ?? ids[0];
}

export const useAgentRunStore = create<AgentRunStoreState>((set, get) => ({
  runs: {},
  ensureRun: (runId, chatId) => {
    const existing = get().runs[runId];
    if (existing && !existing.connectionFailed) return existing;
    const created = createRunState(runId, chatId ?? existing?.chatId ?? null);
    set((s) => {
      const runs = { ...s.runs };
      delete runs[runId];
      if (Object.keys(runs).length >= MAX_RUNS) {
        const evict = pickEvictable(runs);
        if (evict) delete runs[evict];
      }
      runs[runId] = created;
      return { runs };
    });
    return created;
  },
  dispatch: (runId, action) => {
    set((s) => {
      const current = s.runs[runId];
      if (!current) return s;
      const next = agentRunReducer(current, action);
      return next === current ? s : { runs: { ...s.runs, [runId]: next } };
    });
  },
}));

export function useAgentRun(runId: string | null): AgentRunLiveState | null {
  return useAgentRunStore((s) => (runId ? (s.runs[runId] ?? null) : null));
}

/** Test/reset helper: forget every run (e.g. simulating a page reload). */
export function resetAgentRunStore(): void {
  useAgentRunStore.setState({ runs: {} });
}
