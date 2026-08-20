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
  {
    key: 'habit_tie_break_1',
    prompt: `${STYLE} Tie-Breaker emblem: taut net with a golden 7-6 scoreboard tile, bronze metal, lightning crack, dark badge bright white "1".`,
  },
  {
    key: 'habit_tie_break_5',
    prompt: `${STYLE} Sudden Death emblem: coiled spring and racket under a deuce scoreboard, copper metal, dark badge bright white "5".`,
  },
  {
    key: 'habit_tie_break_12',
    prompt: `${STYLE} Rare 7-6 Club emblem: silver club crest with classic 7-6 set score and tiny crown, dark badge bright white "12".`,
  },
  {
    key: 'habit_tie_break_32',
    prompt: `${STYLE} Rare Nerve of Steel emblem: platinum steel-wire racket with ice-blue glow, dark badge bright white "32".`,
  },
  {
    key: 'habit_tie_break_64',
    prompt: `${STYLE} Legendary Lottery Legend crest: ornate gold lottery-ball fused with 7-6 scoreboard, emerald and magenta sparks, dark badge bright white "64".`,
  },
  {
    key: 'habit_bug_shipped_1',
    prompt: `${STYLE} Common Bug tracker shipped emblem: brushed bronze circular badge, stylized cute ladybug with tiny wrench and soft teal checkmark, dark circular badge at base with LARGE bright white numeral "1", high contrast.`,
  },
  {
    key: 'habit_bug_shipped_5',
    prompt: `${STYLE} Common Bug tracker Patch Notes emblem: copper circular badge, ladybug with notepad and wrench, teal enamel, dark badge LARGE bright white numeral "5".`,
  },
  {
    key: 'habit_bug_shipped_10',
    prompt: `${STYLE} Rare Bug tracker Fix Factory emblem: polished silver badge, ladybug on conveyor of glowing green checkmarks, dark badge LARGE bright white numeral "10".`,
  },
  {
    key: 'habit_bug_shipped_25',
    prompt: `${STYLE} Rare Bug Wrangler emblem: platinum badge, heroic ladybug lassoing a glowing bug glyph, ice-blue accents, dark badge LARGE bright white numeral "25".`,
  },
  {
    key: 'habit_bug_shipped_50',
    prompt: `${STYLE} Legendary Release Legend crest: ornate gold badge, crowned ladybug with emerald checkmark and release rocket motif, dark badge LARGE bright white numeral "50".`,
  },
];

const LETO_REF = path.resolve(__dirname, '../../Frontend/public/bandeja2-white-tr.png');

const LETO_STYLE = [
  'Premium mobile-game achievement emblem, high-contrast linocut / woodcut illustration style matching the reference mascot exactly:',
  'black linework, white fills, dense stipple shading, monochrome B&W only for figures,',
  'bearded athletic man on leaping tiger hitting a padel bandeja overhead (padel racket with holes, not tennis strings),',
  'same energy and silhouette language as the reference image, reimagined as a circular medal / badge icon,',
  'single centered emblem filling ~80% of frame, pure flat solid #00FF00 chroma-key background,',
  'no multi-panel story, no text unless specified, no watermark, no UI chrome, no border frame around the full canvas.',
].join(' ');

const LETO_SPECS: Spec[] = [
  {
    key: 'leto_2026_participant',
    prompt: `${LETO_STYLE} Circulo bronze participation medal of the tiger-rider bandeja mascot, subtle "L26" monogram on a small bronze rim badge, humble common-tier metal rim, brush bronze edges.`,
  },
  {
    key: 'leto_2026_playoffs',
    prompt: `${LETO_STYLE} Playoff medal: tiger-rider bandeja mascot over a bracket / chevron motif, polished steel rim, small dark badge with bright white "PO", competitive escalation.`,
  },
  {
    key: 'leto_2026_place4',
    prompt: `${LETO_STYLE} Fourth-place medal: tiger-rider bandeja mascot with four-point star motif, warm copper-bronze rim, small dark badge with bold bright white numeral "4".`,
  },
  {
    key: 'leto_2026_bronze',
    prompt: `${LETO_STYLE} Bronze podium medal: tiger-rider bandeja mascot with bronze laurel leaves, polished warm bronze metal rim and ribbon loop, dark badge bright white "3", third-place prestige.`,
  },
  {
    key: 'leto_2026_silver',
    prompt: `${LETO_STYLE} Silver podium medal: tiger-rider bandeja mascot with silver laurel and platinum sheen rim, dark badge bright white "2", runner-up prestige.`,
  },
  {
    key: 'leto_2026_gold',
    prompt: `${LETO_STYLE} Legendary gold championship medal: tiger-rider bandeja mascot with rich polished gold rim, gold laurel and mini crown accents, dark badge bright white "1", champion glory.`,
  },
];

const ALL_SPECS: Spec[] = [...SPECS, ...LETO_SPECS];
const LETO_KEYS = new Set(LETO_SPECS.map((s) => s.key));

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
  const input: Record<string, unknown> = {
    prompt: spec.prompt,
    aspect_ratio: '1:1',
    resolution: '1K',
    output_format: 'png',
    google_search: false,
    image_search: false,
  };

  if (LETO_KEYS.has(spec.key)) {
    const ref = await fs.readFile(LETO_REF);
    const b64 = ref.toString('base64');
    input.image_input = [`data:image/png;base64,${b64}`];
  }

  const genUrl = await runOfficial(client, GEN_MODEL, input);
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
    ? ALL_SPECS.filter((s) => filter.includes(s.key))
    : ALL_SPECS;
  if (!specs.length) throw new Error('No matching KEYS');

  const client = new Replicate({ auth: token });
  // Low Replicate credit accounts throttle hard (≈6/min, burst 1) — one at a time + pause.
  const pauseMs = Number(process.env.PAUSE_MS ?? 12_000);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    await generateOne(client, spec);
    if (i < specs.length - 1 && pauseMs > 0) {
      console.log(`[wait] ${pauseMs}ms…`);
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
