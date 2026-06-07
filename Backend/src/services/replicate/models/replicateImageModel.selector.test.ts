import assert from 'node:assert/strict';
import {
  REPLICATE_PHOTO_MODEL_IDS,
  getReplicateImageModel,
  isReplicatePhotoModelId,
  resolveReplicatePhotoModelId,
} from './replicateImageModel.selector';

assert.equal(REPLICATE_PHOTO_MODEL_IDS.length, 4);
assert.ok(isReplicatePhotoModelId('black-forest-labs/flux-2-pro'));
assert.ok(!isReplicatePhotoModelId('unknown/model'));

const adapter = getReplicateImageModel('openai/gpt-image-2');
assert.equal(adapter.modelId, 'openai/gpt-image-2');

assert.equal(
  resolveReplicatePhotoModelId('google/nano-banana-2', 'black-forest-labs/flux-2-max'),
  'google/nano-banana-2'
);
assert.equal(
  resolveReplicatePhotoModelId('bad', 'black-forest-labs/flux-2-pro'),
  'black-forest-labs/flux-2-pro'
);

console.log('replicateImageModel.selector.test.ts: ok');
