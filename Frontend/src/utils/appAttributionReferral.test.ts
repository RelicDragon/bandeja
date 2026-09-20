// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_ATTRIBUTION_STORAGE_KEY,
  captureAppAttributionFromLocation,
  captureManualReferralCode,
  getCapturedReferralCode,
  mergeAttributionFirstTouch,
  parseAttributionFromSearch,
  readStoredAttribution,
} from './appAttribution';

/**
 * PRD 351 — `?ref=CODE` rides the link-to-app attribution snapshot.
 *
 * The rule under test is the one `docs/product/constraints.md` calls
 * "Link-to-app first-touch": the referrer is captured once and a later link
 * never replaces it. Everything else about referrals depends on this holding.
 */

const AID = 'AbCdEfGhIjKlMn12';

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'bandeja_aid=; Path=/; Max-Age=0';
});

describe('parseAttributionFromSearch', () => {
  it('captures ref from the landing page query', () => {
    const parsed = parseAttributionFromSearch(`?aid=${AID}&utm_source=qr&ref=BNDJ-7K2Q`);
    expect(parsed.ref).toBe('BNDJ7K2Q');
    expect(parsed.aid).toBe(AID);
    expect(parsed.utmSource).toBe('qr');
  });

  it('captures ref from a bare game link', () => {
    expect(parseAttributionFromSearch('?ref=bndj7k2q').ref).toBe('BNDJ7K2Q');
  });

  it('drops a malformed ref instead of guessing', () => {
    expect(parseAttributionFromSearch('?ref=BNDJ7K2O').ref).toBeNull();
    expect(parseAttributionFromSearch('?ref=nope').ref).toBeNull();
    expect(parseAttributionFromSearch('?aid=' + AID).ref).toBeNull();
  });
});

describe('mergeAttributionFirstTouch', () => {
  it('stores the first ref it sees', () => {
    const first = mergeAttributionFirstTouch(null, { aid: AID, ref: 'BNDJ7K2Q' });
    expect(first?.ref).toBe('BNDJ7K2Q');
  });

  it('never lets a later link reassign the referrer', () => {
    const first = mergeAttributionFirstTouch(null, { aid: AID, ref: 'BNDJ7K2Q' });
    const second = mergeAttributionFirstTouch(first, { aid: AID, ref: 'AAAA2222' });
    expect(second?.ref).toBe('BNDJ7K2Q');
  });

  it('fills an empty ref on a later touch', () => {
    const first = mergeAttributionFirstTouch(null, { aid: AID, utmSource: 'qr' });
    expect(first?.ref).toBeNull();
    const second = mergeAttributionFirstTouch(first, { ref: 'BNDJ7K2Q' });
    expect(second?.ref).toBe('BNDJ7K2Q');
    expect(second?.aid).toBe(AID);
    expect(second?.utmSource).toBe('qr');
  });

  it('treats a bare ref as enough signal to create a snapshot', () => {
    // A game invite link carries no aid and no utm. Without this, the whole
    // referral would be dropped on the floor before it reached the server.
    const merged = mergeAttributionFirstTouch(null, { ref: 'BNDJ7K2Q' });
    expect(merged?.ref).toBe('BNDJ7K2Q');
    expect(merged?.aid).toBeTruthy();
  });

  it('still returns null when there is genuinely no signal', () => {
    expect(mergeAttributionFirstTouch(null, {})).toBeNull();
    expect(mergeAttributionFirstTouch(null, { ref: null })).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips ref through localStorage', () => {
    captureAppAttributionFromLocation({ search: `?aid=${AID}&ref=BNDJ-7K2Q`, pathname: '/link-to-app' });
    expect(getCapturedReferralCode()).toBe('BNDJ7K2Q');
    expect(readStoredAttribution()?.ref).toBe('BNDJ7K2Q');
    expect(localStorage.getItem(APP_ATTRIBUTION_STORAGE_KEY)).toContain('BNDJ7K2Q');
  });

  it('survives a later visit that carries a different code', () => {
    captureAppAttributionFromLocation({ search: `?aid=${AID}&ref=BNDJ-7K2Q`, pathname: '/link-to-app' });
    captureAppAttributionFromLocation({ search: '?ref=AAAA-2222', pathname: '/games/g1' });
    expect(getCapturedReferralCode()).toBe('BNDJ7K2Q');
  });

  it('ignores a stored ref that is not a valid code', () => {
    // localStorage is attacker-writable, so the read boundary re-normalises
    // instead of trusting what is there: nothing that is not eight in-alphabet
    // characters can reach `POST /auth/attribution`.
    const tampered: unknown[] = [
      'tampered!', // out-of-alphabet character
      'TAMPEREDX', // too long
      'TAMP', // too short
      '0OI1ABCD', // the four ambiguous characters are not in the alphabet
      '<script>', // eight characters, none of them legal
      '',
      42,
      { code: 'BNDJ7K2Q' },
    ];
    for (const ref of tampered) {
      localStorage.setItem(APP_ATTRIBUTION_STORAGE_KEY, JSON.stringify({ aid: AID, ref }));
      expect(getCapturedReferralCode()).toBeNull();
    }
  });

  it('still carries a well-formed code the client cannot vouch for', () => {
    // `TAMPERED` really is eight in-alphabet characters, so it is structurally
    // a code and the client has no way to say otherwise. Whether it belongs to
    // an active user is a server question — `resolveReferrerUserId` answers it
    // and drops the referrer when it does not resolve.
    localStorage.setItem(
      APP_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ aid: AID, ref: 'tampered' }),
    );
    expect(getCapturedReferralCode()).toBe('TAMPERED');
  });
});

describe('captureManualReferralCode', () => {
  it('stores a code typed on the Register screen', () => {
    expect(captureManualReferralCode('bndj-7k2q')).toBe('BNDJ7K2Q');
    expect(getCapturedReferralCode()).toBe('BNDJ7K2Q');
  });

  it('cannot overwrite a code that came from a link', () => {
    captureAppAttributionFromLocation({ search: `?aid=${AID}&ref=BNDJ-7K2Q`, pathname: '/link-to-app' });
    expect(captureManualReferralCode('AAAA-2222')).toBe('BNDJ7K2Q');
  });

  it('is a no-op for a malformed code', () => {
    expect(captureManualReferralCode('nope')).toBeNull();
    expect(getCapturedReferralCode()).toBeNull();
  });
});
