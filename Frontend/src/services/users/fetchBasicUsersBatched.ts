import { usersApi } from '@/api/users';
import { usePlayersStore } from '@/store/playersStore';
import { MAX_BASIC_USERS_BY_IDS } from '@/services/users/basicUsersBatchLimits';

const DEBOUNCE_MS = 25;

const pendingIdsByMessage = new Map<string, Set<string>>();
const waiterListsByMessage = new Map<string, Array<{ resolve: () => void; reject: (e: unknown) => void }>>();
const timersByMessage = new Map<string, ReturnType<typeof setTimeout>>();
const flushChainsByMessage = new Map<string, Promise<void>>();

function enqueueFlush(messageId: string, run: () => Promise<void>): void {
  const prev = flushChainsByMessage.get(messageId) ?? Promise.resolve();
  const next = prev.then(run, run);
  flushChainsByMessage.set(messageId, next);
  void next.finally(() => {
    if (flushChainsByMessage.get(messageId) === next) {
      flushChainsByMessage.delete(messageId);
    }
  });
}

async function executeFlush(messageId: string) {
  timersByMessage.delete(messageId);
  const idSet = pendingIdsByMessage.get(messageId);
  pendingIdsByMessage.delete(messageId);
  const waiters = waiterListsByMessage.get(messageId) ?? [];
  waiterListsByMessage.delete(messageId);

  if (!idSet || idSet.size === 0) {
    waiters.forEach((w) => w.resolve());
    return;
  }

  const getMissing = () =>
    [...idSet].filter((id) => !usePlayersStore.getState().getUser(id));

  const missing = getMissing();
  if (missing.length === 0) {
    waiters.forEach((w) => w.resolve());
    return;
  }

  try {
    let remaining = missing;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, MAX_BASIC_USERS_BY_IDS);
      const users = await usersApi.getBasicUsersByIds(chunk, messageId);
      if (users.length > 0) usePlayersStore.getState().setUsers(users);
      remaining = remaining.slice(MAX_BASIC_USERS_BY_IDS);
    }
    waiters.forEach((w) => w.resolve());
  } catch (e) {
    waiters.forEach((w) => w.reject(e));
  }
}

function scheduleDebouncedFlush(messageId: string) {
  const existing = timersByMessage.get(messageId);
  if (existing) clearTimeout(existing);
  timersByMessage.set(
    messageId,
    setTimeout(() => {
      enqueueFlush(messageId, () => executeFlush(messageId));
    }, DEBOUNCE_MS)
  );
}

export function fetchBasicUsersBatched(messageId: string, ids: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let set = pendingIdsByMessage.get(messageId);
    if (!set) {
      set = new Set();
      pendingIdsByMessage.set(messageId, set);
    }
    for (const id of ids) {
      if (id) set.add(id);
    }

    let waiters = waiterListsByMessage.get(messageId);
    if (!waiters) {
      waiters = [];
      waiterListsByMessage.set(messageId, waiters);
    }
    waiters.push({ resolve, reject });

    scheduleDebouncedFlush(messageId);
  });
}
