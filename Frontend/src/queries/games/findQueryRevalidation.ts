import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { waitForAvailableGamesDayIndexContinuation } from './availableGamesDayIndexContinuation';

const FIND_REVALIDATION_DEBOUNCE_MS = 200;

type RevalidationState = {
  cancelled: boolean;
  dirty: boolean;
  flushing: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const statesByClient = new WeakMap<QueryClient, Map<string, RevalidationState>>();

function keyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function statesFor(queryClient: QueryClient): Map<string, RevalidationState> {
  let states = statesByClient.get(queryClient);
  if (!states) {
    states = new Map();
    statesByClient.set(queryClient, states);
  }
  return states;
}

function waitForQueryFetch(queryClient: QueryClient, queryKey: QueryKey): Promise<void> | null {
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (!query || query.state.fetchStatus !== 'fetching') return null;
  return new Promise((resolve) => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const current = queryClient.getQueryCache().find({ queryKey, exact: true });
      if (current?.state.fetchStatus === 'fetching') return;
      unsubscribe();
      resolve();
    });
  });
}

async function waitForInFlightWork(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  while (true) {
    const continuation = waitForAvailableGamesDayIndexContinuation(queryClient, queryKey);
    if (continuation) {
      await continuation;
      continue;
    }
    const queryFetch = waitForQueryFetch(queryClient, queryKey);
    if (queryFetch) {
      await queryFetch;
      continue;
    }
    return;
  }
}

async function flush(
  queryClient: QueryClient,
  queryKey: QueryKey,
  state: RevalidationState,
): Promise<void> {
  const id = keyId(queryKey);
  if (state.flushing) return;
  state.flushing = true;
  state.timer = null;
  try {
    await waitForInFlightWork(queryClient, queryKey);
    if (state.cancelled) return;
    // All events received before this point are covered by the refresh below.
    state.dirty = false;
    await queryClient.invalidateQueries(
      { queryKey, exact: true },
      { cancelRefetch: false },
    );
  } finally {
    state.flushing = false;
    const states = statesFor(queryClient);
    if (state.cancelled) {
      if (states.get(id) === state) states.delete(id);
    } else if (state.dirty) {
      state.timer = setTimeout(
        () => void flush(queryClient, queryKey, state),
        FIND_REVALIDATION_DEBOUNCE_MS,
      );
    } else {
      if (states.get(id) === state) states.delete(id);
    }
  }
}

/** Coalesce socket bursts and never compete with a page-1 or index continuation walk. */
export function scheduleFindQueryRevalidation(
  queryClient: QueryClient,
  queryKey: QueryKey,
): void {
  const states = statesFor(queryClient);
  const id = keyId(queryKey);
  const state = states.get(id) ?? {
    cancelled: false,
    dirty: false,
    flushing: false,
    timer: null,
  };
  state.dirty = true;
  states.set(id, state);
  if (state.flushing || state.timer) return;
  state.timer = setTimeout(
    () => void flush(queryClient, queryKey, state),
    FIND_REVALIDATION_DEBOUNCE_MS,
  );
}

export function cancelFindQueryRevalidations(queryClient: QueryClient): void {
  const states = statesByClient.get(queryClient);
  if (!states) return;
  for (const state of states.values()) {
    state.cancelled = true;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }
  states.clear();
}
