const AVATAR_END_RE = /_avatar\.jpe?g$/i;
const TINY_AVATAR_SUFFIX = '_avatar.tiny.jpg';

function normalizedUploadsPath(url: string | null | undefined): string {
  if (!url) return '';
  const t = url.trim();
  if (!t) return '';
  try {
    if (
      t.startsWith('http://') ||
      t.startsWith('https://') ||
      t.startsWith('//')
    ) {
      return new URL(t.startsWith('//') ? `https:${t}` : t).pathname;
    }
  } catch {
    return '';
  }
  const noQuery = t.split('?')[0].split('#')[0];
  return noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
}

/** Bandeja-uploaded circular avatar (user or game); safe to delete via our S3 bucket */
export function isOurCircularAvatarUrl(url: string | null | undefined): boolean {
  const p = normalizedUploadsPath(url);
  return p.includes('/uploads/avatars/circular/') && AVATAR_END_RE.test(p);
}

const ANIMATED_AVATAR_END_RE = /_avatar\.anim\.webp$/i;
const ANIMATED_TINY_AVATAR_SUFFIX = '_avatar.anim.tiny.webp';

/** Premium animated avatar (`User.avatarAnimated`); safe to delete via our S3 bucket */
export function isOurAnimatedAvatarUrl(url: string | null | undefined): boolean {
  const p = normalizedUploadsPath(url);
  return p.includes('/uploads/avatars/animated/') && ANIMATED_AVATAR_END_RE.test(p);
}

/** 96px animated variant stored beside `avatarAnimated` (`…_avatar.anim.webp` → `…_avatar.anim.tiny.webp`). */
export function animatedAvatarTinyUrlFromStandard(url: string | null | undefined): string | null {
  return swapSuffix(url, ANIMATED_AVATAR_END_RE, ANIMATED_TINY_AVATAR_SUFFIX);
}

export function isOurAvatarOriginalUrl(url: string | null | undefined): boolean {
  const p = normalizedUploadsPath(url);
  return p.includes('/uploads/avatars/originals/');
}

function swapSuffix(url: string | null | undefined, endRe: RegExp, suffix: string): string | null {
  if (!url) return null;
  const t = url.trim();
  const q = t.indexOf('?');
  const h = t.indexOf('#');
  let end = t.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  const base = t.slice(0, end);
  if (!endRe.test(base)) return null;
  const tinyBase = base.replace(endRe, suffix);
  if (tinyBase === base) return null;
  return tinyBase + t.slice(end);
}

export function userAvatarTinyUrlFromStandard(
  avatar: string | null | undefined
): string | null {
  return swapSuffix(avatar, AVATAR_END_RE, TINY_AVATAR_SUFFIX);
}
