import { describe, expect, it } from 'vitest';
import { parseStoryReplyInfo } from './parseStoryReplyInfo';

const CF = 'https://d1afylun4w6qxe.cloudfront.net';

describe('parseStoryReplyInfo', () => {
  it('parses valid story reply payloads', () => {
    expect(
      parseStoryReplyInfo({
        sourceType: 'USER_STORY_ITEM',
        sourceId: 'item-1',
        ownerUserId: 'owner-1',
        thumbnailUrl: `${CF}/uploads/stories/thumbnails/thumb.jpg`,
        mediaUrl: `${CF}/uploads/stories/videos/full.mp4`,
        mediaType: 'VIDEO',
      })
    ).toEqual({
      sourceType: 'USER_STORY_ITEM',
      sourceId: 'item-1',
      ownerUserId: 'owner-1',
      thumbnailUrl: `${CF}/uploads/stories/thumbnails/thumb.jpg`,
      mediaUrl: `${CF}/uploads/stories/videos/full.mp4`,
      mediaType: 'VIDEO',
    });
  });

  it('drops unsafe media urls', () => {
    expect(
      parseStoryReplyInfo({
        sourceType: 'USER_STORY_ITEM',
        sourceId: 'item-1',
        ownerUserId: 'owner-1',
        thumbnailUrl: 'https://evil.example/thumb.jpg',
        mediaUrl: 'https://evil.example/full.mp4',
        mediaType: 'VIDEO',
      })
    ).toEqual({
      sourceType: 'USER_STORY_ITEM',
      sourceId: 'item-1',
      ownerUserId: 'owner-1',
    });
  });

  it('rejects malformed payloads', () => {
    expect(parseStoryReplyInfo(null)).toBeNull();
    expect(parseStoryReplyInfo({ sourceType: 'BAD', sourceId: 'x', ownerUserId: 'y' })).toBeNull();
    expect(parseStoryReplyInfo({ sourceType: 'USER_STORY_ITEM' })).toBeNull();
  });
});
