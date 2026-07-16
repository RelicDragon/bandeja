/**
 * One-shot placeholder sticker asset generator.
 * Writes WebP binaries under Backend/assets/stickers/{packSlug}/.
 *
 * Ops: npm run generate:sticker-assets → commit binaries → npm run seed:sticker-packs on env.
 * Animated frames need `ffmpeg` on PATH.
 *
 * Usage: cd Backend && npm run generate:sticker-assets
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import os from 'os';
import sharp from 'sharp';
import {
  ANIMATED_ASSET_FILENAME,
  OFFICIAL_PACK_MANIFESTS,
  STATIC_ASSET_FILENAME,
  type StickerManifestItem,
} from '../src/services/stickers/stickerPackManifest';

const SIZE = 512;
const ASSETS_ROOT = path.join(__dirname, '../assets/stickers');

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Letter + shapes only — avoids Pango color-emoji crashes in sharp/librsvg. */
function stickerSvg(item: StickerManifestItem, scale = 1, rotDeg = 0): string {
  const label = escapeXml(item.title.slice(0, 2).toUpperCase());
  const cx = 256;
  const cy = 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <radialGradient id="g" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${item.accent}" stop-opacity="0.98"/>
      <stop offset="100%" stop-color="${item.bg}" stop-opacity="0.94"/>
    </radialGradient>
  </defs>
  <g transform="translate(${cx} ${cy}) rotate(${rotDeg}) scale(${scale}) translate(${-cx} ${-cy})">
    <circle cx="256" cy="256" r="220" fill="url(#g)"/>
    <circle cx="256" cy="256" r="198" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="12"/>
    <circle cx="256" cy="210" r="70" fill="#ffffff" fill-opacity="0.14"/>
    <text x="256" y="300" font-size="150" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700">${label}</text>
  </g>
</svg>`;
}

async function renderStaticWebp(item: StickerManifestItem): Promise<Buffer> {
  return sharp(Buffer.from(stickerSvg(item, 1, 0)), { density: 144 })
    .resize(SIZE, SIZE)
    .webp({ quality: 90, alphaQuality: 90 })
    .toBuffer();
}

async function renderFramePng(item: StickerManifestItem, scale: number, rotDeg: number): Promise<Buffer> {
  return sharp(Buffer.from(stickerSvg(item, scale, rotDeg)), { density: 144 })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-800)}`));
    });
  });
}

async function renderAnimatedWebp(item: StickerManifestItem): Promise<Buffer> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-anim-'));
  try {
    const scales = [0.86, 0.94, 1.04, 1.08, 1.0, 0.92];
    const rots = [-8, -3, 2, 7, 3, -5];
    for (let i = 0; i < scales.length; i++) {
      const png = await renderFramePng(item, scales[i]!, rots[i]!);
      await fs.writeFile(path.join(tmp, `f${String(i).padStart(2, '0')}.png`), png);
    }
    const gifPath = path.join(tmp, 'out.gif');
    await runFfmpeg([
      '-y',
      '-framerate',
      '12',
      '-i',
      path.join(tmp, 'f%02d.png'),
      '-loop',
      '0',
      '-gifflags',
      '-offsetting',
      gifPath,
    ]);
    const gif = await fs.readFile(gifPath);
    return sharp(gif, { animated: true, pages: -1 })
      .webp({ quality: 85, alphaQuality: 85, effort: 4, loop: 0 })
      .toBuffer();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  let written = 0;
  for (const pack of OFFICIAL_PACK_MANIFESTS) {
    const dir = path.join(ASSETS_ROOT, pack.slug);
    await fs.mkdir(dir, { recursive: true });
    // clear old files for this pack so removed slugs do not linger
    for (const name of await fs.readdir(dir)) {
      await fs.unlink(path.join(dir, name));
    }
    for (const sticker of pack.stickers) {
      const staticBuf = await renderStaticWebp(sticker);
      await fs.writeFile(path.join(dir, STATIC_ASSET_FILENAME(sticker.slug)), staticBuf);
      written++;
      console.log(
        `wrote ${pack.slug}/${STATIC_ASSET_FILENAME(sticker.slug)} (${staticBuf.length}B sha=${crypto.createHash('sha256').update(staticBuf).digest('hex').slice(0, 12)})`
      );

      if (sticker.animated) {
        const animBuf = await renderAnimatedWebp(sticker);
        await fs.writeFile(path.join(dir, ANIMATED_ASSET_FILENAME(sticker.slug)), animBuf);
        written++;
        const pages = (await sharp(animBuf, { animated: true }).metadata()).pages ?? 1;
        console.log(
          `wrote ${pack.slug}/${ANIMATED_ASSET_FILENAME(sticker.slug)} (${animBuf.length}B pages=${pages})`
        );
      }
    }
  }
  console.log(`done: ${written} files under ${ASSETS_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
