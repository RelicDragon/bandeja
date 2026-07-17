import crypto from 'node:crypto';
import { config } from '../../config/env';
import type { LinkPreviewResult } from './linkPreview.types';

const TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.LINK_PREVIEW_SNAPSHOT_SECRET || config.jwtSecret || 'link-preview-dev';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueLinkPreviewSnapshotToken(preview: LinkPreviewResult): string {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + TOKEN_TTL_MS, preview })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyLinkPreviewSnapshotToken(token: string): LinkPreviewResult | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      expiresAt?: number;
      preview?: LinkPreviewResult;
    };
    if (!parsed.preview || !parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    return parsed.preview;
  } catch {
    return null;
  }
}
