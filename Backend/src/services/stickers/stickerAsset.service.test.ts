import assert from 'assert';
import { isStickerCatalogUrl, publicUrlForKey, stickerStaticS3Key } from './stickerAsset.service';
import { STICKER_STORAGE_PREFIX } from './stickerConstants';

function testIsStickerCatalogUrl() {
  const key = stickerStaticS3Key('reactions', 'ball');
  assert.strictEqual(key, 'uploads/stickers/packs/reactions/ball.webp');
  assert.ok(key.startsWith(STICKER_STORAGE_PREFIX));

  const url = publicUrlForKey(key);
  assert.ok(url.includes('/stickers/packs/reactions/ball.webp'));
  assert.ok(isStickerCatalogUrl(url));
  assert.ok(isStickerCatalogUrl(key));
  assert.ok(!isStickerCatalogUrl('https://cdn.example.com/uploads/chat/originals/x.webp'));
  console.log('ok isStickerCatalogUrl + s3 keys');
}

testIsStickerCatalogUrl();
