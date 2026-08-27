import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import sharp from 'sharp';

const RTPA_ROOT = path.resolve(__dirname, '../../../RTPA');
const REF_ICON = path.resolve(__dirname, '../../Frontend/public/bandeja2-blue-45-icon.png');
const OUT_DIR = path.join(RTPA_ROOT, 'RTPAApp/Assets.xcassets/AppIcon.appiconset');
const OUT_MASTER = path.join(RTPA_ROOT, 'RTPAApp/Resources/rallyvision-logo-master.png');
const BG = { r: 0xb3, g: 0xe1, b: 0xe6 };

const PROMPT = [
  'Edit the reference mascot into a NEW logo composition for RallyVision, a court-vision analysis app.',
  'Keep the same woodcut / linocut black-and-white halftone stipple illustration style, line weight, and tiger stripe energy.',
  'Still feature a bearded athletic man AND a tiger — same characters — but a completely different pose and story.',
  'NEW scene: the tiger stands alert on all fours beside the man (NOT ridden). The shirtless bearded man kneels/crouches, holding a smartphone at eye level like a viewfinder aimed at a small padel ball in flight.',
  'Add sparse geometric vision cues only in the same B&W line style: thin dashed trajectory arc to the ball, tiny corner reticle marks — no UI chrome, no screenshots, no glowing neon, no text.',
  'Square centered app-icon composition with subtle drop shadow behind the figures only.',
  'Output on a perfectly flat solid light cyan background (#B3E1E6). Artwork figures strictly black, white, and gray halftone only.',
  'No text, no logos, no borders, no watermarks, no extra animals.',
].join(' ');

async function fileToDataUri(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extractImageUrl(output: unknown): string | null {
  if (typeof output === 'string' && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
  }
  if (output && typeof output === 'object') {
    const rec = output as Record<string, unknown>;
    for (const key of ['url', 'image', 'output']) {
      const found = extractImageUrl(rec[key]);
      if (found) return found;
    }
  }
  return null;
}

async function waitForPrediction(client: Replicate, predictionId: string): Promise<unknown> {
  for (;;) {
    const prediction = await client.predictions.get(predictionId);
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Prediction ${prediction.status}: ${prediction.error ?? 'unknown'}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function writeAppIcon(png: Buffer): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const filename = 'AppIcon-1024.png';
  await fs.writeFile(path.join(OUT_DIR, filename), png);
  await fs.writeFile(
    path.join(OUT_DIR, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          {
            filename,
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2
    ) + '\n'
  );
}

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');

  await fs.access(REF_ICON);
  const client = new Replicate({ auth: token });
  const referenceUri = await fileToDataUri(REF_ICON);

  console.log('Creating RallyVision logo prediction…');
  const prediction = await client.predictions.create({
    model: 'google/nano-banana-2',
    input: {
      prompt: PROMPT,
      image_input: [referenceUri],
      aspect_ratio: 'match_input_image',
      resolution: '2K',
      output_format: 'png',
      google_search: false,
      image_search: false,
    },
  });

  console.log(`prediction ${prediction.id}`);
  const output = await waitForPrediction(client, prediction.id);
  const imageUrl = extractImageUrl(output);
  if (!imageUrl) throw new Error('No image URL in Replicate output');

  const raw = await downloadUrl(imageUrl);
  const icon = await sharp(raw)
    .resize(1024, 1024, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(OUT_MASTER), { recursive: true });
  await fs.writeFile(OUT_MASTER, icon);
  await writeAppIcon(icon);

  const meta = await sharp(icon).metadata();
  console.log(`Wrote ${OUT_MASTER} and AppIcon (${meta.width}x${meta.height})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
