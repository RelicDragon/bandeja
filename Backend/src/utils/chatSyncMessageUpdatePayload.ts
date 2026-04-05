export function chatSyncMessageUpdatedCompactPayload(u: {
  id: string;
  content: string | null;
  mentionIds: string[];
  editedAt: Date | null;
  updatedAt: Date;
}): { messageId: string; patch: Record<string, unknown> } {
  return {
    messageId: u.id,
    patch: {
      content: u.content ?? '',
      mentionIds: u.mentionIds,
      editedAt: u.editedAt ? u.editedAt.toISOString() : null,
      updatedAt: u.updatedAt.toISOString(),
    },
  };
}
