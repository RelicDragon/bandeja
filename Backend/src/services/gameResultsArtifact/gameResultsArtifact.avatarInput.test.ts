import assert from 'node:assert/strict';
import {
  bufferToImageDataUri,
  downloadAvatarAsDataUri,
  mimeTypeFromAvatarPath,
  mimeTypeFromImageBuffer,
  resolveAvatarMimeType,
  resolveParticipantAvatarSources,
  toPublicAvatarUrl,
} from './gameResultsArtifact.avatarInput';

const standardAvatar =
  'https://cdn.example.com/uploads/avatars/circular/abc_avatar.jpg';

assert.deepEqual(resolveParticipantAvatarSources({ avatar: standardAvatar }), {
  primary: standardAvatar,
  fallback: null,
});
assert.deepEqual(
  resolveParticipantAvatarSources({ avatar: 'https://lh3.googleusercontent.com/x' }),
  { primary: 'https://lh3.googleusercontent.com/x', fallback: null }
);
assert.equal(resolveParticipantAvatarSources({ avatar: null }), null);

assert.equal(mimeTypeFromAvatarPath('x.png'), 'image/png');
assert.equal(mimeTypeFromAvatarPath('x.tiny.jpg'), 'image/jpeg');

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
assert.equal(mimeTypeFromImageBuffer(pngHeader), 'image/png');
assert.equal(resolveAvatarMimeType(pngHeader, 'wrong.jpg'), 'image/png');

const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0, 0]);
assert.equal(mimeTypeFromImageBuffer(jpegHeader), 'image/jpeg');
assert.match(
  bufferToImageDataUri(jpegHeader, 'image/jpeg'),
  /^data:image\/jpeg;base64,/
);

assert.match(
  toPublicAvatarUrl('/uploads/avatars/circular/x_avatar.jpg') ?? '',
  /^https:\/\/.+\/uploads\/avatars\/circular\/x_avatar\.jpg$/
);
assert.equal(toPublicAvatarUrl(''), null);
assert.equal(toPublicAvatarUrl('https://already.example/a.png'), 'https://already.example/a.png');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

(async () => {
  const ok = await downloadAvatarAsDataUri(
    { primary: standardAvatar, fallback: null },
    async () => jpeg
  );
  assert.match(ok ?? '', /^data:image\/jpeg;base64,/);

  const none = await downloadAvatarAsDataUri(
    { primary: standardAvatar, fallback: null },
    async () => {
      throw new Error('fail');
    }
  );
  assert.equal(none, null);
})().then(() => {
  console.log('gameResultsArtifact.avatarInput.test.ts: ok');
});
