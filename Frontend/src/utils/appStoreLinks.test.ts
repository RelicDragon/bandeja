import { describe, expect, it } from 'vitest';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  getStoreBadgeUrls,
} from './appStoreLinks';

describe('appStoreLinks', () => {
  it('matches link-to-app store URLs', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/app/bandeja/id6756632318');
    expect(PLAY_STORE_URL).toBe('https://play.google.com/store/apps/details?id=com.funified.bandeja');
  });

  it('returns localized badge URLs with en fallback', () => {
    expect(getStoreBadgeUrls('ru').ios).toContain('ru-ru');
    expect(getStoreBadgeUrls('es').android).toContain('/es/');
    expect(getStoreBadgeUrls('cs').ios).toContain('cs-cz');
    expect(getStoreBadgeUrls('sr').android).toContain('en_us');
    expect(getStoreBadgeUrls('fr-FR')).toEqual(getStoreBadgeUrls('en'));
    expect(getStoreBadgeUrls('en-GB').ios).toContain('en-us');
  });
});
