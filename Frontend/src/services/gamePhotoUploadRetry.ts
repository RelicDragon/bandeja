import { gamePhotosApi, type GamePhoto } from '@/api/gamePhotos';
import { compressChatImageFile } from '@/services/chat/chatOutboxImageCompress';

const DEFAULT_ATTEMPTS = 3;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PICK_BYTES = 20 * 1024 * 1024;

function isGamePhotoUploadCandidate(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return file.size <= MAX_PICK_BYTES;
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name) && file.size <= MAX_PICK_BYTES;
}

export async function prepareGamePhotoUploadFile(file: File): Promise<File> {
  const prepared = await compressChatImageFile(file);
  if (prepared.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image file too large (max 10MB)');
  }
  return prepared;
}

export function filterGamePhotoUploadFiles(files: File[]): File[] {
  return files.filter(isGamePhotoUploadCandidate);
}

export async function uploadGamePhotoFileWithRetry(
  gameId: string,
  file: File,
  clientUploadId: string,
  maxAttempts = DEFAULT_ATTEMPTS,
  signal?: AbortSignal
): Promise<GamePhoto> {
  const prepared = await prepareGamePhotoUploadFile(file);
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await gamePhotosApi.upload(gameId, prepared, { clientUploadId, signal });
    } catch (error) {
      last = error;
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }
  }
  throw last instanceof Error ? last : new Error('Upload failed');
}
