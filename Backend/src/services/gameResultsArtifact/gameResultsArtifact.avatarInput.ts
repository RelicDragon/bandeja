import sharp from 'sharp';
import { config } from '../../config/env';
import { userAvatarTinyUrlFromStandard } from '../../utils/userAvatarTiny';

export function toPublicAvatarUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const key = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const domain = config.aws.cloudFrontDomain.replace(/^https?:\/\//, '');
  if (!domain) return null;
  return `https://${domain}/${key}`;
}

/** Replicate recommends data URLs for files ≤ 256 KB (decoded). */
export const REPLICATE_AVATAR_MAX_BYTES = 256 * 1024;

export type ParticipantAvatarSources = {
  primary: string;
  fallback: string | null;
};

export function resolveParticipantAvatarSources(user: {
  avatar: string | null;
}): ParticipantAvatarSources | null {
  if (!user.avatar?.trim()) return null;
  const avatar = user.avatar.trim();
  const tiny = userAvatarTinyUrlFromStandard(avatar);
  if (tiny && tiny !== avatar) {
    return { primary: tiny, fallback: avatar };
  }
  return { primary: avatar, fallback: null };
}

export function mimeTypeFromImageBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 6 &&
    (buffer.toString('ascii', 0, 6) === 'GIF87a' ||
      buffer.toString('ascii', 0, 6) === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

export function mimeTypeFromAvatarPath(path: string): string | null {
  const lower = path.split('?')[0].split('#')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

export function resolveAvatarMimeType(buffer: Buffer, path: string): string {
  const sniffed = mimeTypeFromImageBuffer(buffer);
  if (sniffed !== 'image/jpeg') return sniffed;
  return mimeTypeFromAvatarPath(path) ?? sniffed;
}

const REPLICATE_INPUT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function bufferToImageDataUri(buffer: Buffer, mimeType: string): string {
  const mime = REPLICATE_INPUT_MIMES.has(mimeType) ? mimeType : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export async function normalizeAvatarBufferForReplicate(
  buffer: Buffer,
  path: string
): Promise<Buffer> {
  if (buffer.length <= REPLICATE_AVATAR_MAX_BYTES) return buffer;
  let normalized = await sharp(buffer)
    .rotate()
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  if (normalized.length > REPLICATE_AVATAR_MAX_BYTES) {
    normalized = await sharp(normalized)
      .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
  }
  if (normalized.length > REPLICATE_AVATAR_MAX_BYTES) {
    console.warn('[results-artifacts] avatar exceeds Replicate size limit after normalize', {
      path,
      bytes: normalized.length,
    });
  }
  return normalized;
}

export async function downloadAvatarAsDataUri(
  sources: ParticipantAvatarSources,
  download: (url: string) => Promise<Buffer>
): Promise<string | null> {
  const paths = [
    sources.primary,
    ...(sources.fallback && sources.fallback !== sources.primary
      ? [sources.fallback]
      : []),
  ];
  for (const path of paths) {
    const url = toPublicAvatarUrl(path);
    if (!url) continue;
    try {
      let buffer = await download(url);
      buffer = await normalizeAvatarBufferForReplicate(buffer, path);
      if (buffer.length > REPLICATE_AVATAR_MAX_BYTES) continue;
      const mime = resolveAvatarMimeType(buffer, path);
      return bufferToImageDataUri(buffer, mime);
    } catch (err) {
      console.error('[results-artifacts] avatar download failed', { path, err });
    }
  }
  return null;
}
