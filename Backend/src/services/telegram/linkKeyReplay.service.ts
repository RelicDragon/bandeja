const REPLAY_TTL_MS = 60_000;

export type LinkKeyReplayPayload = {
  user: unknown;
  token: string;
  refreshToken?: string;
  currentSessionId?: string;
};

type ReplayEntry = {
  expiresAt: number;
  payload: LinkKeyReplayPayload;
};

const replayByKey = new Map<string, ReplayEntry>();

function prune() {
  const now = Date.now();
  for (const [k, v] of replayByKey) {
    if (v.expiresAt <= now) replayByKey.delete(k);
  }
}

export function getLinkKeyReplay(key: string): LinkKeyReplayPayload | null {
  prune();
  const entry = replayByKey.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    replayByKey.delete(key);
    return null;
  }
  return entry.payload;
}

export function storeLinkKeyReplay(key: string, payload: LinkKeyReplayPayload): void {
  prune();
  replayByKey.set(key, { expiresAt: Date.now() + REPLAY_TTL_MS, payload });
}
