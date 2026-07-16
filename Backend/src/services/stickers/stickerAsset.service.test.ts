import assert from 'assert';
import { isStickerCatalogUrl, publicUrlForKey, stickerStaticS3Key } from './stickerAsset.service';
import { STICKER_STORAGE_PREFIX } from './stickerConstants';

function testIsStickerCatalogUrl() {
  const key = stickerStaticS3Key('reactions', 'ball', 'abcdef0123456789');
  assert.strictEqual(key, 'uploads/stickers/packs/reactions/ball.abcdef012345.webp');
  assert.ok(key.startsWith(STICKER_STORAGE_PREFIX));

  const legacy = stickerStaticS3Key('reactions', 'ball');
  assert.strictEqual(legacy, 'uploads/stickers/packs/reactions/ball.webp');

  const url = publicUrlForKey(key);
  assert.ok(url.includes('/stickers/packs/reactions/ball.abcdef012345.webp'));
  assert.ok(isStickerCatalogUrl(url));
  assert.ok(isStickerCatalogUrl(key));
  assert.ok(!isStickerCatalogUrl('https://cdn.example.com/uploads/chat/originals/x.webp'));
  console.log('ok isStickerCatalogUrl + s3 keys');
}

testIsStickerCatalogUrl();
