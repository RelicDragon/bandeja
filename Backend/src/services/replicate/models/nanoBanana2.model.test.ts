import assert from 'node:assert/strict';
import { extractReplicateImageUrl } from './extractReplicateImageOutput';
import { getReplicateImageModel } from './replicateImageModel.selector';
import {
  NANO_BANANA_2_MAX_IMAGE_INPUT,
  NANO_BANANA_2_MODEL_ID,
  buildNanoBanana2Input,
  nanoBanana2Model,
} from './nanoBanana2.model';

const built = buildNanoBanana2Input({
  prompt: 'stylized padel winners',
  input_images: ['data:image/jpeg;base64,abc'],
  aspect_ratio: '4:5',
  resolution: '1 MP',
  output_format: 'webp',
});

assert.equal(built.prompt, 'stylized padel winners');
assert.deepEqual(built.image_input, ['data:image/jpeg;base64,abc']);
assert.equal(built.aspect_ratio, '4:5');
assert.equal(built.resolution, '1K');
assert.equal(built.output_format, 'jpg');
assert.equal(built.google_search, false);
assert.equal(built.image_search, false);

const pngBuilt = buildNanoBanana2Input({
  prompt: 'stylized padel winners',
  input_images: ['data:image/jpeg;base64,abc'],
  aspect_ratio: '4:5',
  output_format: 'png',
});
assert.equal(pngBuilt.output_format, 'png');

const cappedImages = Array.from(
  { length: NANO_BANANA_2_MAX_IMAGE_INPUT + 3 },
  (_, i) => `data:image/jpeg;base64,${i}`
);
const cappedBuilt = buildNanoBanana2Input({
  prompt: 'stylized padel winners',
  input_images: cappedImages,
});
assert.equal(cappedBuilt.image_input?.length, NANO_BANANA_2_MAX_IMAGE_INPUT);

assert.equal(NANO_BANANA_2_MODEL_ID, 'google/nano-banana-2');
assert.equal(getReplicateImageModel(NANO_BANANA_2_MODEL_ID), nanoBanana2Model);

const uri = 'https://replicate.delivery/out.jpg';
assert.equal(extractReplicateImageUrl(uri), uri);
assert.equal(nanoBanana2Model.extractOutputImageUrl(uri), uri);

console.log('nanoBanana2.model.test.ts: ok');
