#!/usr/bin/env ts-node
/**
 * Unit checks for story media URL validation (no DB).
 * Run: npx ts-node scripts/tests/story-validate.ts
 */

import {
  isAllowedStoryMediaUrl,
  isStoryItemMediaInvalid,
  isValidStoryMediaKey,
} from '../../src/services/story/story.validate.service';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(isValidStoryMediaKey('uploads/stories/originals/abc.jpg'), 'originals key');
assert(isValidStoryMediaKey('uploads/stories/videos/clip.mp4'), 'videos key');
assert(!isValidStoryMediaKey('uploads/chat/originals/x.jpg'), 'chat key rejected');

assert(
  isAllowedStoryMediaUrl('/uploads/stories/thumbnails/t.jpg'),
  'relative thumbnail path'
);
assert(
  isAllowedStoryMediaUrl('https://d1afylun4w6qxe.cloudfront.net/uploads/stories/originals/o.jpg'),
  'cloudfront story url'
);
assert(!isAllowedStoryMediaUrl('https://evil.example.com/uploads/stories/originals/o.jpg'), 'wrong host');
assert(!isAllowedStoryMediaUrl(''), 'empty url');

assert(
  isStoryItemMediaInvalid({
    mediaUrl: '/uploads/stories/originals/a.jpg',
    thumbnailUrl: '/uploads/stories/thumbnails/b.jpg',
  }) === false,
  'valid pair'
);
assert(
  isStoryItemMediaInvalid({
    mediaUrl: '',
    thumbnailUrl: '/uploads/stories/thumbnails/b.jpg',
  }),
  'empty media invalid'
);

console.log('story-validate: all checks passed');
