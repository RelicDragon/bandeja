import assert from 'node:assert/strict';
import {
  attributionHasSignal,
  coalesceUtm,
  parseLinkToAppAttributionInput,
} from './linkToApp.attributionParse';

/**
 * PRD 351 — `?ref=CODE` rides the link-to-app attribution pipeline.
 *
 * This file covers the pure half: parsing and the first-touch coalesce rule.
 * The database half (attach once, never overwrite) is in
 * `services/referral/referralReward.integration.test.ts`.
 */

const AID = 'Aid1234567890ab';

// ---------------------------------------------------------------------------
// captured from the landing page query
// ---------------------------------------------------------------------------

const landing = parseLinkToAppAttributionInput({
  aid: AID,
  utm_source: 'qr',
  utm_campaign: 'club-a',
  ref: 'BNDJ-7K2Q',
});
assert.equal(landing.ref, 'BNDJ7K2Q', 'the dashed display form is normalized to the stored form');
assert.equal(landing.aid, AID, 'the existing aid carry is untouched');
assert.equal(landing.utm.source, 'qr');

// ---------------------------------------------------------------------------
// captured from a game link (`/games/:id?ref=`), which carries no aid or utm
// ---------------------------------------------------------------------------

const gameLink = parseLinkToAppAttributionInput({ ref: 'bndj7k2q' });
assert.equal(gameLink.ref, 'BNDJ7K2Q', 'lowercase from a hand-typed URL still resolves');
assert.equal(gameLink.aid, null);
assert.ok(
  attributionHasSignal(gameLink),
  'a bare ref is enough signal to run the attach — without this, a game invite link would be dropped',
);

// ---------------------------------------------------------------------------
// carried in the nested `attribution` body the axios interceptor sends
// ---------------------------------------------------------------------------

const nested = parseLinkToAppAttributionInput({
  attribution: { aid: AID, ref: 'BNDJ-7K2Q', utmSource: 'qr' },
});
assert.equal(nested.ref, 'BNDJ7K2Q');
assert.equal(nested.aid, AID);
assert.equal(nested.utm.source, 'qr');

// A body-level `ref` and a nested one: the nested snapshot wins, matching how
// `aid` and the UTMs already merge.
const both = parseLinkToAppAttributionInput({
  ref: 'AAAA2222',
  attribution: { ref: 'BBBB3333' },
});
assert.equal(both.ref, 'BBBB3333');

// ---------------------------------------------------------------------------
// malformed codes never become a referrer
// ---------------------------------------------------------------------------

assert.equal(parseLinkToAppAttributionInput({ ref: 'not-a-code' }).ref, null);
assert.equal(parseLinkToAppAttributionInput({ ref: '' }).ref, null);
assert.equal(parseLinkToAppAttributionInput({ ref: 'BNDJ7K2O' }).ref, null, 'O is not in the alphabet');
assert.equal(parseLinkToAppAttributionInput({ ref: ['BNDJ7K2Q'] }).ref, null);
assert.equal(parseLinkToAppAttributionInput({}).ref, null);
assert.equal(
  attributionHasSignal(parseLinkToAppAttributionInput({ ref: 'not-a-code' })),
  false,
  'a junk ref must not make a signal-free request look attributable',
);

// ---------------------------------------------------------------------------
// first touch on the surrounding UTM merge is unchanged
// ---------------------------------------------------------------------------

const stored = { source: 'qr', medium: 'offline', campaign: 'club-a', content: null, term: null };
const later = { source: 'instagram', medium: 'paid', campaign: 'spring', content: null, term: null };
assert.deepEqual(
  coalesceUtm(stored, later),
  stored,
  'a later touch never overwrites stored first-touch UTM (docs/product/constraints.md)',
);
assert.deepEqual(
  coalesceUtm({ source: null, medium: null, campaign: null, content: null, term: null }, later),
  later,
  'an empty first touch is filled in',
);

console.log('linkToApp.referralAttribution.test.ts: all assertions passed');
