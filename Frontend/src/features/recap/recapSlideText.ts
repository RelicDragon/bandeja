import type { TFunction } from 'i18next';
import type { RecapSegmentPayload } from '@/api/recap';
import type { RecapFormatters } from './recapFormat';

/**
 * PRD 353 — the spoken version of a slide.
 *
 * Every slide is a picture of a number, so each one needs a text alternative
 * that a screen reader announces on entry. This is also what the share-sheet
 * thumbnails use as their accessible name, so the two can never drift.
 */
export function recapSlideAltText(
  recap: RecapSegmentPayload,
  t: TFunction,
  formatters: RecapFormatters,
): string {
  const month = formatters.monthLong(recap.monthStart);

  switch (recap.kind) {
    case 'COVER':
      return t('recap.slides.cover.alt', { month });
    case 'GAMES':
      return t('recap.slides.games.alt', {
        count: recap.games?.count ?? 0,
        month,
      });
    case 'WINS':
      return t('recap.slides.wins.alt', {
        count: recap.wins?.wins ?? 0,
        percent: formatters.percent(recap.wins?.winRatePct ?? 0),
      });
    case 'LEVEL':
      // Neutral wording in both directions — a drop is never framed as a loss.
      return t('recap.slides.level.alt', {
        level: formatters.level(recap.level?.after ?? 0),
      });
    case 'PARTNER':
      return t('recap.slides.partner.alt', {
        count: recap.partner?.wins ?? 0,
        name: recapPartnerName(recap),
      });
    case 'STREAK':
      return t('recap.slides.streak.alt', { count: recap.streak?.weeks ?? 0 });
    case 'CLUB':
      return t('recap.slides.club.alt', {
        count: recap.club?.games ?? 0,
        club: recap.club?.name ?? '',
      });
    case 'LOW_ACTIVITY':
      return t('recap.slides.lowActivity.alt', {
        count: recap.totals?.games ?? 0,
        month,
      });
    case 'OUTRO':
    default:
      return t('recap.slides.outro.alt', {
        month: formatters.nextMonthLong(recap.monthStart),
      });
  }
}

export function recapPartnerName(recap: RecapSegmentPayload): string {
  const partner = recap.partner;
  if (!partner) return '';
  return [partner.firstName, partner.lastName].filter(Boolean).join(' ').trim();
}

export function recapOwnerName(recap: RecapSegmentPayload): string {
  return [recap.owner.firstName, recap.owner.lastName].filter(Boolean).join(' ').trim();
}

export function recapOwnerInitials(recap: RecapSegmentPayload): string {
  const first = recap.owner.firstName?.[0] ?? '';
  const last = recap.owner.lastName?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}
