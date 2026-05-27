export type ResultsPhotoStyleFamily = 'illustration' | 'cinematic';

export type ResultsPhotoStyle = {
  id: string;
  family: ResultsPhotoStyleFamily;
  fantasySetting?: boolean;
  prompt: string;
};

function hashString(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const ILLUSTRATION_STYLES: readonly ResultsPhotoStyle[] = [
  {
    id: 'golden_age_cel',
    family: 'illustration',
    prompt:
      'Hand-painted cel-animation look from the 1950s golden age: soft gouache backgrounds, rounded expressive faces, warm Technicolor palette, delicate ink outlines, storybook charm — not 3D, not live-action.',
  },
  {
    id: 'ghibli_watercolor',
    family: 'illustration',
    prompt:
      'Japanese feature-animation aesthetic: soft watercolor skies, gentle hand-inked linework, lush natural light, warm pastoral mood, subtle paper texture — painterly 2D, not CGI.',
  },
  {
    id: 'pixar_stylized_3d',
    family: 'illustration',
    prompt:
      'Stylized 3D animation still: smooth simplified forms, large expressive eyes, vibrant saturated colors, studio lighting — clearly cartoon CGI, not realistic humans.',
  },
  {
    id: 'classic_cel_cartoon',
    family: 'illustration',
    prompt:
      'Classic 2D cel cartoon: bold black outlines, flat color fills, slight squash-and-stretch energy, simple shapes, Saturday-morning energy — ink and paint, not a photo.',
  },
  {
    id: 'silver_age_comic',
    family: 'illustration',
    prompt:
      'Silver-age comic-book illustration: dynamic poses, ink cross-hatching, halftone ben-day dots, punchy primary colors, heroic celebration framing — graphic novel, not photography.',
  },
  {
    id: 'flat_vector_poster',
    family: 'illustration',
    prompt:
      'Modern flat-vector poster art: geometric simplification, limited harmonious palette, clean shapes, minimal shading, editorial sports-poster composition — vector illustration only.',
  },
  {
    id: 'anime_cel',
    family: 'illustration',
    prompt:
      'Anime cel-shaded group portrait: clean line art, bright highlights, soft gradient skies, sparkles and motion lines, tournament-victory vibe — 2D anime, not photoreal.',
  },
  {
    id: 'claymation',
    family: 'illustration',
    prompt:
      'Stop-motion claymation: visible plasticine texture, soft rounded sculpts, handmade imperfections, warm practical miniature lighting — tactile clay figures, not real people.',
  },
  {
    id: 'ligne_claire',
    family: 'illustration',
    prompt:
      'European ligne claire comic: uniform clear outlines, flat even colors, calm readable faces, simple backgrounds, friendly adventure-comic tone — ink comic, not photo.',
  },
  {
    id: 'art_nouveau_poster',
    family: 'illustration',
    prompt:
      'Art Nouveau celebratory poster: flowing organic curves, decorative floral motifs, elegant flat color, vintage print texture, symmetrical group composition — illustrated poster, not a photograph.',
  },
];

export const CINEMATIC_STYLES: readonly ResultsPhotoStyle[] = [
  {
    id: 'lunar_apollo_victory',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      "Winning team on the Moon's surface, Earth on the horizon, stylized Apollo-era white space suits with open visors showing smiling faces, lunar dust and footprints, heroic group pose, cinematic sci-fi movie still — concept art, not a real photograph.",
  },
  {
    id: 'space_station_viewport',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      'Celebration inside a sleek orbital lounge with a huge viewport showing Earth and stars, soft blue rim lighting, futuristic athletic wear mixed with flight jackets, drifting confetti — high-end sci-fi film still, not cartoon, not documentary.',
  },
  {
    id: 'mars_dome_court',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      'Team celebrating inside a transparent dome stadium on Mars, red desert outside, colonist suits and modern sport accents, warm sunset through the dome — cinematic concept art, not animation.',
  },
  {
    id: 'cyberpunk_neon_night',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      'Rain-slick neon city rooftop at night, magenta and cyan reflections, leather and techwear, holographic trophy glow, dystopian-neon mood without copying named films — stylized cinematic still, not street photography.',
  },
  {
    id: 'retro_80s_synthwave',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      '1980s retro celebration: synthwave sunset, purple-pink sky, chrome accents, tracksuits and sweatbands, VHS-soft grain and lens flare, palm silhouettes — period stylized photo look, not modern phone realism.',
  },
  {
    id: 'retro_70s_kodachrome',
    family: 'cinematic',
    prompt:
      '1970s Kodachrome-inspired team portrait: wood paneling, burnt orange and avocado palette, wide collars, soft film bloom — vintage styled photograph at the venue, not contemporary DSLR.',
  },
  {
    id: 'dieselpunk_factory_arena',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      '1930s–40s dieselpunk victory in a brass-and-steam industrial arena, goggles and leather, sepia-steel color grade, smoke and floodlights — cinematic alternate-history still, not cartoon.',
  },
  {
    id: 'steampunk_victorian_sport',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      'Victorian steampunk courtyard celebration, brass gadgets, waistcoats mixed with athletic gear, cog textures, warm gaslight — painterly cinematic depth, not cel animation.',
  },
  {
    id: 'film_noir_victory',
    family: 'cinematic',
    prompt:
      '1940s film noir victory portrait: high-contrast black and white, venetian-blind shadows, fedoras and long coats, dramatic single key light — styled noir cinema still after the match.',
  },
  {
    id: 'soviet_constructivist_poster',
    family: 'cinematic',
    fantasySetting: true,
    prompt:
      'Soviet space-race constructivist poster aesthetic: bold geometric shapes, limited red cream black palette, heroic upward angles, athletes as monuments — printed poster art with recognizable photographic faces, not Saturday-morning cartoon.',
  },
];

export const RESULTS_PHOTO_STYLES: readonly ResultsPhotoStyle[] = [
  ...ILLUSTRATION_STYLES,
  ...CINEMATIC_STYLES,
];

export function pickResultsPhotoStyle(seed: string): ResultsPhotoStyle {
  const family: ResultsPhotoStyleFamily =
    hashString(seed) % 2 === 0 ? 'illustration' : 'cinematic';
  const pool = family === 'illustration' ? ILLUSTRATION_STYLES : CINEMATIC_STYLES;
  return pool[hashString(`${seed}:style`) % pool.length];
}
