import assert from 'node:assert/strict';
import { mapAspectRatioToGptImage2 } from './aspectRatioMapping';
import { buildGptImage2Input } from './gptImage2.model';

assert.equal(mapAspectRatioToGptImage2('4:5'), '2:3', '4:5 portrait maps to 2:3');
assert.equal(mapAspectRatioToGptImage2('1:1'), '1:1');
assert.equal(mapAspectRatioToGptImage2('3:2'), '3:2');
assert.equal(mapAspectRatioToGptImage2('16:9'), '3:2', 'landscape maps to 3:2');
assert.equal(mapAspectRatioToGptImage2(undefined), '2:3', 'missing ratio uses portrait fallback');

const built = buildGptImage2Input({
  prompt: 'stylized padel winners',
  input_images: ['data:image/jpeg;base64,abc'],
  aspect_ratio: '4:5',
  output_format: 'webp',
  resolution: '1 MP',
  output_quality: 80,
});

assert.equal(built.prompt, 'stylized padel winners');
assert.deepEqual(built.input_images, ['data:image/jpeg;base64,abc']);
assert.equal(built.aspect_ratio, '2:3');
assert.equal(built.quality, 'high');
assert.equal(built.number_of_images, 1);
assert.equal(built.output_format, 'webp');
assert.equal(built.background, 'auto');
assert.equal(built.moderation, 'auto');

console.log('gptImage2.model.test.ts: ok');
