import { describe, expect, it } from 'vitest';
import { isDirectLinkPreviewMediaUrl } from './linkPreviewMediaUrl';

describe('isDirectLinkPreviewMediaUrl', () => {
  it('allows first-party avatar variants', () => {
    expect(
      isDirectLinkPreviewMediaUrl(
        'https://d1afylun4w6qxe.cloudfront.net/uploads/avatars/circular/player.jpg'
      )
    ).toBe(true);
  });

  it('allows first-party marketplace media', () => {
    expect(
      isDirectLinkPreviewMediaUrl(
        'https://d1afylun4w6qxe.cloudfront.net/uploads/chat/originals/item.jpg'
      )
    ).toBe(true);
    expect(
      isDirectLinkPreviewMediaUrl(
        'https://d1afylun4w6qxe.cloudfront.net/uploads/chat/thumbnails/item_thumb.jpg'
      )
    ).toBe(true);
  });

  it('keeps external preview images behind the media proxy', () => {
    expect(isDirectLinkPreviewMediaUrl('https://example.com/avatar.jpg')).toBe(false);
  });
});
