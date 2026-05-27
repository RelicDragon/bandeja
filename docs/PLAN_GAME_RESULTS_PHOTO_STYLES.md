# Plan: Randomized stylized Replicate results photos (20 styles)

## Orchestration status

| Step | Owner | Status |
|------|-------|--------|
| 1. `photoStyles.ts` (20 styles + picker) | Backend | done |
| 2. `photoContext.ts` (scene/guardrails/prompt) | Backend | done |
| 3. `photo.provider.ts` (seed, logging) | Backend | done |
| 4. Unit tests (`photoStyles`, `photoContext`) | QA | done |
| 5. `package.json` test script wire-up | QA | done |
| 6. UI i18n (“AI team image”) | Frontend | done |
| 7. Cross-link `PLAN_GAME_RESULTS_ARTIFACTS.md` | Docs | done |
| **Global** | Orchestrator | done |

---

## Problem

Post-game AI photos currently ask FLUX.2 max for a **photorealistic** group shot (`gameResultsArtifact.photoContext.ts`). Product goal: **one of 20 stylized directions** per generation (10 illustration / cartoon + 10 cinematic sci‑fi / retro / scenario), chosen at random (stable per job attempt), while still using participant avatar `input_images` for likeness.

---

## Current behavior

| Piece | Location |
|-------|----------|
| Prompt builder | `Backend/src/services/gameResultsArtifact/gameResultsArtifact.photoContext.ts` → `buildResultsPhotoPrompt` |
| Replicate call | `Backend/src/services/gameResultsArtifact/providers/photo.provider.ts` → `PhotoProvider.buildFluxInput` |
| Model | `REPLICATE_MODEL` (default `black-forest-labs/flux-2-max`) via `replicateImage.service.ts` |

Current closing line (to remove):

```
Natural smiles, casual sportswear, warm daylight, photorealistic, not staged.
```

---

## Target architecture

### Style families

| Family | `family` | Look | Examples |
|--------|----------|------|----------|
| **Illustration** | `illustration` | Cartoon, cel, comic, vector, clay | Golden-age cel, anime, ligne claire |
| **Cinematic** | `cinematic` | Movie still, concept art, retro photo grade, sci‑fi sets | Moon spacesuits, cyberpunk, 80s synthwave |

Not “animated franchise” — cinematic entries are **stylized live-action / poster / concept-art**, not cel TV cartoon.

### Style type

```ts
type ResultsPhotoStyleFamily = 'illustration' | 'cinematic';

type ResultsPhotoStyle = {
  id: string;
  family: ResultsPhotoStyleFamily;
  /** When true, scene opener omits venue; style fragment owns the setting */
  fantasySetting?: boolean;
  prompt: string;
};
```

### Prompt layers

| Layer | Role | Stable per job? |
|-------|------|-----------------|
| **Scene** | Sport, winners; venue only if `!fantasySetting` | Yes (from game + style) |
| **Style** | One of 20 directions | Pick once per photo attempt |
| **Guardrails** | Family-specific anti-photo + avatar contract | By `style.family` |
| **Reference contract** | How to use `input_images` | Embedded in guardrails |

### New files / changes

| File | Change |
|------|--------|
| `gameResultsArtifact.photoStyles.ts` | **New** — 20 styles + `pickResultsPhotoStyle(seed)` |
| `gameResultsArtifact.photoContext.ts` | `buildResultsPhotoPrompt(game, style)`; family guardrails + scene |
| `providers/photo.provider.ts` | Seed from `gameId:generationVersion`, pick style, log `styleId` + `family` |
| `gameResultsArtifact.photoContext.test.ts` | No `photorealistic`; 20 unique ids; deterministic picker |
| `PLAN_GAME_RESULTS_ARTIFACTS.md` | Optional cross-link in Phase 4 |

### Style selection (random but stable on retry)

**Option A — single pool (simplest):**

```ts
pickResultsPhotoStyle(`${gameId}:${generationVersion}`) // index % 20
```

**Option B — family first (recommended):** 50/50 illustration vs cinematic, then uniform random within family. Guarantees mix; avoids ~5% per style in a flat pool.

