import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatReferralCode, normalizeReferralCode } from './referralCode';

/**
 * PRD 351 — the static `/link-to-app/` landing must carry `?ref=CODE` exactly
 * the way it already carries `aid`, and show an "Invited by …" chip.
 *
 * The page is hand-written ES5 inside `index.html` with no build step and no
 * module boundary, so there is nothing to import. This test asserts the
 * contract against the file itself: the same regex, the same first-touch rule,
 * the same storage key — the four things that silently break the moment
 * somebody edits the page without knowing referrals ride it.
 */

const LANDING = readFileSync(join(process.cwd(), 'public/link-to-app/index.html'), 'utf8');

/** The landing's own inline normalizer, lifted out so it can be exercised. */
function landingNormalizeRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = raw.trim().toUpperCase().replace(/[\s\-_.]+/g, '');
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(stripped) ? stripped : null;
}

describe('link-to-app landing: ref capture', () => {
  it('declares the same alphabet regex the app uses', () => {
    expect(LANDING).toContain('/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/');
  });

  it('agrees with normalizeReferralCode on every case the app cares about', () => {
    const cases = [
      'BNDJ7K2Q',
      'BNDJ-7K2Q',
      'bndj7k2q',
      '  bndj 7k2q ',
      'BNDJ7K2O',
      'BNDJ7K20',
      'nope',
      '',
    ];
    for (const value of cases) {
      expect(landingNormalizeRef(value)).toBe(normalizeReferralCode(value));
    }
  });

  it('prefers the stored code over the one in the URL (first touch)', () => {
    expect(LANDING).toContain(
      "var ref = (stored && normalizeRef(stored.ref)) || normalizeRef(params.get('ref'));",
    );
  });

  it('stores ref in the same snapshot as aid', () => {
    expect(LANDING).toContain("localStorage.setItem('bandeja.attribution'");
    expect(LANDING).toMatch(/aid: aid,\s*\n\s*ref: ref,/);
    // `persistChoice` rewrites the snapshot on a store-button tap; it must not
    // drop the ref on the way through.
    expect(LANDING).toContain('if (ref) raw.ref = ref;');
  });

  it('propagates the display form onward to the /go redirects', () => {
    expect(LANDING).toContain("if (ref) params.set('ref', formatRef(ref));");
    expect(LANDING).toContain("else params.delete('ref');");
    // The `markedQs` built from `params` is what every store button links to.
    expect(LANDING).toContain("iosEl.href = '/api/public/link-to-app/go/ios' + markedQs;");
  });

  it('formats the param the same way the app does', () => {
    expect(LANDING).toContain("return code.slice(0, 4) + '-' + code.slice(4);");
    expect(formatReferralCode('BNDJ7K2Q')).toBe('BNDJ-7K2Q');
  });

  it('keeps the existing aid carry untouched', () => {
    expect(LANDING).toContain("document.cookie = 'bandeja_aid=' + aid");
    expect(LANDING).toContain("const text = 'bandeja-aid:' + aid;");
    expect(LANDING).toContain('/^[a-zA-Z0-9]{8,32}$/');
  });
});

describe('link-to-app landing: referrer chip', () => {
  it('renders a hidden chip that the resolver reveals', () => {
    expect(LANDING).toContain('id="referrerChip"');
    expect(LANDING).toContain('id="referrerText"');
    expect(LANDING).toContain('id="referrerAvatar"');
    expect(LANDING).toMatch(/<div class="referrer-chip" id="referrerChip" hidden>/);
    expect(LANDING).toContain('chip.hidden = false;');
  });

  it('resolves the code through the public endpoint only', () => {
    expect(LANDING).toContain("fetch('/api/public/referral/' + encodeURIComponent(ref)");
    // Nothing but the first name is read out of the response.
    expect(LANDING).toContain('data.firstName');
    expect(LANDING).not.toContain('data.lastName');
    expect(LANDING).not.toContain('data.phone');
  });

  it('never blocks the store buttons on the chip request', () => {
    expect(LANDING).toContain('.catch(function () {});');
    expect(LANDING).toContain('if (!ref) return;');
  });

  it('localizes the chip in every language the landing speaks', () => {
    const bundles = LANDING.match(/invitedBy: '/g) ?? [];
    const loadings = LANDING.match(/loading: '/g) ?? [];
    expect(bundles.length).toBe(loadings.length);
    expect(bundles.length).toBeGreaterThanOrEqual(5);
    expect(LANDING).toContain("(translations[lang].invitedBy || 'Invited by {name}').replace('{name}', name)");
  });
});
