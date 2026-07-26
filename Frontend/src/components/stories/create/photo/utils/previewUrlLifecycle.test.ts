import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  collectLivePreviewUrls,
  collectPreviewUrls,
  revokeUrlsNotIn,
} from './previewUrlLifecycle';
import type { StoryDocument } from '../types';
import { DEFAULT_MEDIA_ADJUST, DEFAULT_TRANSFORM, STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types';

function docWithUrl(url: string): StoryDocument {
  return {
    version: 3,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    backgroundId: 'm1',
    nodes: [
      {
        id: 'm1',
        type: 'media',
        mediaType: 'IMAGE',
        source: { file: new File([], 'a.jpg'), previewUrl: url },
        transform: { ...DEFAULT_TRANSFORM },
        adjust: { ...DEFAULT_MEDIA_ADJUST },
      },
    ],
  };
}

describe('previewUrlLifecycle', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collects preview urls from segments', () => {
    expect(collectPreviewUrls([docWithUrl('blob:a'), docWithUrl('blob:b')])).toEqual([
      'blob:a',
      'blob:b',
    ]);
  });

  it('does not revoke urls still live in history', () => {
    const live = collectLivePreviewUrls([docWithUrl('blob:current')], [
      { segments: [docWithUrl('blob:undo')] },
    ]);
    revokeUrlsNotIn(['blob:undo', 'blob:orphan'], live);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:orphan');
  });
});
