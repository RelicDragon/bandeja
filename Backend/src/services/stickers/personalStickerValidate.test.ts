import assert from 'assert';
import sharp from 'sharp';
import {
  detectStickerSourceMagic,
  validatePersonalStickerSource,
  normalizePersonalStickerWebp,
  bufferHasTransparency,
} from './personalStickerValidate';
import { ApiError } from '../../utils/ApiError';

async function makeTransparentPng(size = 128): Promise<Buffer> {
  const raw = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[i] = 40;
      raw[i + 1] = 160;
      raw[i + 2] = 80;
      raw[i + 3] = x < size / 2 ? 255 : 0;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

async function makeOpaqueJpeg(size = 128): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

async function makeOpaquePng(size = 128): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
}

async function testMagicAndAlpha() {
  const png = await makeTransparentPng();
  assert.strictEqual(detectStickerSourceMagic(png), 'png');
  assert.ok(await bufferHasTransparency(png));

  const jpeg = await makeOpaqueJpeg();
  assert.strictEqual(detectStickerSourceMagic(jpeg), null);

  const opaque = await makeOpaquePng();
  assert.strictEqual(detectStickerSourceMagic(opaque), 'png');
  assert.ok(!(await bufferHasTransparency(opaque)));
  console.log('ok magic + alpha helpers');
}

async function testValidateAcceptsTransparent() {
  const png = await makeTransparentPng(200);
  const ok = await validatePersonalStickerSource(png);
  assert.strictEqual(ok.kind, 'png');
  assert.ok(ok.width >= 64);
  console.log('ok validate accepts transparent png');
}

async function testValidateRejectsJpeg() {
  const jpeg = await makeOpaqueJpeg();
  let code: string | undefined;
  try {
    await validatePersonalStickerSource(jpeg);
  } catch (e) {
    assert.ok(e instanceof ApiError);
    code = (e as ApiError).data?.code as string | undefined;
  }
  assert.strictEqual(code, 'sticker.personal.unsupportedFormat');
  console.log('ok validate rejects jpeg');
}

async function testValidateRejectsOpaquePng() {
  const opaque = await makeOpaquePng();
  let code: string | undefined;
  try {
    await validatePersonalStickerSource(opaque);
  } catch (e) {
    assert.ok(e instanceof ApiError);
    code = (e as ApiError).data?.code as string | undefined;
  }
  assert.strictEqual(code, 'sticker.personal.noAlpha');
  console.log('ok validate rejects opaque png');
}

async function testValidateRejectsTiny() {
  const tiny = await makeTransparentPng(32);
  let code: string | undefined;
  try {
    await validatePersonalStickerSource(tiny);
  } catch (e) {
    assert.ok(e instanceof ApiError);
    code = (e as ApiError).data?.code as string | undefined;
  }
  assert.strictEqual(code, 'sticker.personal.invalidDimensions');
  console.log('ok validate rejects tiny');
}

async function testNormalizeWebp() {
  const png = await makeTransparentPng(600);
  const out = await normalizePersonalStickerWebp(png);
  assert.ok(out.webp.length > 0);
  assert.ok(out.width <= 512);
  assert.ok(out.height <= 512);
  assert.ok(out.contentHash.length === 64);
  assert.strictEqual(detectStickerSourceMagic(out.webp), 'webp');
  assert.ok(await bufferHasTransparency(out.webp));
  console.log('ok normalize to webp');
}

async function main() {
  await testMagicAndAlpha();
  await testValidateAcceptsTransparent();
  await testValidateRejectsJpeg();
  await testValidateRejectsOpaquePng();
  await testValidateRejectsTiny();
  await testNormalizeWebp();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
