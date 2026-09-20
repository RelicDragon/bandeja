import sharp from 'sharp';
import type { MonthlyRecapPayload, RecapSlide } from './recap.types';
import {
  isRecapRtlLanguage,
  recapCopy,
  type RecapImageLanguage,
} from './recapCopy';

/**
 * PRD 353 — server-rendered recap images.
 *
 * Two templates, both SVG → PNG through sharp (the house precedent is
 * `telegram/bracket-summary-image.service.ts`):
 *
 * - `slide`   1080 × 1920, one per shared slide, published as story items.
 * - `recap-card` 1080 × 1350, the single summary image "Save image" exports.
 *
 * Everything is drawn from primitives — no remote avatars are fetched, so a
 * slow S3 or a dead CDN can never stall a share. Text is already localized by
 * the caller via `recapCopy`; numbers go through `Intl` for the same language.
 */

export const RECAP_SLIDE_WIDTH = 1080;
export const RECAP_SLIDE_HEIGHT = 1920;
export const RECAP_CARD_WIDTH = 1080;
export const RECAP_CARD_HEIGHT = 1350;

const FONT_STACK =
  "'Inter','Noto Sans','Noto Sans Arabic','Noto Sans SC','Noto Sans JP','Noto Sans Thai','Noto Sans Devanagari','DejaVu Sans',sans-serif";

/** One accent per slide kind, on the shared dark base (PRD 353, motion & theme). */
const ACCENT: Record<string, { from: string; to: string; glow: string }> = {
  COVER: { from: '#0ea5e9', to: '#7c3aed', glow: '#38bdf8' },
  GAMES: { from: '#0284c7', to: '#0f172a', glow: '#38bdf8' },
  WINS: { from: '#059669', to: '#0f172a', glow: '#34d399' },
  LEVEL: { from: '#7c3aed', to: '#0f172a', glow: '#a78bfa' },
  PARTNER: { from: '#db2777', to: '#0f172a', glow: '#f472b6' },
  STREAK: { from: '#ea580c', to: '#0f172a', glow: '#fb923c' },
  CLUB: { from: '#0d9488', to: '#0f172a', glow: '#2dd4bf' },
  LOW_ACTIVITY: { from: '#0284c7', to: '#0f172a', glow: '#38bdf8' },
  OUTRO: { from: '#4f46e5', to: '#0f172a', glow: '#818cf8' },
};

const PREMIUM_ACCENT = { from: '#b45309', to: '#0f172a', glow: '#fbbf24' };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function recapMonthLabel(monthStart: string, language: RecapImageLanguage): string {
  return new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(monthStart));
}

function formatNumber(value: number, language: RecapImageLanguage, decimals = 0): string {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value: number, language: RecapImageLanguage): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function ownerName(payload: MonthlyRecapPayload): string {
  return truncate(
    [payload.owner.firstName, payload.owner.lastName].filter(Boolean).join(' ') || 'Bandeja',
    28,
  );
}

type SlideText = {
  eyebrow: string;
  headline: string;
  caption: string;
};

/** The one-line text alternative of a slide, also used as the story item caption. */
export function recapSlideText(
  payload: MonthlyRecapPayload,
  slide: RecapSlide,
  language: RecapImageLanguage,
): SlideText {
  const month = recapMonthLabel(payload.monthStart, language);
  const group = slide.sport ? payload.sports.find((s) => s.sport === slide.sport) : undefined;

  switch (slide.kind) {
    case 'COVER':
      return { eyebrow: ownerName(payload), headline: month, caption: recapCopy(language, 'coverTitle') };
    case 'GAMES':
      return {
        eyebrow: recapCopy(language, 'games'),
        headline: formatNumber(group?.games ?? payload.totals.games, language),
        caption: month,
      };
    case 'WINS':
      return {
        eyebrow: recapCopy(language, 'wins'),
        headline: formatNumber(group?.wins ?? payload.totals.wins, language),
        caption: `${recapCopy(language, 'winRate')} · ${formatPercent(
          group?.winRatePct ?? payload.totals.winRatePct ?? 0,
          language,
        )}`,
      };
    case 'LEVEL':
      return {
        eyebrow: recapCopy(language, 'level'),
        // Neutral by design: the number moved, nobody failed.
        headline: formatNumber(group?.level?.after ?? 0, language, 1),
        caption: `${formatNumber(group?.level?.before ?? 0, language, 1)} → ${formatNumber(
          group?.level?.after ?? 0,
          language,
          1,
        )}`,
      };
    case 'PARTNER':
      return {
        eyebrow: recapCopy(language, 'partner'),
        headline: truncate(
          [group?.partner?.firstName, group?.partner?.lastName].filter(Boolean).join(' ') || '—',
          22,
        ),
        caption: `${formatNumber(group?.partner?.wins ?? 0, language)} · ${recapCopy(language, 'wins')}`,
      };
    case 'STREAK':
      return {
        eyebrow: recapCopy(language, 'streak'),
        headline: formatNumber(payload.streak?.weeks ?? 0, language),
        caption: recapCopy(language, 'streakUnit'),
      };
    case 'CLUB':
      return {
        eyebrow: recapCopy(language, 'club'),
        headline: truncate(group?.club?.name ?? '—', 22),
        caption: `${formatNumber(group?.club?.games ?? 0, language)} · ${recapCopy(language, 'games')}`,
      };
    case 'LOW_ACTIVITY':
      return {
        eyebrow: month,
        headline: formatNumber(payload.totals.games, language),
        caption: recapCopy(language, 'games'),
      };
    case 'OUTRO':
    default:
      return {
        eyebrow: ownerName(payload),
        headline: recapCopy(language, 'outro'),
        caption: month,
      };
  }
}

