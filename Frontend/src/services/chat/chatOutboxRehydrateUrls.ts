const blobUrlsByTempId = new Map<string, string[]>();

export function revokeOutboxRehydrateBlobUrls(tempId: string): void {
  const urls = blobUrlsByTempId.get(tempId);
  if (!urls?.length) return;
  for (const u of urls) {
    if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  }
  blobUrlsByTempId.delete(tempId);
}

export function registerOutboxRehydrateBlobUrls(tempId: string, urls: string[]): void {
  revokeOutboxRehydrateBlobUrls(tempId);
  const blobOnly = [...new Set(urls.filter((u) => u.startsWith('blob:')))];
  if (blobOnly.length) blobUrlsByTempId.set(tempId, blobOnly);
}
