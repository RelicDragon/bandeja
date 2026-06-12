const DEFAULT_CLOUDFRONT_HOST = 'd1afylun4w6qxe.cloudfront.net';

const MEDIA_PATH_RE =
  /^\/uploads\/(stories\/(originals|videos|thumbnails)|games\/(originals|thumbnails)|avatars)\/[a-zA-Z0-9._-]+$/;

function allowedHosts(): Set<string> {
  const hosts = new Set([DEFAULT_CLOUDFRONT_HOST]);
  const raw = import.meta.env.VITE_AWS_CLOUDFRONT_DOMAIN as string | undefined;
  if (raw?.trim()) {
    try {
      const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
      hosts.add(new URL(normalized).hostname.toLowerCase());
    } catch {
      hosts.add(raw.replace(/^https?:\/\//, '').split('/')[0]!.toLowerCase());
    }
  }
  return hosts;
}

export function isSafeStoryReplyMediaUrl(url: string | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    if (!allowedHosts().has(parsed.hostname.toLowerCase())) return false;
    return MEDIA_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}
