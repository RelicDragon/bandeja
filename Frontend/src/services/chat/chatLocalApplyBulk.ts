let suppressLocalChatIndexingDepth = 0;

export async function withChatLocalBulkApply<T>(fn: () => Promise<T>): Promise<T> {
  suppressLocalChatIndexingDepth += 1;
  try {
    return await fn();
  } finally {
    suppressLocalChatIndexingDepth -= 1;
  }
}

export function isChatLocalIndexingSuppressed(): boolean {
  return suppressLocalChatIndexingDepth > 0;
}
