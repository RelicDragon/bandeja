import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { S3Service } from '../s3.service';

const STORY_MEDIA_KEY_RE =
  /^uploads\/stories\/(originals|videos|thumbnails)\/[a-zA-Z0-9._-]+$/;

export type StoryMediaInput = {
  mediaUrl: string;
  thumbnailUrl: string;
  posterUrl?: string | null;
};

export function isStoryS3ValidationEnabled(): boolean {
  if (process.env.STORY_SKIP_S3_MEDIA_CHECK === 'true' || process.env.STORY_SKIP_S3_MEDIA_CHECK === '1') {
    return false;
  }
  return Boolean(config.aws.accessKeyId && config.aws.secretAccessKey);
}

function allowedCloudFrontHost(): string {
  return config.aws.cloudFrontDomain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
}

export function extractStoryMediaKey(url: string): string {
  return S3Service.extractS3Key(url.trim());
}

export function isValidStoryMediaKey(key: string): boolean {
  return STORY_MEDIA_KEY_RE.test(key);
}

export function isAllowedStoryMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  let key: string;
  try {
    key = extractStoryMediaKey(url);
  } catch {
    return false;
  }
  if (!isValidStoryMediaKey(key)) return false;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).hostname.toLowerCase() === allowedCloudFrontHost();
    } catch {
      return false;
    }
  }
  return true;
}

export function isStoryItemMediaInvalid(input: StoryMediaInput): boolean {
  if (!isAllowedStoryMediaUrl(input.mediaUrl) || !isAllowedStoryMediaUrl(input.thumbnailUrl)) {
    return true;
  }
  if (input.posterUrl?.trim() && !isAllowedStoryMediaUrl(input.posterUrl)) {
    return true;
  }
  return false;
}

async function assertMediaObjectExists(url: string, label: string): Promise<void> {
  const key = extractStoryMediaKey(url);
  const exists = await S3Service.objectExists(key);
  if (!exists) {
    throw new ApiError(400, `Story ${label} was not found in storage. Upload media before publishing.`);
  }
}

export async function validateStoryItemMediaInput(input: StoryMediaInput): Promise<void> {
  const mediaUrl = input.mediaUrl?.trim();
  const thumbnailUrl = input.thumbnailUrl?.trim();
  if (!mediaUrl || !thumbnailUrl) {
    throw new ApiError(400, 'mediaUrl and thumbnailUrl are required');
  }

  if (!isAllowedStoryMediaUrl(mediaUrl)) {
    throw new ApiError(400, 'Invalid story mediaUrl');
  }
  if (!isAllowedStoryMediaUrl(thumbnailUrl)) {
    throw new ApiError(400, 'Invalid story thumbnailUrl');
  }
  const poster = input.posterUrl?.trim();
  if (poster && !isAllowedStoryMediaUrl(poster)) {
    throw new ApiError(400, 'Invalid story posterUrl');
  }

  if (!isStoryS3ValidationEnabled()) return;

  await assertMediaObjectExists(mediaUrl, 'media');
  await assertMediaObjectExists(thumbnailUrl, 'thumbnail');
  if (poster) await assertMediaObjectExists(poster, 'poster');
}

export async function isStoryItemMediaMissingInStorage(input: StoryMediaInput): Promise<boolean> {
  if (!isStoryS3ValidationEnabled()) return false;
  if (isStoryItemMediaInvalid(input)) return true;

  const urls = [input.mediaUrl, input.thumbnailUrl, input.posterUrl?.trim()].filter(Boolean) as string[];
  for (const url of urls) {
    const key = extractStoryMediaKey(url);
    if (!(await S3Service.objectExists(key))) return true;
  }
  return false;
}
