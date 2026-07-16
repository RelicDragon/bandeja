import { describe, expect, it } from 'vitest';
import { preservesAlphaChannel } from './chatOutboxImageCompress';

describe('preservesAlphaChannel', () => {
  it('keeps gif/png/webp by mime', () => {
    expect(preservesAlphaChannel(new Blob([], { type: 'image/png' }))).toBe(true);
    expect(preservesAlphaChannel(new Blob([], { type: 'image/webp' }))).toBe(true);
    expect(preservesAlphaChannel(new Blob([], { type: 'image/gif' }))).toBe(true);
  });

  it('keeps by extension when mime empty', () => {
    expect(preservesAlphaChannel(new Blob([]), 'sticker.PNG')).toBe(true);
    expect(preservesAlphaChannel(new Blob([]), 'x.webp')).toBe(true);
  });

  it('does not preserve jpeg', () => {
    expect(preservesAlphaChannel(new Blob([], { type: 'image/jpeg' }))).toBe(false);
    expect(preservesAlphaChannel(new Blob([]), 'photo.jpg')).toBe(false);
  });
});
