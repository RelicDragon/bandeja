import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  ANIMATED_AVATAR_MAX_FRAMES,
  ANIMATED_AVATAR_SIZE,
  AnimatedAvatarError,
  AVATAR_FRAMES_MAX,
  ANIMATED_AVATAR_TINY_SIZE,
  ANIMATED_AVATAR_TINY_TARGET_BYTES,
  decimateFrames,
  assembleAnimatedAvatarFromFrames,
  inspectAnimatedAvatarSource,
  parseAnimatedAvatarCrop,
  parseAvatarFramesFps,
  renderAnimatedAvatar,
} from './animatedAvatar';
import {
  animatedAvatarTinyUrlFromStandard,
  isOurAnimatedAvatarUrl,
  isOurCircularAvatarUrl,
  userAvatarTinyUrlFromStandard,
} from './userAvatarTiny';

const FRAME_COLORS: Array<[number, number, number]> = [
  [220, 30, 30],
  [30, 200, 30],
  [30, 30, 220],
];

/** W x H frames: left half is the frame colour, right half white, a 10px black band on top. */
async function makeGif(width: number, height: number, frames: number, delay = 120): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * frames * 4);
  for (let f = 0; f < frames; f++) {
    const c = FRAME_COLORS[f % FRAME_COLORS.length];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = ((f * height + y) * width + x) * 4;
        const px = y < 10 ? [0, 0, 0] : x < width / 2 ? c : [255, 255, 255];
        raw[i] = px[0];
        raw[i + 1] = px[1];
        raw[i + 2] = px[2];
        raw[i + 3] = 255;
      }
    }
  }
  return sharp(raw, { raw: { width, height: height * frames, channels: 4, pageHeight: height } })
    .gif({ delay: Array(frames).fill(delay), loop: 0 })
    .toBuffer();
}

const near = (a: number, b: number) => Math.abs(a - b) <= 40;

