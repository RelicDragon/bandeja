import { describe, expect, it } from 'vitest';
import { buildStoryReplyInfo } from './storyReplyInfo';
import type { StorySegment } from '@/api/stories';

describe('buildStoryReplyInfo', () => {
  it('maps USER_STORY_ITEM media fields', () => {
    const segment = {
      key: 'USER_STORY_ITEM:item-1',
      viewed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      sourceType: 'USER_STORY_ITEM',
      media: {
        url: 'https://cdn.example.com/full.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        type: 'VIDEO',
      },
    } as StorySegment;

    expect(buildStoryReplyInfo(segment, 'owner-1')).toEqual({
      sourceType: 'USER_STORY_ITEM',
      sourceId: 'item-1',
      ownerUserId: 'owner-1',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      mediaUrl: 'https://cdn.example.com/full.jpg',
      mediaType: 'VIDEO',
    });
  });

  it('falls back to game avatar for promo segments', () => {
    const segment = {
      key: 'GAME_CREATED:game-1',
      viewed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      sourceType: 'GAME_CREATED',
      game: {
        id: 'game-1',
        entityType: 'GAME',
        startTime: '2026-01-01T12:00:00.000Z',
        avatar: 'https://cdn.example.com/avatar.jpg',
      },
    } as StorySegment;

    expect(buildStoryReplyInfo(segment, 'owner-2')).toEqual({
      sourceType: 'GAME_CREATED',
      sourceId: 'game-1',
      ownerUserId: 'owner-2',
      thumbnailUrl: 'https://cdn.example.com/avatar.jpg',
      mediaType: 'IMAGE',
    });
  });

  it('returns null for malformed segment keys', () => {
    const segment = {
      key: 'bad-key',
      viewed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      sourceType: 'USER_STORY_ITEM',
      media: {
        url: 'https://cdn.example.com/full.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        type: 'IMAGE',
      },
    } as StorySegment;

    expect(buildStoryReplyInfo(segment, 'owner-1')).toBeNull();
  });
});
