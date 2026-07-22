/** True when Express `req.ip` is loopback (after trust proxy). */
export function isLoopbackIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const t = ip.trim().toLowerCase();
  return (
    t === '127.0.0.1' ||
    t === '::1' ||
    t === '::ffff:127.0.0.1' ||
    t.startsWith('127.')
  );
}
