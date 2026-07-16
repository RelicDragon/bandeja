import assert from 'assert';
import { isPersonalStickerSendableBy, isStickerPackVisibleToUser } from './stickerPackAccess';

function testPackVisibility() {
  assert.ok(isStickerPackVisibleToUser({ isOfficial: true, ownerUserId: null }, undefined));
  assert.ok(isStickerPackVisibleToUser({ isOfficial: true, ownerUserId: null }, 'u1'));
  assert.ok(isStickerPackVisibleToUser({ isOfficial: false, ownerUserId: 'u1' }, 'u1'));
  assert.ok(!isStickerPackVisibleToUser({ isOfficial: false, ownerUserId: 'u1' }, 'u2'));
  assert.ok(!isStickerPackVisibleToUser({ isOfficial: false, ownerUserId: 'u1' }, undefined));
  console.log('ok pack visibility');
}

function testSendable() {
  assert.ok(
    isPersonalStickerSendableBy(
      { isOfficial: true, ownerUserId: null, isActive: true },
      'anyone'
    )
  );
  assert.ok(
    isPersonalStickerSendableBy(
      { isOfficial: false, ownerUserId: 'u1', isActive: true },
      'u1'
    )
  );
  assert.ok(
    !isPersonalStickerSendableBy(
      { isOfficial: false, ownerUserId: 'u1', isActive: true },
      'u2'
    )
  );
  assert.ok(
    !isPersonalStickerSendableBy(
      { isOfficial: true, ownerUserId: null, isActive: false },
      'u1'
    )
  );
  console.log('ok sendable ownership');
}

testPackVisibility();
testSendable();
