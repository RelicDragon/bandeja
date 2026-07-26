import { describe, expect, it } from 'vitest';
import { DEFAULT_MEDIA_ADJUST, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, type StoryDocument } from '../types';
import { storyDocumentContentHash } from './storyDocumentContentHash';

function baseDoc(): StoryDocument {
  return {
    version: 3,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    backgroundId: 'm1',
    nodes: [
      {
        id: 'm1',
        type: 'media',
        mediaType: 'IMAGE',
        source: {
          file: new File([], 'a.jpg'),
          previewUrl: 'blob:a',
          naturalWidth: 1080,
          naturalHeight: 1920,
        },
        transform: { x: 0, y: 0, scale: 1.2, rotation: 0 },
        adjust: { ...DEFAULT_MEDIA_ADJUST },
      },
    ],
  };
}

describe('storyDocumentContentHash', () => {
  it('changes when overlay text changes', () => {
    const a = baseDoc();
    const b: StoryDocument = {
      ...a,
      nodes: [
        ...a.nodes,
        {
          id: 't1',
          type: 'text',
          text: 'hi',
          transform: { x: 100, y: 200, scale: 1, rotation: 0 },
          style: { id: 'classic', align: 'center' },
        },
      ],
    };
    expect(storyDocumentContentHash(a)).not.toBe(storyDocumentContentHash(b));
  });

  it('changes when caption changes', () => {
    const doc = baseDoc();
    expect(storyDocumentContentHash(doc, 'a')).not.toBe(storyDocumentContentHash(doc, 'b'));
  });

  it('stable for identical content', () => {
    const doc = baseDoc();
    expect(storyDocumentContentHash(doc, 'cap')).toBe(storyDocumentContentHash(doc, 'cap'));
  });
});
