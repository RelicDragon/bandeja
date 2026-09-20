import type { TFunction } from 'i18next';
import type { RecapSlide } from '@/api/recap';

/**
 * PRD 353 — the short label a slide gets in the share sheet.
 *
 * Deliberately terse and number-free: the row is a checkbox, not a second
 * rendering of the slide.
 */
export function recapSlideShareLabel(slide: RecapSlide, t: TFunction): string {
  switch (slide.kind) {
    case 'COVER':
      return t('recap.share.slides.cover');
    case 'GAMES':
      return t('recap.share.slides.games');
    case 'WINS':
      return t('recap.share.slides.wins');
    case 'LEVEL':
      return t('recap.share.slides.level');
    case 'PARTNER':
      return t('recap.share.slides.partner');
    case 'STREAK':
      return t('recap.share.slides.streak');
    case 'CLUB':
      return t('recap.share.slides.club');
    case 'LOW_ACTIVITY':
      return t('recap.share.slides.lowActivity');
    case 'OUTRO':
    default:
      return t('recap.share.slides.outro');
  }
}