```ts
const family = hash(seed) % 2 === 0 ? 'illustration' : 'cinematic';
const pool = family === 'illustration' ? ILLUSTRATION_STYLES : CINEMATIC_STYLES;
return pool[hash(seed + ':style') % pool.length];
```

- Hash seed → stable on retry before `replicatePredictionId` is saved.
- `generationVersion` bump → new style (intentional variety).

Optional later: `photoStyleId` on `GameResultsArtifactJob` for support/debug.

---

## Shared prompt blocks

### Scene opener

**Game venue** (`fantasySetting` false / undefined):

```
Celebratory group portrait after a {sportLabel} game at {venue} ({gameTitle}).
{winnerLine}
```

**Fantasy / scenario** (`fantasySetting: true`) — do not anchor on club/court (conflicts with Moon, space station, etc.):

```
Celebratory group portrait after a {sportLabel} match.
{winnerLine}
```

Optional soft nod (one phrase max): `Celebrating a win they earned at {venue}.`

`winnerLine` unchanged: named winners, or generic friendly group line.

### Guardrails — illustration family

Append after the style fragment:

```
Stylized illustrated group portrait celebrating after the match — not a photograph.
No photorealism, no DSLR or phone-camera look, no film grain, no realistic skin pores.
Use the attached portrait references for each person's face, hair, and skin tone;
render everyone in the same illustration style.
Cheerful mood, casual sportswear appropriate for {sportLabel}.
No text overlays, no logos, no watermarks, no copyrighted characters.
```

If outputs stay too realistic:

```
Stylize reference faces heavily; do not copy photo lighting or skin texture from references.
```

### Guardrails — cinematic family

Append after the style fragment (replaces illustration block — do not stack both):

```
Stylized cinematic concept-art group portrait — dramatized movie-poster energy, not documentary sports photography.
Not a candid phone photo from a real padel court, not stock-photo realism, not news photography.
Keep each person's face recognizable from the attached portrait references (likeness, hair, skin tone).
Costumes and environment may be sci-fi, retro, or historical; faces stay consistent with references.
Outfits may be spacesuits, retro fashion, or sci-fi gear; open visors or no helmets when suits are used.
No text overlays, no logos, no watermarks, no copyrighted characters or franchise names.
```

If faces paste too literally from refs:

```
Stylize the world and lighting heavily; do not paste reference photo backgrounds or camera noise onto faces.
```

### Remove (all styles)

- `photorealistic`, `warm daylight`, `Candid group photo`, `not staged`

### Prompt trademarks

Describe aesthetics only in Replicate strings: use “Apollo-era”, “synthwave”, “constructivist” — avoid “NASA”, “Star Wars”, “Ghibli”, “Blade Runner” as sole anchors.

---

## Illustration styles (10)

Use **visual description** in the Replicate prompt. `id` is for code/logs.

| `id` | Direction | Prompt fragment |
|------|-----------|-----------------|
| `golden_age_cel` | 1950s hand-painted animation | Hand-painted cel-animation look from the 1950s golden age: soft gouache backgrounds, rounded expressive faces, warm Technicolor palette, delicate ink outlines, storybook charm — not 3D, not live-action. |
| `ghibli_watercolor` | Ghibli-adjacent | Japanese feature-animation aesthetic: soft watercolor skies, gentle hand-inked linework, lush natural light, warm pastoral mood, subtle paper texture — painterly 2D, not CGI. |
| `pixar_stylized_3d` | Stylized 3D cartoon | Stylized 3D animation still: smooth simplified forms, large expressive eyes, vibrant saturated colors, studio lighting — clearly cartoon CGI, not realistic humans. |
| `classic_cel_cartoon` | Classic TV cel | Classic 2D cel cartoon: bold black outlines, flat color fills, slight squash-and-stretch energy, simple shapes, Saturday-morning energy — ink and paint, not a photo. |
| `silver_age_comic` | Comic book | Silver-age comic-book illustration: dynamic poses, ink cross-hatching, halftone ben-day dots, punchy primary colors, heroic celebration framing — graphic novel, not photography. |
| `flat_vector_poster` | Flat vector | Modern flat-vector poster art: geometric simplification, limited harmonious palette, clean shapes, minimal shading, editorial sports-poster composition — vector illustration only. |
| `anime_cel` | Anime | Anime cel-shaded group portrait: clean line art, bright highlights, soft gradient skies, sparkles and motion lines, tournament-victory vibe — 2D anime, not photoreal. |
| `claymation` | Stop-motion clay | Stop-motion claymation: visible plasticine texture, soft rounded sculpts, handmade imperfections, warm practical miniature lighting — tactile clay figures, not real people. |
| `ligne_claire` | European comic | European ligne claire comic: uniform clear outlines, flat even colors, calm readable faces, simple backgrounds, friendly adventure-comic tone — ink comic, not photo. |
| `art_nouveau_poster` | Art Nouveau poster | Art Nouveau celebratory poster: flowing organic curves, decorative floral motifs, elegant flat color, vintage print texture, symmetrical group composition — illustrated poster, not a photograph. |

