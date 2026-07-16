/**
 * Download Microsoft Fluent UI Emoji 3D PNGs → WebP stickers under Backend/assets/stickers/.
 * License: MIT (https://github.com/microsoft/fluentui-emoji)
 *
 * Animated stickers need `img2webp` (libwebp) on PATH — preserves alpha.
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
  FLUENT_EMOJI_CDN_BASE,
  OFFICIAL_PACK_MANIFESTS,
  STATIC_ASSET_FILENAME,
  type StickerManifestItem,
} from '../src/services/stickers/stickerPackManifest';

const SIZE = 512;
const ASSETS_ROOT = path.join(__dirname, '../assets/stickers');
/** ~12 fps */
const FRAME_DURATION_MS = 83;

async function downloadFluentPng(item: StickerManifestItem): Promise<Buffer> {
  const url = FLUENT_EMOJI_CDN_BASE + encodeURI(item.fluentPath);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${item.slug}: HTTP ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error(`Tiny download for ${item.slug} (${buf.length}B) from ${url}`);
  }
  return buf;
}

/** Fluent 3D PNG → transparent 512×512 WebP (fit inside square, no mock backdrop). */
async function renderStaticWebp(png: Buffer): Promise<Buffer> {
  return sharp(png)
    .ensureAlpha()
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
}

async function renderFramePng(png: Buffer, scale: number, rotDeg: number): Promise<Buffer> {
  const dim = Math.max(1, Math.round(SIZE * scale));
  // rotate expands bbox — refit into SIZE so composite always fits
  const framed = await sharp(png)
    .ensureAlpha()
    .resize(dim, dim, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .rotate(rotDeg, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: framed, gravity: 'centre' }])
    .png()
    .toBuffer();
}

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited ${code}: ${err.slice(-800)}`));
    });
  });
}

/** PNG sequence → animated WebP via img2webp (keeps alpha). */
async function renderAnimatedWebp(png: Buffer): Promise<Buffer> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sticker-anim-'));
  try {
    const scales = [0.86, 0.94, 1.04, 1.08, 1.0, 0.92];
    const rots = [-8, -3, 2, 7, 3, -5];
    const framePaths: string[] = [];
    for (let i = 0; i < scales.length; i++) {
      const frame = await renderFramePng(png, scales[i]!, rots[i]!);
      const framePath = path.join(tmp, `f${String(i).padStart(2, '0')}.png`);
      await fs.writeFile(framePath, frame);
      framePaths.push(framePath);
    }
    const outPath = path.join(tmp, 'out.webp');
    const args: string[] = ['-loop', '0', '-lossy', '-q', '85', '-m', '4', '-exact'];
    for (const framePath of framePaths) {
      args.push('-d', String(FRAME_DURATION_MS), framePath);
    }
    args.push('-o', outPath);
    await runCmd('img2webp', args);
    return fs.readFile(outPath);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function assertHasTransparency(label: string, webp: Buffer): Promise<void> {
  const meta = await sharp(webp, { animated: true, pages: 1 }).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  let transparent = 0;
  for (let i = 3; i < meta.data.length; i += 4) {
    if (meta.data[i]! < 250) transparent++;
  }
  if (transparent === 0) {
    throw new Error(`${label} has no transparent pixels (alpha lost)`);
  }
}

async function main() {
  let written = 0;
  for (const pack of OFFICIAL_PACK_MANIFESTS) {
    const dir = path.join(ASSETS_ROOT, pack.slug);
    await fs.mkdir(dir, { recursive: true });
    for (const name of await fs.readdir(dir)) {
      await fs.unlink(path.join(dir, name));
    }
    for (const sticker of pack.stickers) {
      console.log(`fetch ${pack.slug}/${sticker.slug} ← ${sticker.fluentPath}`);
      const png = await downloadFluentPng(sticker);
      const staticBuf = await renderStaticWebp(png);
      await assertHasTransparency(`${pack.slug}/${sticker.slug}.webp`, staticBuf);
      await fs.writeFile(path.join(dir, STATIC_ASSET_FILENAME(sticker.slug)), staticBuf);
      written++;
      console.log(
        `wrote ${pack.slug}/${STATIC_ASSET_FILENAME(sticker.slug)} (${staticBuf.length}B sha=${crypto.createHash('sha256').update(staticBuf).digest('hex').slice(0, 12)})`
      );

      if (sticker.animated) {
        const animBuf = await renderAnimatedWebp(png);
        await assertHasTransparency(
          `${pack.slug}/${ANIMATED_ASSET_FILENAME(sticker.slug)}`,
          animBuf
        );
        await fs.writeFile(path.join(dir, ANIMATED_ASSET_FILENAME(sticker.slug)), animBuf);
        written++;
        const pages = (await sharp(animBuf, { animated: true }).metadata()).pages ?? 1;
        console.log(
          `wrote ${pack.slug}/${ANIMATED_ASSET_FILENAME(sticker.slug)} (${animBuf.length}B pages=${pages})`
        );
      }
    }
  }
  const totalStickers = OFFICIAL_PACK_MANIFESTS.reduce((n, p) => n + p.stickers.length, 0);
  console.log(`done: ${written} files / ${totalStickers} stickers under ${ASSETS_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
