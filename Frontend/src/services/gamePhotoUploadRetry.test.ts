import { describe, expect, it } from 'vitest';
import { filterGamePhotoUploadFiles } from '@/services/gamePhotoUploadRetry';

function file(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(Math.min(sizeBytes, 8))], name, { type });
}

describe('filterGamePhotoUploadFiles', () => {
  it('accepts HEIC by mime type before compression', () => {
    const files = filterGamePhotoUploadFiles([file('photo.heic', 'image/heic', 2_000_000)]);
    expect(files).toHaveLength(1);
  });

  it('accepts HEIC by extension when mime is missing', () => {
    const files = filterGamePhotoUploadFiles([file('photo.heic', '', 2_000_000)]);
    expect(files).toHaveLength(1);
  });

  it('rejects files above picker limit', () => {
    const large = file('photo.heic', 'image/heic', 8);
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    const files = filterGamePhotoUploadFiles([large]);
    expect(files).toHaveLength(0);
  });

  it('rejects non-image files without extension', () => {
    const files = filterGamePhotoUploadFiles([file('notes.txt', 'text/plain', 1000)]);
    expect(files).toHaveLength(0);
  });
});