---

## Cinematic / scenario styles (10)

**Non-animated** in the sense of no cel/cartoon — still stylized, not documentary padel photography. Most use `fantasySetting: true`.

| `id` | `fantasySetting` | Direction | Prompt fragment |
|------|------------------|-----------|-----------------|
| `lunar_apollo_victory` | yes | Moon, spacesuits | Winning team on the Moon's surface, Earth on the horizon, stylized Apollo-era white space suits with **open visors** showing smiling faces, lunar dust and footprints, heroic group pose, cinematic sci-fi movie still — concept art, not a real photograph. |
| `space_station_viewport` | yes | Orbital sci-fi | Celebration inside a sleek orbital lounge with a huge viewport showing Earth and stars, soft blue rim lighting, futuristic athletic wear mixed with flight jackets, drifting confetti — high-end sci-fi film still, not cartoon, not documentary. |
| `mars_dome_court` | yes | Mars colony | Team celebrating inside a transparent dome stadium on Mars, red desert outside, colonist suits and modern sport accents, warm sunset through the dome — cinematic concept art, not animation. |
| `cyberpunk_neon_night` | yes | Cyberpunk | Rain-slick neon city rooftop at night, magenta and cyan reflections, leather and techwear, holographic trophy glow, dystopian-neon **mood** without copying named films — stylized cinematic still, not street photography. |
| `retro_80s_synthwave` | yes | 80s retro | 1980s retro celebration: synthwave sunset, purple-pink sky, chrome accents, tracksuits and sweatbands, VHS-soft grain and lens flare, palm silhouettes — period stylized photo look, not modern phone realism. |
| `retro_70s_kodachrome` | no | 70s warm retro | 1970s Kodachrome-inspired team portrait: wood paneling, burnt orange and avocado palette, wide collars, soft film bloom — vintage **styled** photograph at {venue}, not contemporary DSLR. |
| `dieselpunk_factory_arena` | yes | Dieselpunk | 1930s–40s dieselpunk victory in a brass-and-steam industrial arena, goggles and leather, sepia-steel color grade, smoke and floodlights — cinematic alternate-history still, not cartoon. |
| `steampunk_victorian_sport` | yes | Steampunk | Victorian steampunk courtyard celebration, brass gadgets, waistcoats mixed with athletic gear, cog textures, warm gaslight — painterly cinematic depth, not cel animation. |
| `film_noir_victory` | no | Film noir | 1940s film noir victory portrait: high-contrast black and white, venetian-blind shadows, fedoras and long coats, dramatic single key light — styled noir cinema still after the match. |
| `soviet_constructivist_poster` | yes | Propaganda poster | Soviet space-race constructivist poster aesthetic: bold geometric shapes, limited red cream black palette, heroic upward angles, athletes as monuments — printed poster art with recognizable photographic faces, not Saturday-morning cartoon. |

**Moon / spacesuits:** Always **open visors** or no helmets so FLUX can use avatar `input_images` for likeness.

---

## Skipped styles (both families)

| Skip | Reason |
|------|--------|
| Pixel art / heavy abstraction | Fights `input_images` for likeness |
| Pure photoreal padel court | Defeats product goal |
| Licensed universes (Marvel, Mandalorian, etc.) | Filters + legal risk |
| Horror / disaster sci-fi | Wrong post-match tone |

