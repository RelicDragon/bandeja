import assert from 'node:assert/strict';
import { ApiError } from '../../utils/ApiError';
import {
  formatStoryReplyNotificationBody,
  formatStoryReplyPreview,
  isAllowedStoryReplyAttachmentUrl,
  sanitizeStoryReply,
  validateStoryReplyForUserChat,
} from './storyReplySanitize';

const CF = 'https://d1afylun4w6qxe.cloudfront.net';
const validPayload = {
  sourceType: 'USER_STORY_ITEM',
  sourceId: 'item-1',
  ownerUserId: 'owner-1',
  thumbnailUrl: `${CF}/uploads/stories/thumbnails/thumb.jpg`,
  mediaUrl: `${CF}/uploads/stories/originals/full.jpg`,
  mediaType: 'IMAGE',
};

assert.deepEqual(sanitizeStoryReply(validPayload), {
  sourceType: 'USER_STORY_ITEM',
  sourceId: 'item-1',
  ownerUserId: 'owner-1',
  thumbnailUrl: `${CF}/uploads/stories/thumbnails/thumb.jpg`,
  mediaUrl: `${CF}/uploads/stories/originals/full.jpg`,
  mediaType: 'IMAGE',
});

assert.equal(
  sanitizeStoryReply({
    ...validPayload,
    thumbnailUrl: 'https://evil.example.com/thumb.jpg',
  }),
  null
);

assert.equal(sanitizeStoryReply({ sourceType: 'BAD', sourceId: 'x', ownerUserId: 'y' }), null);
assert.equal(sanitizeStoryReply(null), null);
assert.equal(sanitizeStoryReply('string'), null);

const validated = validateStoryReplyForUserChat(validPayload, 'sender-1', {
  user1Id: 'sender-1',
  user2Id: 'owner-1',
});
assert.equal(validated.ownerUserId, 'owner-1');

assert.throws(
  () =>
    validateStoryReplyForUserChat(validPayload, 'sender-1', {
      user1Id: 'sender-1',
      user2Id: 'other-user',
    }),
  (err: unknown) => err instanceof ApiError && err.statusCode === 400
);

assert.throws(
  () =>
    validateStoryReplyForUserChat({ sourceType: 'nope' }, 'sender-1', {
      user1Id: 'sender-1',
      user2Id: 'owner-1',
    }),
  (err: unknown) => err instanceof ApiError && err.statusCode === 400
);

assert.equal(formatStoryReplyPreview('😂'), '[TYPE:STORY_REPLY]😂');
assert.equal(formatStoryReplyPreview('  '), '[TYPE:STORY_REPLY]…');
assert.equal(formatStoryReplyNotificationBody('🔥'), 'Replied to your story: 🔥');
assert.equal(formatStoryReplyNotificationBody(''), 'Replied to your story');
assert.equal(formatStoryReplyNotificationBody('🔥', 'ru'), 'Ответ на вашу историю: 🔥');

assert.equal(
  isAllowedStoryReplyAttachmentUrl(
    'https://d1afylun4w6qxe.cloudfront.net/uploads/games/thumbnails/photo.jpg'
  ),
  true
);

console.log('ok: storyReplySanitize.test.ts');
