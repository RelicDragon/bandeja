export function chatSyncMessageUpdatedCompactPayload(u: {
  id: string;
  content: string | null;
  mentionIds: string[];
  editedAt: Date | null;
  updatedAt: Date;
  linkPreviewDisabled?: boolean;
  linkPreviewUrl?: string | null;
  linkPreview?: unknown;
}): { messageId: string; patch: Record<string, unknown> } {
  return {
    messageId: u.id,
    patch: {
      content: u.content ?? '',
      mentionIds: u.mentionIds,
      editedAt: u.editedAt ? u.editedAt.toISOString() : null,
      updatedAt: u.updatedAt.toISOString(),
      ...(u.linkPreviewDisabled === undefined
        ? {}
        : { linkPreviewDisabled: u.linkPreviewDisabled }),
      ...(u.linkPreviewUrl === undefined ? {} : { linkPreviewUrl: u.linkPreviewUrl }),
      ...(u.linkPreview === undefined ? {} : { linkPreview: u.linkPreview }),
    },
  };
}