---

## Example prompts

### Illustration (`golden_age_cel`)

```
Celebratory group portrait after a Padel game at Padel Club (Friday ladder).
Celebrate the winners: Alex K.
Hand-painted cel-animation look from the 1950s golden age: soft gouache backgrounds,
rounded expressive faces, warm Technicolor palette, delicate ink outlines, storybook charm —
not 3D, not live-action.
Stylized illustrated group portrait celebrating after the match — not a photograph.
No photorealism, no DSLR or phone-camera look, no film grain, no realistic skin pores.
Use the attached portrait references for each person's face, hair, and skin tone;
render everyone in the same illustration style.
Cheerful mood, casual sportswear appropriate for padel.
No text overlays, no logos, no watermarks, no copyrighted characters.
```

### Cinematic (`lunar_apollo_victory`)

```
Celebratory group portrait after a Padel match.
Celebrate the winners: Alex K.
Winning team on the Moon's surface, Earth on the horizon, stylized Apollo-era white space suits with open visors showing smiling faces, lunar dust and footprints, heroic group pose, cinematic sci-fi movie still — concept art, not a real photograph.
Stylized cinematic concept-art group portrait — dramatized movie-poster energy, not documentary sports photography.
Keep each person's face recognizable from the attached portrait references.
Outfits may be spacesuits, retro fashion, or sci-fi gear; open visors or no helmets when suits are used.
No text overlays, no logos, no watermarks, no copyrighted characters or franchise names.
```

---

## Implementation sketch

```ts
// gameResultsArtifact.photoStyles.ts
export const ILLUSTRATION_STYLES: readonly ResultsPhotoStyle[] = [ /* 10 */ ];
export const CINEMATIC_STYLES: readonly ResultsPhotoStyle[] = [ /* 10 */ ];
export const RESULTS_PHOTO_STYLES = [...ILLUSTRATION_STYLES, ...CINEMATIC_STYLES];

export function pickResultsPhotoStyle(seed: string): ResultsPhotoStyle;

// gameResultsArtifact.photoContext.ts
export function buildResultsPhotoScene(
  game: GamePhotoArtifactContext,
  style: ResultsPhotoStyle
): string;

export function buildResultsPhotoGuardrails(
  style: ResultsPhotoStyle,
  sportLabel: string
): string;

export function buildResultsPhotoPrompt(
  game: GamePhotoArtifactContext,
  style: ResultsPhotoStyle
): string;
```

---

## FLUX + `input_images` caveats

- Avatar data URIs bias toward realistic faces (especially cinematic family).
- **Illustration:** anti-DSLR + “same illustration style for everyone”.
- **Cinematic:** anti-documentary + “recognizable faces” + open visors for suits.
- Fewer avatars → more style freedom, less likeness.
- No negative-prompt field on current `Flux2MaxInput`; guards live in the positive prompt.

---

## Observability & product

- Log `styleId` and `family` in `logResultsArtifact` for the photo step.
- UI copy: “AI team image” / “AI illustrated image” — not “photo” when style is non-documentary.
- Prompts describe aesthetics only.

---

## Tests

1. `buildResultsPhotoPrompt` includes winners; does **not** match `/photorealistic/i`.
2. `pickResultsPhotoStyle` deterministic for fixed seed.
3. **20** unique `id` values across `RESULTS_PHOTO_STYLES`.
4. `lunar_apollo_victory` scene does not require club name when `fantasySetting`.
5. Illustration prompt includes sportswear line; cinematic lunar prompt does not require venue in scene.

---

## Reference: current code

```ts
// gameResultsArtifact.photoContext.ts (before change)
return [
  `Candid group photo after a ${sportLabel} game at ${venue} (${gameTitle}).`,
  winnerLine,
  'Natural smiles, casual sportswear, warm daylight, photorealistic, not staged.',
  'No text overlays, no logos, no watermarks.',
].join(' ');
```

Related: `docs/PLAN_GAME_RESULTS_ARTIFACTS.md` Phase 4 (Photo step).
