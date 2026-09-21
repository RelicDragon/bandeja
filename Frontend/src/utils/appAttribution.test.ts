import { describe, expect, it } from 'vitest';
import {
  createAppAttributionAid,
  isAppAttributionAid,
  isAuthAttributionRequestUrl,
  mergeAttributionFirstTouch,
  parseAttributionFromSearch,
  sanitizeAppUtmValue,
} from './appAttribution';

describe('appAttribution', () => {
  it('sanitizes utm and aid', () => {
    expect(sanitizeAppUtmValue('qr-poster_1')).toBe('qr-poster_1');
    expect(sanitizeAppUtmValue('bad value')).toBeNull();
    expect(isAppAttributionAid(createAppAttributionAid())).toBe(true);
    expect(isAppAttributionAid('short')).toBe(false);
  });

  it('parses search attribution', () => {
    const parsed = parseAttributionFromSearch(
      '?utm_source=qr&utm_campaign=club-ns&aid=AbCdEfGhIjKlMn12'
    );
    expect(parsed.utmSource).toBe('qr');
    expect(parsed.utmCampaign).toBe('club-ns');
    expect(parsed.aid).toBe('AbCdEfGhIjKlMn12');
  });

  it('keeps first-touch utm', () => {
    const first = mergeAttributionFirstTouch(null, {
      aid: 'AbCdEfGhIjKlMn12',
      utmSource: 'qr',
      utmCampaign: 'club-a',
    });
    const second = mergeAttributionFirstTouch(first, {
      aid: 'ZZZZZZZZZZZZZZZZ',
      utmSource: 'other',
      utmCampaign: 'club-b',
    });
    expect(second?.aid).toBe('AbCdEfGhIjKlMn12');
    expect(second?.utmCampaign).toBe('club-a');
    expect(second?.utmSource).toBe('qr');
  });

  it('matches auth attribution URLs', () => {
    expect(isAuthAttributionRequestUrl('/api/auth/register/phone')).toBe(true);
    expect(isAuthAttributionRequestUrl('/telegram/verify-otp')).toBe(true);
    expect(isAuthAttributionRequestUrl('https://bandeja.me/api/auth/google/exchange')).toBe(true);
    expect(isAuthAttributionRequestUrl('https://bandeja.me/api/auth/login/apple')).toBe(true);
    expect(isAuthAttributionRequestUrl('/auth/link/google')).toBe(false);
  });

  it('fills utm onto an existing aid', () => {
    const existing = mergeAttributionFirstTouch(null, { aid: 'Existing12ab' });
    const withUtm = mergeAttributionFirstTouch(existing, { utmCampaign: 'club-a' });
    expect(withUtm?.aid).toBe('Existing12ab');
    expect(withUtm?.utmCampaign).toBe('club-a');
  });
});