function backdrop(
  id: string,
  accent: { from: string; to: string; glow: string },
  width: number,
  height: number,
): string {
  return `
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent.from}"/>
      <stop offset="100%" stop-color="${accent.to}"/>
    </linearGradient>
    <radialGradient id="glow-${id}" cx="50%" cy="8%" r="70%">
      <stop offset="0%" stop-color="${accent.glow}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <rect width="${width}" height="${height}" fill="url(#bg-${id})"/>
  <rect width="${width}" height="${height}" fill="url(#glow-${id})"/>`;
}

export async function renderRecapSlideImage(
  payload: MonthlyRecapPayload,
  slide: RecapSlide,
  language: RecapImageLanguage,
): Promise<Buffer> {
  const text = recapSlideText(payload, slide, language);
  const premiumCover = slide.kind === 'COVER' && payload.owner.isPremium;
  const accent = premiumCover ? PREMIUM_ACCENT : ACCENT[slide.kind] ?? ACCENT.COVER;
  // Slide text is centre-anchored, which mirrors for free in `ar`; only the
  // letter-spaced eyebrow needs the RTL guard (spacing after the last glyph
  // pushes centred RTL text off by half a space).
  const eyebrowSpacing = isRecapRtlLanguage(language) ? 0 : 4;
  const cx = RECAP_SLIDE_WIDTH / 2;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${RECAP_SLIDE_WIDTH}" height="${RECAP_SLIDE_HEIGHT}" viewBox="0 0 ${RECAP_SLIDE_WIDTH} ${RECAP_SLIDE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${backdrop(slide.key.replace(/[^a-zA-Z0-9]/g, '-'), accent, RECAP_SLIDE_WIDTH, RECAP_SLIDE_HEIGHT)}
  <text x="${cx}" y="820" text-anchor="middle" font-family="${FONT_STACK}" font-size="52" fill="#e2e8f0" opacity="0.85" letter-spacing="${eyebrowSpacing}">${escapeXml(
    text.eyebrow.toUpperCase(),
  )}</text>
  <text x="${cx}" y="1010" text-anchor="middle" font-family="${FONT_STACK}" font-size="168" font-weight="800" fill="#ffffff">${escapeXml(
    text.headline,
  )}</text>
  <text x="${cx}" y="1110" text-anchor="middle" font-family="${FONT_STACK}" font-size="56" fill="#e2e8f0" opacity="0.9">${escapeXml(
    text.caption,
  )}</text>
  <text x="${cx}" y="1800" text-anchor="middle" font-family="${FONT_STACK}" font-size="40" fill="#ffffff" opacity="0.7" letter-spacing="8">BANDEJA</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Square-ish thumbnail for the story rail bubble and the share-sheet strip. */
export async function renderRecapSlideThumbnail(slideImage: Buffer): Promise<Buffer> {
  return sharp(slideImage)
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * The `recap-card` template — one image with the month's headline numbers, in
 * the results-share-card style, carrying the wordmark and the user's name.
 */
export function buildRecapSummaryCardSvg(
  payload: MonthlyRecapPayload,
  language: RecapImageLanguage,
): string {
  const accent = payload.owner.isPremium ? PREMIUM_ACCENT : ACCENT.COVER;
  const month = recapMonthLabel(payload.monthStart, language);
  const primary = payload.sports[0] ?? null;

  const stats: Array<{ label: string; value: string }> = [
    { label: recapCopy(language, 'games'), value: formatNumber(payload.totals.games, language) },
    { label: recapCopy(language, 'wins'), value: formatNumber(payload.totals.wins, language) },
    {
      label: recapCopy(language, 'winRate'),
      value:
        payload.totals.winRatePct == null
          ? '—'
          : formatPercent(payload.totals.winRatePct, language),
    },
  ];
  if (primary?.level) {
    stats.push({
      label: recapCopy(language, 'level'),
      value: formatNumber(primary.level.after, language, 1),
    });
  }

  const columnWidth = RECAP_CARD_WIDTH / stats.length;
  const statCells = stats
    .map((stat, index) => {
      const x = columnWidth * index + columnWidth / 2;
      return `
  <text x="${x}" y="760" text-anchor="middle" font-family="${FONT_STACK}" font-size="104" font-weight="800" fill="#ffffff">${escapeXml(
        stat.value,
      )}</text>
  <text x="${x}" y="830" text-anchor="middle" font-family="${FONT_STACK}" font-size="36" fill="#e2e8f0" opacity="0.8">${escapeXml(
        truncate(stat.label, 18),
      )}</text>`;
    })
    .join('');

  const footerParts = [
    primary?.partner
      ? `${recapCopy(language, 'partner')}: ${truncate(
          [primary.partner.firstName, primary.partner.lastName].filter(Boolean).join(' '),
          20,
        )}`
      : null,
    primary?.club ? `${recapCopy(language, 'club')}: ${truncate(primary.club.name, 20)}` : null,
  ].filter((part): part is string => part != null);

  /**
   * RTL guard, the same one `renderRecapSlideImage` already has.
   *
   * This card is the one that lands in the camera roll and gets reshared, and
   * unlike the slides it is *start*-anchored, so two things break in Arabic
   * without it: the whole block hugs the wrong edge, and SVG `letter-spacing`
   * on Arabic pulls the cursive glyphs apart into disconnected letterforms.
   * `BANDEJA` is Latin in every locale, so it keeps its tracking — it only
   * moves to the same edge as the rest of the block.
   */
  const isRtl = isRecapRtlLanguage(language);
  const blockX = isRtl ? RECAP_CARD_WIDTH - 80 : 80;
  const blockAnchor = isRtl ? 'end' : 'start';
  const blockDir = isRtl ? ' direction="rtl"' : '';
  const titleSpacing = isRtl ? 0 : 6;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${RECAP_CARD_WIDTH}" height="${RECAP_CARD_HEIGHT}" viewBox="0 0 ${RECAP_CARD_WIDTH} ${RECAP_CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${backdrop('card', accent, RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT)}
  <text x="${blockX}" y="200" text-anchor="${blockAnchor}"${blockDir} font-family="${FONT_STACK}" font-size="44" fill="#e2e8f0" opacity="0.8" letter-spacing="${titleSpacing}">${escapeXml(
    recapCopy(language, 'summaryTitle').toUpperCase(),
  )}</text>
  <text x="${blockX}" y="310" text-anchor="${blockAnchor}"${blockDir} font-family="${FONT_STACK}" font-size="84" font-weight="800" fill="#ffffff">${escapeXml(
    month,
  )}</text>
  <text x="${blockX}" y="380" text-anchor="${blockAnchor}"${blockDir} font-family="${FONT_STACK}" font-size="42" fill="#e2e8f0" opacity="0.85">${escapeXml(
    ownerName(payload),
  )}</text>
  <rect x="80" y="440" width="${RECAP_CARD_WIDTH - 160}" height="2" fill="#ffffff" opacity="0.2"/>
  ${statCells}
  ${
    footerParts.length > 0
      ? `<text x="${blockX}" y="1060" text-anchor="${blockAnchor}"${blockDir} font-family="${FONT_STACK}" font-size="38" fill="#e2e8f0" opacity="0.85">${escapeXml(
          truncate(footerParts.join('  ·  '), 60),
        )}</text>`
      : ''
  }
  <text x="${blockX}" y="1250" text-anchor="${blockAnchor}" font-family="${FONT_STACK}" font-size="40" fill="#ffffff" opacity="0.75" letter-spacing="8">BANDEJA</text>
</svg>`;

  return svg;
}

export async function renderRecapSummaryCard(
  payload: MonthlyRecapPayload,
  language: RecapImageLanguage,
): Promise<Buffer> {
  return sharp(Buffer.from(buildRecapSummaryCardSvg(payload, language))).png().toBuffer();
}
