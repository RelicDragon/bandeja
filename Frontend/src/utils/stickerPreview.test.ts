import { describe, expect, it } from 'vitest';
import { formatStickerPreviewText } from './stickerPreview';

describe('formatStickerPreviewText', () => {
  it('returns label when emoji missing', () => {
    expect(formatStickerPreviewText(null)).toBe('Sticker');
    expect(formatStickerPreviewText('  ')).toBe('Sticker');
  });

  it('prefixes emoji when present', () => {
    expect(formatStickerPreviewText('🎾')).toBe('🎾 Sticker');
    expect(formatStickerPreviewText(' 🔥 ', 'Samolepka')).toBe('🔥 Samolepka');
  });
});
