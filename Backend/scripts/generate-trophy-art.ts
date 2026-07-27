/**
 * Generate transparent trophy PNGs via Replicate (nano-banana-2 + remove-bg).
 *
 * Usage: cd Backend && npx ts-node --transpile-only scripts/generate-trophy-art.ts
 * Optional: KEYS=podium_gold,habit_first_win …
 */
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import Replicate from 'replicate';
import sharp from 'sharp';
import { extractReplicateImageUrl } from '../src/services/replicate/models/extractReplicateImageOutput';

const OUT_DIR = path.resolve(__dirname, '../../Frontend/public/trophies');
const FINAL_SIZE = 256;
const GEN_MODEL = 'google/nano-banana-2';
/** Community model — must use version hash (not owner/name predictions endpoint). */
const REMOVE_BG_VERSION =
  'b29c606557a1f9060e4f2af49f3670895b2879e9c7e77fbbbfcd47cb2341adfb'; // recraft-ai/recraft-remove-background

const STYLE = [
  'Premium mobile-game achievement icon, soft stylized 3D render,',
  'polished PBR materials, gentle studio rim light, crisp silhouette,',
  'single centered object filling ~80% of frame, no ground plane,',
  'no shadow cast on background, pure flat solid #00FF00 chroma-key background,',
  'no text unless specified, no watermark, no UI chrome, no border, no frame.',
].join(' ');

type Spec = { key: string; prompt: string };

