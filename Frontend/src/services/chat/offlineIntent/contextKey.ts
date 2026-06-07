import type { ChatContextType } from '@/api/chat';

export function offlineIntentContextKey(contextType: ChatContextType, contextId: string): string {
  return `${contextType}:${contextId}`;
}
