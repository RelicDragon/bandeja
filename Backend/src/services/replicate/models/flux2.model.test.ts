import assert from 'node:assert/strict';
import {
  FLUX_2_PRO_MODEL_ID,
  buildFlux2ProInput,
  flux2ProModel,
} from './flux2.model';
import { getReplicateImageModel } from './replicateImageModel.selector';

assert.equal(FLUX_2_PRO_MODEL_ID, 'black-forest-labs/flux-2-pro');
assert.equal(flux2ProModel.modelId, FLUX_2_PRO_MODEL_ID);
assert.equal(getReplicateImageModel('black-forest-labs/flux-2-pro'), flux2ProModel);

const built = buildFlux2ProInput({
  prompt: 'stylized padel winners',
  input_images: ['data:image/jpeg;base64,abc'],
  aspect_ratio: '4:5',
  output_format: 'webp',
});

assert.equal(built.prompt, 'stylized padel winners');
assert.deepEqual(built.input_images, ['data:image/jpeg;base64,abc']);
assert.equal(built.aspect_ratio, '4:5');
assert.equal(built.resolution, '1 MP');
assert.equal(built.output_format, 'webp');
assert.equal(built.output_quality, 80);

const overrides = buildFlux2ProInput({
  prompt: 'custom resolution',
  resolution: '2 MP',
  output_quality: 95,
});
assert.equal(overrides.resolution, '2 MP');
assert.equal(overrides.output_quality, 95);

console.log('flux2.model.test.ts: ok');