async function main() {
  const gif = await makeGif(240, 160, 3);

  const info = await inspectAnimatedAvatarSource(gif);
  assert.equal(info.kind, 'gif');
  assert.equal(info.width, 240);
  assert.equal(info.height, 160, 'height is the page height, not the frame strip');
  assert.equal(info.frames, 3);
  assert.deepEqual(info.delays, [120, 120, 120]);

  // Crop sits below the black band, straddling the colour/white split at x=120.
  const crop = parseAnimatedAvatarCrop({ x: '70', y: '30', size: '100' }, info);
  assert.deepEqual(crop, { x: 70, y: 30, size: 100 });

  const out = await renderAnimatedAvatar(gif, info, crop);
  const meta = await sharp(out.animatedWebp, { animated: true }).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, ANIMATED_AVATAR_SIZE);
  assert.equal(meta.pageHeight, ANIMATED_AVATAR_SIZE);
  assert.equal(meta.pages, 3);
  assert.equal(meta.loop, 0);
  assert.deepEqual(meta.delay, [120, 120, 120]);

  // Every frame is cropped from its own page: left = that frame's colour, right = white, no black band.
  const px = await sharp(out.animatedWebp, { animated: true }).raw().toBuffer();
  const S = ANIMATED_AVATAR_SIZE;
  const channels = px.length / (S * S * 3);
  for (let f = 0; f < 3; f++) {
    const at = (x: number, y: number) => {
      const i = ((f * S + y) * S + x) * channels;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const left = at(20, S / 2);
    const right = at(S - 20, S / 2);
    const top = at(20, 3);
    FRAME_COLORS[f].forEach((v, k) => assert.ok(near(left[k], v), `frame ${f} left colour ${left}`));
    right.forEach((v) => assert.ok(near(v, 255), `frame ${f} right is white ${right}`));
    FRAME_COLORS[f].forEach((v, k) => assert.ok(near(top[k], v), `frame ${f} crop excludes the black band ${top}`));
  }

  // Tiny list variant: 96px, same frames at 120ms (already ≤ 12 fps), small.
  const tm = await sharp(out.animatedTinyWebp, { animated: true }).metadata();
  assert.equal(tm.width, ANIMATED_AVATAR_TINY_SIZE);
  assert.equal(tm.pageHeight, ANIMATED_AVATAR_TINY_SIZE);
  assert.equal(tm.pages, 3);
  assert.equal(tm.loop, 0);
  assert.deepEqual(tm.delay, [120, 120, 120]);
  assert.ok(out.animatedTinyWebp.length <= ANIMATED_AVATAR_TINY_TARGET_BYTES);
  const tpx = await sharp(out.animatedTinyWebp, { animated: true }).raw().toBuffer();
  const tch = tpx.length / (96 * 96 * 3);
  for (let f = 0; f < 3; f++) {
    const i = ((f * 96 + 48) * 96 + 8) * tch;
    FRAME_COLORS[f].forEach((v, k) => assert.ok(near(tpx[i + k], v), `tiny frame ${f} keeps its colour`));
  }

  // Frame decimation for the tiny variant keeps the loop length.
  assert.deepEqual(decimateFrames([40, 40, 40, 40, 40, 40], 83), { keep: [0, 3], delays: [120, 120] });
  assert.deepEqual(decimateFrames([100, 100], 83), { keep: [0, 1], delays: [100, 100] });
  assert.deepEqual(decimateFrames([67, 67, 67], 83), { keep: [0, 2], delays: [134, 67] });

  const stillCrop = await sharp(out.stillCrop).metadata();
  assert.equal(stillCrop.width, 100);
  assert.equal(stillCrop.height, 100);
  assert.equal(stillCrop.pages ?? 1, 1);
  const stillOriginal = await sharp(out.stillOriginal).metadata();
  assert.equal(stillOriginal.width, 240);
  assert.equal(stillOriginal.height, 160);

  // Crop rules
  assert.deepEqual(parseAnimatedAvatarCrop({ x: 141.4, y: 61, size: 100 }, info), { x: 140, y: 60, size: 100 });
  const badCrop = (raw: Record<string, unknown>) =>
    assert.throws(
      () => parseAnimatedAvatarCrop(raw, info),
      (e: unknown) => e instanceof AnimatedAvatarError && e.code === 'invalidCrop'
    );
  badCrop({});
  badCrop({ x: 'a', y: 0, size: 100 });
  badCrop({ x: 0, y: 0, size: 10 });
  badCrop({ x: 200, y: 0, size: 100 });
  badCrop({ x: -20, y: 0, size: 100 });

  // Rejections
  const rejects = async (buf: Buffer, code: AnimatedAvatarError['code']) =>
    assert.rejects(inspectAnimatedAvatarSource(buf), (e: unknown) => e instanceof AnimatedAvatarError && e.code === code);
  await rejects(await makeGif(64, 64, 1), 'notAnimated');
  await rejects(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).png().toBuffer(), 'unsupported');
  await rejects(Buffer.from('not an image at all'), 'unsupported');
  await rejects(await makeGif(16, 16, ANIMATED_AVATAR_MAX_FRAMES + 1), 'tooComplex');
  await rejects(await makeGif(32, 32, 3, 30_000), 'tooLong');

  // Animated WebP input works too; tiny delays normalise to 100ms.
  const webpIn = await sharp(gif, { animated: true }).webp({ delay: [0, 0, 0], loop: 0 }).toBuffer();
  const webpInfo = await inspectAnimatedAvatarSource(webpIn);
  assert.equal(webpInfo.kind, 'webp');
  assert.equal(webpInfo.frames, 3);
  assert.deepEqual(webpInfo.delays, [100, 100, 100]);

  // Video path: client-cut 256x256 frames joined into a WebP.
  const frame = (c: [number, number, number], format: 'jpeg' | 'webp' = 'jpeg', size = 256) => {
    const img = sharp({ create: { width: size, height: size, channels: 3, background: { r: c[0], g: c[1], b: c[2] } } });
    return format === 'jpeg' ? img.jpeg({ quality: 85 }).toBuffer() : img.webp({ quality: 85 }).toBuffer();
  };
  const frames = await Promise.all([frame(FRAME_COLORS[0]), frame(FRAME_COLORS[1], 'webp'), frame(FRAME_COLORS[2])]);
  const joined = await assembleAnimatedAvatarFromFrames(frames, 12);
  const jm = await sharp(joined.animatedWebp, { animated: true }).metadata();
  assert.equal(jm.format, 'webp');
  assert.equal(jm.width, 256);
  assert.equal(jm.pageHeight, 256);
  assert.equal(jm.pages, 3);
  assert.equal(jm.loop, 0);
  assert.deepEqual(jm.delay, [83, 83, 83]);
  const jt = await sharp(joined.animatedTinyWebp, { animated: true }).metadata();
  assert.equal(jt.width, ANIMATED_AVATAR_TINY_SIZE);
  assert.equal(jt.pages, 3, '12 fps input keeps every frame in the tiny variant');
  const fast = await assembleAnimatedAvatarFromFrames(
    await Promise.all(Array.from({ length: 6 }, (_, i) => frame([i * 40, 255 - i * 40, 128]))),
    15
  );
  const ft = await sharp(fast.animatedTinyWebp, { animated: true }).metadata();
  assert.ok((ft.pages ?? 0) < 6, '15 fps input is thinned to ≤ 12 fps for lists');
  assert.equal((ft.delay ?? []).reduce((a, b) => a + b, 0), 6 * 67, 'loop length unchanged');
  const jpx = await sharp(joined.animatedWebp, { animated: true }).raw().toBuffer();
  const jch = jpx.length / (256 * 256 * 3);
  for (let f = 0; f < 3; f++) {
    const i = ((f * 256 + 128) * 256 + 128) * jch;
    FRAME_COLORS[f].forEach((v, k) => assert.ok(near(jpx[i + k], v), `joined frame ${f} keeps its order`));
  }
  const jStill = await sharp(joined.stillCrop).raw().toBuffer({ resolveWithObject: true });
  assert.equal(jStill.info.width, 256);
  FRAME_COLORS[0].forEach((v, k) => assert.ok(near(jStill.data[k], v), 'still is the first frame'));

  assert.equal(parseAvatarFramesFps('12'), 12);
  for (const bad of [undefined, '', '7', '16', '12.5', 'x']) {
    assert.throws(() => parseAvatarFramesFps(bad), (e: unknown) => e instanceof AnimatedAvatarError && e.code === 'invalidFrames');
  }
  const framesRejects = async (list: Buffer[], code: AnimatedAvatarError['code']) =>
    assert.rejects(assembleAnimatedAvatarFromFrames(list, 12), (e: unknown) => e instanceof AnimatedAvatarError && e.code === code);
  await framesRejects([frames[0]], 'invalidFrames');
  await framesRejects(Array(AVATAR_FRAMES_MAX + 1).fill(frames[0]), 'invalidFrames');
  await framesRejects([frames[0], await frame(FRAME_COLORS[1], 'jpeg', 200)], 'invalidFrames');
  await framesRejects([frames[0], await sharp({ create: { width: 256, height: 256, channels: 3, background: '#888' } }).png().toBuffer()], 'invalidFrames');
  await framesRejects([frames[0], gif], 'invalidFrames');
  await framesRejects([frames[0], Buffer.alloc(4.5 * 1024 * 1024, 1)], 'tooLarge');

  // Regression (ghost rectangles): a high-contrast square racing across a gradient must not leave
  // a trail of the previous frame. Decoded frames are compared to the frames the encoder received.
  {
    const S = 256;
    const N = 24;
    const squareX = (f: number) => Math.round(-60 + (f * (S + 60)) / (N - 1));
    const inSquare = (f: number, x: number, y: number) => {
      const sx = squareX(f);
      return x >= sx && x < sx + 56 && y >= 90 && y < 146;
    };
    const sources = await Promise.all(
      Array.from({ length: N }, (_, f) => {
        const raw = Buffer.alloc(S * S * 3);
        const sx = squareX(f);
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            let c = [Math.round(40 + (150 * x) / S), Math.round(60 + (120 * y) / S), 140];
            if (inSquare(f, x, y)) c = [250, 250, 250];
            if (x >= sx + 8 && x < sx + 48 && y >= 98 && y < 138) c = [10, 10, 10];
            raw.set(c, (y * S + x) * 3);
          }
        }
        return sharp(raw, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
      })
    );
    const refs = await Promise.all(sources.map((b) => sharp(b).removeAlpha().raw().toBuffer()));
    const moving = await assembleAnimatedAvatarFromFrames(sources, 12);
    const mm = await sharp(moving.animatedWebp, { animated: true }).metadata();
    assert.equal(mm.pages, N);
    const dec = await sharp(moving.animatedWebp, { animated: true }).removeAlpha().raw().toBuffer();
    const near = (f: number, x: number, y: number) =>
      [-6, 0, 6].some((dx) => [-6, 0, 6].some((dy) => inSquare(f, x + dx, y + dy)));
    let trailMax = 0;
    let overallMax = 0;
    for (let f = 1; f < N; f++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const p = y * S + x;
          let d = 0;
          for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(dec[(f * S * S + p) * 3 + k] - refs[f][p * 3 + k]));
          if (near(f, x, y)) continue; // edges of the live square are ordinary lossy ringing
          overallMax = Math.max(overallMax, d);
          if (near(f - 1, x, y)) trailMax = Math.max(trailMax, d);
        }
      }
    }
    assert.ok(trailMax <= 24, `no ghost of the previous frame (trail max error ${trailMax})`);
    assert.ok(overallMax <= 32, `background stays close to the source (max error ${overallMax})`);
  }

  // URL ownership
  const animatedUrl = 'https://cdn.example.net/uploads/avatars/animated/0b7e_avatar.anim.webp';
  assert.equal(isOurAnimatedAvatarUrl(animatedUrl), true);
  assert.equal(
    animatedAvatarTinyUrlFromStandard(`${animatedUrl}?v=2`),
    'https://cdn.example.net/uploads/avatars/animated/0b7e_avatar.anim.tiny.webp?v=2'
  );
  assert.equal(animatedAvatarTinyUrlFromStandard('https://cdn.example.net/uploads/avatars/circular/0b7e_avatar.jpg'), null);
  assert.equal(isOurAnimatedAvatarUrl('https://cdn.example.net/uploads/avatars/animated/0b7e_avatar.anim.tiny.webp'), false);
  assert.equal(isOurAnimatedAvatarUrl('https://cdn.example.net/uploads/avatars/circular/0b7e_avatar.jpg'), false);
  assert.equal(isOurAnimatedAvatarUrl('https://giphy.com/media/x/giphy.webp'), false);
  assert.equal(isOurAnimatedAvatarUrl(null), false);
  assert.equal(isOurCircularAvatarUrl(animatedUrl), false, 'still-avatar helpers never treat the animation as a still');
  assert.equal(userAvatarTinyUrlFromStandard(animatedUrl), null);

  console.log('animatedAvatar tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