const SPECS: Spec[] = [
  {
    key: 'podium_gold',
    prompt: `${STYLE} Ornate championship cup trophy in rich polished gold metal with subtle padel-ball engraving on the cup body, twin elegant handles, dark walnut pedestal base with thin gold trim. Legendary prestige.`,
  },
  {
    key: 'podium_silver',
    prompt: `${STYLE} Sleek championship cup trophy in bright polished silver / platinum metal, twin handles, dark pedestal base with silver trim. Clean modern athletic award.`,
  },
  {
    key: 'podium_bronze',
    prompt: `${STYLE} Championship cup trophy in warm polished bronze metal, twin handles, dark pedestal base with bronze trim. Athletic third-place award.`,
  },
  {
    key: 'habit_first_win',
    prompt: `${STYLE} Round victory medal hanging from a short folded ribbon (deep emerald green), polished gold face with a subtle embossed padel racket and ball motif, beveled rim. First-win celebration medal.`,
  },
  {
    key: 'habit_first_padel_game',
    prompt: `${STYLE} Premium stylized padel racket (perforated face, teal and white accents) with a bright yellow-green padel ball floating beside it, soft studio rim light, clean silhouette, no text. Debut / first-game played emblem.`,
  },
  {
    key: 'habit_wins_10',
    prompt: `${STYLE} Circular victory medallion in brushed bronze with teal ribbon loop, bold high-contrast white numerals "10" centered on dark face, clean sans-serif, clearly readable. Win milestone medal.`,
  },
  {
    key: 'habit_wins_25',
    prompt: `${STYLE} Circular victory medallion in brushed copper-bronze with teal ribbon loop, bold high-contrast white numerals "25" centered on dark face, clean sans-serif, clearly readable. Win milestone medal.`,
  },
  {
    key: 'habit_wins_50',
    prompt: `${STYLE} Circular victory medallion in polished silver with emerald ribbon, bold high-contrast white numerals "50" centered on dark face, clean sans-serif, clearly readable. Rare win milestone medal.`,
  },
  {
    key: 'habit_wins_100',
    prompt: `${STYLE} Circular victory medallion in bright platinum-silver with deep emerald ribbon, bold high-contrast white numerals "100" centered on dark face, clean sans-serif, clearly readable. Rare win milestone medal.`,
  },
  {
    key: 'habit_wins_500',
    prompt: `${STYLE} Ornate legendary victory medallion in rich polished gold with emerald ribbon and subtle laurel motif, bold high-contrast white numerals "500" centered on dark face, clean sans-serif, clearly readable. Legendary win milestone medal.`,
  },
  {
    key: 'habit_games_10',
    prompt: `${STYLE} Hexagonal metal achievement badge in brushed bronze, beveled edges, soft teal enamel inset, embossed bold numerals "10" centered in clean sans-serif. Volume milestone badge.`,
  },
  {
    key: 'habit_games_50',
    prompt: `${STYLE} Hexagonal metal achievement badge in brushed silver, beveled edges, soft teal enamel inset, embossed bold numerals "50" centered in clean sans-serif. Volume milestone badge.`,
  },
  {
    key: 'habit_games_100',
    prompt: `${STYLE} Hexagonal metal achievement badge in polished gold, beveled edges, deep teal enamel inset, embossed bold numerals "100" centered in clean sans-serif. Prestige volume milestone badge.`,
  },
  {
    key: 'habit_games_500',
    prompt: `${STYLE} Ornate hexagonal metal achievement badge in bright polished platinum-silver with violet enamel inset, embossed bold high-contrast numerals "500" in white or gold, clean sans-serif, clearly readable. Rare volume milestone.`,
  },
  {
    key: 'habit_games_1000',
    prompt: `${STYLE} Legendary hexagonal crest badge in rich polished gold with deep emerald enamel, ornate beveled rim, embossed bold high-contrast numerals "1000" in bright gold on dark enamel, clean sans-serif, clearly readable. Ultimate volume milestone.`,
  },
  {
    key: 'habit_streak_4',
    prompt: `${STYLE} Compact stylized flame icon in warm orange and amber glass-like material with soft inner glow. At the base, a small dark circular badge with a LARGE bright white glowing numeral "4" — high contrast, bold rounded sans-serif, clearly readable, not embossed into dark metal. Weekly streak emblem.`,
  },
  {
    key: 'habit_streak_8',
    prompt: `${STYLE} Tall stylized twin-flame icon in vivid orange-red and gold glass-like material with strong inner glow. At the base, a small dark circular badge with a LARGE bright white glowing numeral "8" — high contrast, bold rounded sans-serif, clearly readable, not embossed into dark metal. Rare streak emblem.`,
  },
  {
    key: 'habit_streak_12',
    prompt: `${STYLE} Intense triple-flame icon in hot magenta-orange and gold glass-like material with bright inner glow and subtle sparks. At the base, a small dark circular badge with LARGE bright white glowing numerals "12" — high contrast, bold rounded sans-serif, clearly readable, not embossed into dark metal. Elite streak emblem.`,
  },
  {
    key: 'habit_streak_16',
    prompt: `${STYLE} Powerful multi-peak flame icon in deep crimson and gold glass-like material with strong inner glow. At the base, a dark circular badge with LARGE bright white glowing numerals "16" — high contrast, bold rounded sans-serif, clearly readable. Rare long streak emblem.`,
  },
  {
    key: 'habit_streak_32',
    prompt: `${STYLE} Towering multi-layer flame icon in electric orange, gold, and violet glass-like material with intense glow and embers. At the base, a dark circular badge with LARGE bright white glowing numerals "32" — high contrast, bold rounded sans-serif, clearly readable. Rare half-year streak emblem.`,
  },
  {
    key: 'habit_streak_64',
    prompt: `${STYLE} Legendary inferno flame icon in white-hot gold core with magenta and deep red outer flames, sparks and energy. At the base, a dark circular badge with LARGE bright white glowing numerals "64" — high contrast, bold rounded sans-serif, clearly readable. Legendary year-long streak emblem.`,
  },
  {
    key: 'habit_org_game_1',
    prompt: `${STYLE} Rally Starter emblem: stylized padel racket leaning on a clipboard with a whistle, teal accents, dark badge with bright white numeral "1". Game organizer debut icon.`,
  },
  {
    key: 'habit_org_game_10',
    prompt: `${STYLE} Rally Starter emblem: padel racket and clipboard organizer icon, bronze metal, dark badge with bright white numerals "10".`,
  },
  {
    key: 'habit_org_game_25',
    prompt: `${STYLE} Rally Starter emblem: padel racket and clipboard organizer icon, copper metal, dark badge with bright white numerals "25".`,
  },
  {
    key: 'habit_org_game_50',
    prompt: `${STYLE} Rally Starter emblem: padel racket and clipboard organizer icon, polished silver, dark badge with bright white numerals "50". Rare.`,
  },
  {
    key: 'habit_org_game_100',
    prompt: `${STYLE} Rally Starter emblem: padel racket and clipboard organizer icon, platinum-silver with teal enamel, dark badge with bright white numerals "100". Rare.`,
  },
  {
    key: 'habit_org_game_500',
    prompt: `${STYLE} Legendary Rally Starter crest: ornate gold padel racket and clipboard, emerald accents, dark badge with bright white numerals "500".`,
  },
  {
    key: 'habit_org_tournament_1',
    prompt: `${STYLE} Tournament organizer medallion: miniature bracket trophy with padel ball, bronze, dark badge bright white "1".`,
  },
  {
    key: 'habit_org_tournament_5',
    prompt: `${STYLE} Tournament organizer medallion: miniature bracket trophy with padel ball, copper, dark badge bright white "5".`,
  },
  {
    key: 'habit_org_tournament_10',
    prompt: `${STYLE} Tournament organizer medallion: miniature bracket trophy with padel ball, silver, dark badge bright white "10".`,
  },
  {
    key: 'habit_org_tournament_25',
    prompt: `${STYLE} Rare tournament organizer medallion: silver-gold bracket trophy, dark badge bright white "25".`,
  },
  {
    key: 'habit_org_tournament_50',
    prompt: `${STYLE} Rare tournament organizer medallion: platinum bracket trophy, dark badge bright white "50".`,
  },
  {
    key: 'habit_org_tournament_100',
    prompt: `${STYLE} Legendary tournament organizer crest: ornate gold bracket trophy with padel motif, dark badge bright white "100".`,
  },
  {
    key: 'habit_org_bar_1',
    prompt: `${STYLE} Soul of the Party emblem: festive cocktail glass with soft neon glow and confetti spark, warm social vibe, dark badge bright white "1". No sport logos.`,
  },
  {
    key: 'habit_org_bar_5',
    prompt: `${STYLE} Soul of the Party emblem: festive cocktail glass with neon glow, dark badge bright white "5".`,
  },
  {
    key: 'habit_org_bar_10',
    prompt: `${STYLE} Soul of the Party emblem: festive cocktail glass with neon glow, dark badge bright white "10".`,
  },
  {
    key: 'habit_org_bar_25',
    prompt: `${STYLE} Rare Soul of the Party emblem: stylish cocktail and disco sparkles, silver neon, dark badge bright white "25".`,
  },
  {
    key: 'habit_org_bar_50',
    prompt: `${STYLE} Rare Soul of the Party emblem: premium cocktail icon with violet neon, dark badge bright white "50".`,
  },
  {
    key: 'habit_org_bar_100',
    prompt: `${STYLE} Legendary Soul of the Party crest: ornate gold cocktail glass with radiant neon party energy, dark badge bright white "100".`,
  },
  {
    key: 'habit_giant_killer_1',
    prompt: `${STYLE} Giant Killer emblem: small padel warrior toppling a taller giant silhouette, slingshot vibe, bronze, dark badge bright white "1".`,
  },
  {
    key: 'habit_giant_killer_5',
    prompt: `${STYLE} Giant Killer emblem: underdog padel player vs giant figure, copper metal, dark badge bright white "5".`,
  },
  {
    key: 'habit_giant_killer_10',
    prompt: `${STYLE} Rare Giant Killer emblem: silver underdog defeating giant, lightning crack, dark badge bright white "10".`,
  },
  {
    key: 'habit_giant_killer_25',
    prompt: `${STYLE} Rare Giant Killer emblem: platinum underdog vs colossus, dark badge bright white "25".`,
  },
  {
    key: 'habit_giant_killer_50',
    prompt: `${STYLE} Legendary Giant Killer crest: ornate gold giant-slayer with padel racket, emerald accents, dark badge bright white "50".`,
  },
  {
    key: 'habit_dynamic_duo_10',
    prompt: `${STYLE} Dynamic Duo emblem: two interlocking padel rackets forming a heart-pair bond, bronze, dark badge bright white "10".`,
  },
  {
    key: 'habit_dynamic_duo_50',
    prompt: `${STYLE} Rare Dynamic Duo emblem: twin padel rackets bonded with silver ribbon, dark badge bright white "50".`,
  },
  {
    key: 'habit_dynamic_duo_100',
    prompt: `${STYLE} Legendary Dynamic Duo crest: ornate gold twin rackets with emerald partnership gem, dark badge bright white "100".`,
  },
  {
    key: 'habit_open_court_10',
    prompt: `${STYLE} Open Court emblem: padel court gate opening with many small partner silhouettes, bronze, dark badge bright white "10".`,
  },
  {
    key: 'habit_open_court_25',
    prompt: `${STYLE} Open Court emblem: open padel court with partner network nodes, copper, dark badge bright white "25".`,
  },
  {
    key: 'habit_open_court_50',
    prompt: `${STYLE} Rare Open Court emblem: silver open court with constellation of partners, dark badge bright white "50".`,
  },
  {
    key: 'habit_open_court_100',
    prompt: `${STYLE} Rare Open Court emblem: platinum open court social network motif, dark badge bright white "100".`,
  },
  {
    key: 'habit_open_court_250',
    prompt: `${STYLE} Legendary Open Court crest: ornate gold open padel court with radiant partner constellation, dark badge bright white "250".`,
  },
];

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function waitForPrediction(
  client: Replicate,
  predictionId: string,
  pollMs = 2500,
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

async function runOfficial(
  client: Replicate,
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const created = await client.predictions.create({ model, input });
  const output = await waitForPrediction(client, created.id);
  const url = extractReplicateImageUrl(output);
  if (!url) throw new Error(`No image URL from ${model}: ${JSON.stringify(output)}`);
  return url;
}

async function runVersioned(
  client: Replicate,
  version: string,
  input: Record<string, unknown>,
): Promise<string> {
  const created = await client.predictions.create({ version, input });
  const output = await waitForPrediction(client, created.id);
  const url = extractReplicateImageUrl(output);
  if (!url) throw new Error(`No image URL from version ${version}: ${JSON.stringify(output)}`);
  return url;
}

async function trimAndResize(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .trim({ threshold: 12 })
    .resize(FINAL_SIZE, FINAL_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generateOne(client: Replicate, spec: Spec): Promise<void> {
  const outPath = path.join(OUT_DIR, `${spec.key}.png`);
  try {
    await fs.access(outPath);
    console.log(`[skip] ${spec.key} already exists`);
    return;
  } catch {
    /* generate */
  }

  console.log(`[gen] ${spec.key}…`);
  const genUrl = await runOfficial(client, GEN_MODEL, {
    prompt: spec.prompt,
    aspect_ratio: '1:1',
    resolution: '1K',
    output_format: 'png',
    google_search: false,
    image_search: false,
  });
  console.log(`[bg]  ${spec.key}…`);
  const cutUrl = await runVersioned(client, REMOVE_BG_VERSION, { image: genUrl });
  const raw = await downloadUrl(cutUrl);
  const finalBuf = await trimAndResize(raw);
  await fs.writeFile(outPath, finalBuf);
  console.log(`[ok]  ${spec.key} → ${outPath} (${finalBuf.length} bytes)`);
}

async function main(): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');

  await fs.mkdir(OUT_DIR, { recursive: true });

  const filter = (process.env.KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const specs = filter.length
    ? SPECS.filter((s) => filter.includes(s.key))
    : SPECS;
  if (!specs.length) throw new Error('No matching KEYS');

  const client = new Replicate({ auth: token });
  const concurrency = 2;
  for (let i = 0; i < specs.length; i += concurrency) {
    const batch = specs.slice(i, i + concurrency);
    await Promise.all(batch.map((s) => generateOne(client, s)));
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
