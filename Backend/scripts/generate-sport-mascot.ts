import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import sharp from 'sharp';
import { extractReplicateImageUrl } from '../src/services/replicate/models/extractReplicateImageOutput';

const PUBLIC_DIR = path.resolve(__dirname, '../../Frontend/public');
const BG_RGB = { r: 0xb3, g: 0xe1, b: 0xe6 };
const CHROMA_KEY = { r: 255, g: 0, b: 255 };

type SportSpec = {
  id: string;
  equipment: string;
};

const SPORTS: Record<string, SportSpec> = {
  tennis: {
    id: 'tennis',
    equipment:
      'Replace the padel racket with a classic tennis racket (oval head with tight strings, longer handle). Replace the ball with a fuzzy yellow-green tennis ball with curved seam lines.',
  },
  pickleball: {
    id: 'pickleball',
    equipment:
      'Replace the padel racket with a pickleball paddle (solid flat face with small circular holes, short wide handle). Replace the ball with a perforated plastic pickleball (wiffle ball with round holes).',
  },
  badminton: {
    id: 'badminton',
    equipment:
      'Replace the padel racket with a lightweight badminton racket (thin oval head, fine strings, long slim handle). Replace the ball with a feathered shuttlecock (cork base with feather skirt).',
  },
  'table-tennis': {
    id: 'table-tennis',
    equipment:
      'Replace the padel racket with a table tennis paddle (small solid bat, short handle, smooth rubber face). Replace the ball with a small lightweight ping pong ball.',
  },
  squash: {
    id: 'squash',
    equipment:
      'Replace the padel racket with a squash racket (compact teardrop head with tight strings, longer handle). Replace the ball with a small solid black squash ball.',
  },
};

async function fileToDataUri(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function waitForPrediction(
  client: Replicate,
  predictionId: string,
  pollMs = 3000
): Promise<unknown> {
  for (;;) {
    const prediction = await client.predictions.get(predictionId);
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error ?? 'unknown'}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function buildPrompt(sport: SportSpec, variant: 'horizontal' | 'icon'): string {
  const shared = [
    'Edit the reference mascot logo illustration.',
    'Keep EVERYTHING identical: bearded shirtless man riding a leaping tiger, woodcut halftone stipple black-and-white style, same pose, composition, tiger stripes, tattoos, athletic shorts, line weight, shading dots.',
    sport.equipment,
    'Do not add text, logos, borders, or extra elements.',
  ].join(' ');

  if (variant === 'horizontal') {
    return `${shared} Output on a perfectly flat solid magenta chroma-key background (#FF00FF) only — no gradients, no shadows on background, no checkerboard, no white or gray fill in the background. Horizontal wide layout matching the reference framing. Artwork must stay strictly black, white, and gray halftone only.`;
  }

  return `${shared} Output on a perfectly flat solid light cyan background (#B3E1E6), square centered composition matching the reference icon framing with subtle drop shadow behind the figures only.`;
}

async function alphaTransparentRatio(buf: Buffer): Promise<number> {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent += 1;
  }
  return transparent / (data.length / 4);
}

const CHROMA_TOLERANCE = 62;

function chromaDistance(r: number, g: number, b: number): number {
  const dr = r - CHROMA_KEY.r;
  const dg = g - CHROMA_KEY.g;
  const db = b - CHROMA_KEY.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isFringeChroma(r: number, g: number, b: number): boolean {
  return chromaDistance(r, g, b) <= CHROMA_TOLERANCE + 18;
}

async function chromaKeyHorizontal(
  imageBuffer: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  const { data: rgb, info } = await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: CHROMA_KEY,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixelCount = width * height;

  const out = Buffer.alloc(pixelCount * 4);
  for (let idx = 0; idx < pixelCount; idx += 1) {
    const p = idx * 3;
    const o = idx * 4;
    const r = rgb[p]!;
    const g = rgb[p + 1]!;
    const b = rgb[p + 2]!;
    const remove = isFringeChroma(r, g, b);
    if (remove) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
      continue;
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function countMagentaFringe(buf: Buffer): Promise<number> {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  let magenta = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3]! === 0) continue;
    visible += 1;
    if (isFringeChroma(data[p]!, data[p + 1]!, data[p + 2]!)) magenta += 1;
  }
  return visible === 0 ? 0 : magenta / visible;
}

async function validateHorizontalSolid(buf: Buffer): Promise<{ transparent: number; darkHoles: number }> {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let darkTotal = 0;
  let darkHoles = 0;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    const a = data[p + 3]!;
    if (a === 0) {
      transparent += 1;
      continue;
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 90) {
      darkTotal += 1;
      if (a < 240) darkHoles += 1;
    }
  }
  const total = data.length / 4;
  return {
    transparent: transparent / total,
    darkHoles: darkTotal === 0 ? 0 : darkHoles / darkTotal,
  };
}

