import type { ContextKey, SnapshotContextType } from './types';

export function contextKey(contextType: SnapshotContextType, contextId: string): ContextKey {
  return `${contextType}:${contextId}`;
}

export function parseContextKey(
  key: ContextKey
): { contextType: SnapshotContextType; contextId: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const contextType = key.slice(0, i) as SnapshotContextType;
  if (contextType !== 'GAME' && contextType !== 'USER' && contextType !== 'GROUP') return null;
  return { contextType, contextId: key.slice(i + 1) };
}
