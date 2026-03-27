/** CDN circular avatars: `*_avatar.jpg|jpeg`; tiny is always `*_avatar.tiny.jpg`. */
const AVATAR_END_RE = /_avatar\.jpe?g$/i;

export function userAvatarTinyUrlFromStandard(
  avatar: string | null | undefined
): string | null {
  if (!avatar) return null;
  const t = avatar.trim();
  const q = t.indexOf('?');
  const h = t.indexOf('#');
  let end = t.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  const base = t.slice(0, end);
  if (!AVATAR_END_RE.test(base)) return null;
  const tinyBase = base.replace(AVATAR_END_RE, '_avatar.tiny.jpg');
  if (tinyBase === base) return null;
  return tinyBase + t.slice(end);
}