async function generateVariant(
  client: Replicate,
  sport: SportSpec,
  variant: 'horizontal' | 'icon',
  referencePath: string,
  targetWidth: number,
  targetHeight: number
): Promise<Buffer> {
  const referenceUri = await fileToDataUri(referencePath);
  const prompt = buildPrompt(sport, variant);

  const prediction = await client.predictions.create({
    model: 'google/nano-banana-2',
    input: {
      prompt,
      image_input: [referenceUri],
      aspect_ratio: 'match_input_image',
      resolution: '2K',
      output_format: 'png',
      google_search: false,
      image_search: false,
    },
  });

  console.log(`[${sport.id}/${variant}] prediction ${prediction.id}`);
  const output = await waitForPrediction(client, prediction.id);
  const imageUrl = extractReplicateImageUrl(output);
  if (!imageUrl) throw new Error(`No image URL in output for ${sport.id}/${variant}`);

  const raw = await downloadUrl(imageUrl);

  if (variant === 'horizontal') {
    const finalized = await chromaKeyHorizontal(raw, targetWidth, targetHeight);
    const stats = await validateHorizontalSolid(finalized);
    console.log(
      `[${sport.id}/horizontal] transparent=${(stats.transparent * 100).toFixed(1)}% dark-holes=${(stats.darkHoles * 100).toFixed(1)}%`
    );
    if (stats.transparent < 0.35) {
      throw new Error('Horizontal chroma key removed too little background (model may have ignored magenta bg)');
    }
    if (stats.darkHoles > 0.05) {
      throw new Error(`Horizontal has ${(stats.darkHoles * 100).toFixed(1)}% transparent holes in dark line art`);
    }
    const fringe = await countMagentaFringe(finalized);
    if (fringe > 0.001) {
      throw new Error(`Horizontal still has ${(fringe * 100).toFixed(2)}% magenta fringe`);
    }
    return finalized;
  }

  return sharp(raw)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      background: BG_RGB,
    })
    .flatten({ background: BG_RGB })
    .png()
    .toBuffer();
}

async function generateSport(client: Replicate, sport: SportSpec, horizontalOnly: boolean): Promise<void> {
  const horizontalRef = path.join(PUBLIC_DIR, 'bandeja2-white-tr.png');
  const iconRef = path.join(PUBLIC_DIR, 'bandeja2-blue-45-icon.png');

  const horizontalOut = path.join(PUBLIC_DIR, `bandeja2-${sport.id}-white-tr.png`);
  const iconOut = path.join(PUBLIC_DIR, `bandeja2-${sport.id}-blue-45-icon.png`);

  console.log(`Generating ${sport.id} mascots${horizontalOnly ? ' (horizontal only)' : ''}…`);

  const horizontalBuf = await generateVariant(client, sport, 'horizontal', horizontalRef, 1080, 675);
  await fs.writeFile(horizontalOut, horizontalBuf);

  if (!horizontalOnly) {
    const iconBuf = await generateVariant(client, sport, 'icon', iconRef, 1024, 1024);
    await fs.writeFile(iconOut, iconBuf);
  }

  const hMeta = await sharp(horizontalOut).metadata();
  const ratio = await alphaTransparentRatio(await fs.readFile(horizontalOut));
  console.log(
    `Wrote ${horizontalOut} (${hMeta.width}x${hMeta.height}, alpha=${hMeta.hasAlpha}, transparent=${(ratio * 100).toFixed(1)}%)`
  );

  if (!horizontalOnly) {
    const iMeta = await sharp(iconOut).metadata();
    console.log(`Wrote ${iconOut} (${iMeta.width}x${iMeta.height})`);
  }
}

async function rekeyExistingHorizontal(sport: SportSpec): Promise<void> {
  const filePath = path.join(PUBLIC_DIR, `bandeja2-${sport.id}-white-tr.png`);
  const raw = await fs.readFile(filePath);
  const flattened = await sharp(raw).flatten({ background: CHROMA_KEY }).removeAlpha().png().toBuffer();
  const finalized = await chromaKeyHorizontal(flattened, 1080, 675);
  await fs.writeFile(filePath, finalized);
  const fringe = await countMagentaFringe(finalized);
  console.log(`Rekeyed ${filePath} magenta-fringe=${(fringe * 100).toFixed(3)}%`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sportKeys = args.filter((a) => !a.startsWith('--'));
  const horizontalOnly = args.includes('--horizontal-only');
  const rekeyOnly = args.includes('--rekey-only');
  const keys = sportKeys.length > 0 ? sportKeys.map((k) => k.toLowerCase()) : ['tennis'];

  if (rekeyOnly) {
    for (const sportKey of keys) {
      const sport = SPORTS[sportKey];
      if (!sport) {
        throw new Error(`Unknown sport "${sportKey}". Known: ${Object.keys(SPORTS).join(', ')}`);
      }
      await rekeyExistingHorizontal(sport);
    }
    return;
  }

  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');

  const client = new Replicate({ auth: token });

  for (const sportKey of keys) {
    const sport = SPORTS[sportKey];
    if (!sport) {
      throw new Error(`Unknown sport "${sportKey}". Known: ${Object.keys(SPORTS).join(', ')}`);
    }
    await generateSport(client, sport, horizontalOnly);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
