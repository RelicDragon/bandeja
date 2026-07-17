/**
 * First chat-preview-eligible URL in message text (skips giphy).
 */
export function extractFirstEligiblePreviewUrl(content: string | null | undefined): string | null {
  return extractEligiblePreviewUrls(content)[0] ?? null;
}

export function extractEligiblePreviewUrls(content: string | null | undefined): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(content)) !== null) {
    const raw = match[0].replace(/[.,);\]}>]+$/g, '');
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      if (u.username || u.password) continue;
      if (/(^|\.)giphy\.com$/i.test(u.hostname)) continue;
      const normalized = u.toString();
      if (!urls.includes(normalized)) urls.push(normalized);
    } catch {
      continue;
    }
  }
  return urls;
}

export function normalizeEligiblePreviewSelection(
  requestedUrl: string | null | undefined,
  eligibleUrls: readonly string[]
): string | null {
  if (!requestedUrl) return null;
  try {
    const normalized = new URL(requestedUrl).toString();
    return eligibleUrls.includes(normalized) ? normalized : null;
  } catch {
    return null;
  }
}
