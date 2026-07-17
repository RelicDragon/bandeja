const DEFAULT_CLOUDFRONT_HOST = 'd1afylun4w6qxe.cloudfront.net';

function mediaHosts(): Set<string> {
  const hosts = new Set([DEFAULT_CLOUDFRONT_HOST]);
  const configured = import.meta.env.VITE_AWS_CLOUDFRONT_DOMAIN as string | undefined;
  if (!configured?.trim()) return hosts;
  try {
    const url = configured.startsWith('http') ? configured : `https://${configured}`;
    hosts.add(new URL(url).hostname.toLowerCase());
  } catch {
    hosts.add(configured.replace(/^https?:\/\//, '').split('/')[0]!.toLowerCase());
  }
  return hosts;
}

export function isDirectLinkPreviewMediaUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return (
      url.protocol === 'https:' &&
      mediaHosts().has(url.hostname.toLowerCase()) &&
      /^\/uploads\/(?:avatars\/|chat\/(?:originals|thumbnails)\/)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
