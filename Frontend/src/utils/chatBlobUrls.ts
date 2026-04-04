export function revokeChatBlobUrls(m: { mediaUrls?: string[]; thumbnailUrls?: string[] } | null | undefined): void {
  if (!m) return;
  const seen = new Set<string>();
  for (const u of [...(m.mediaUrls ?? []), ...(m.thumbnailUrls ?? [])]) {
    if (!u || !u.startsWith('blob:') || seen.has(u)) continue;
    seen.add(u);
    URL.revokeObjectURL(u);
  }
}
