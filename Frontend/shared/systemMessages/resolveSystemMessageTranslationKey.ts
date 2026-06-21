export function resolveSystemMessageTranslationKey(
  messageType: string,
  entityType?: string | null,
): string {
  if (entityType && entityType !== 'GAME') {
    return `chat.systemMessages.${entityType}.${messageType}`;
  }
  return `chat.systemMessages.${messageType}`;
}
