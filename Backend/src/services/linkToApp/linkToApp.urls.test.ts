import assert from 'node:assert/strict';
import { aidSetCookieHeader, createLinkToAppAid, isLinkToAppAid, parseAidCookie } from './linkToApp.aid';
import { attributionHasSignal, coalesceUtm, parseLinkToAppAttributionInput } from './linkToApp.attributionParse';
import { displayCampaignName, sanitizeCampaignLabel } from './linkToApp.campaignLabelParse';
import {
  buildLinkToAppDestination,
  detectLinkToAppPlatform,
  isLinkToAppChoice,
  parseLinkToAppUtm,
  sanitizeUtmValue,
} from './linkToApp.urls';

async function run(): Promise<void> {
  assert.equal(sanitizeUtmValue('qr-poster_1'), 'qr-poster_1');
  assert.equal(sanitizeUtmValue('bad value'), null);
  assert.equal(sanitizeUtmValue('https://evil'), null);
  assert.equal(sanitizeUtmValue('a'.repeat(81)), null);
  assert.equal(isLinkToAppChoice('ios'), true);
  assert.equal(isLinkToAppChoice('store'), false);

  const utm = parseLinkToAppUtm({
    utm_source: 'qr',
    utm_medium: 'offline',
    utm_campaign: 'club-ns-2026',
    utm_content: ['poster-a'],
    other: 'x',
  });
  assert.deepEqual(utm, {
    source: 'qr',
    medium: 'offline',
    campaign: 'club-ns-2026',
    content: 'poster-a',
    term: null,
  });

  const ios = buildLinkToAppDestination({
    choice: 'ios',
    utm,
    aid: 'AbCdEfGhIjKlMn12',
    frontendUrl: 'https://bandeja.me',
    appStoreCampaignProviderToken: '123456',
  });
  assert.ok(ios.includes('apps.apple.com/app/bandeja/id6756632318'));
  assert.ok(ios.includes('pt=123456'));
  assert.ok(ios.includes('ct=AbCdEfGhIjKlMn12'));
  assert.ok(ios.includes('mt=8'));

  const android = buildLinkToAppDestination({
    choice: 'android',
    utm,
    aid: 'AbCdEfGhIjKlMn12',
    frontendUrl: 'https://bandeja.me',
    appStoreCampaignProviderToken: '',
  });
  assert.ok(android.includes('play.google.com/store/apps/details'));
  assert.ok(android.includes('referrer='));
  assert.ok(decodeURIComponent(android).includes('utm_source=qr'));
  assert.ok(decodeURIComponent(android).includes('utm_campaign=club-ns-2026'));
  assert.ok(decodeURIComponent(android).includes('aid=AbCdEfGhIjKlMn12'));

  const web = buildLinkToAppDestination({
    choice: 'web',
    utm,
    aid: 'AbCdEfGhIjKlMn12',
    frontendUrl: 'https://bandeja.me/',
    appStoreCampaignProviderToken: '',
  });
  assert.equal(web, 'https://bandeja.me/?utm_source=qr&utm_medium=offline&utm_campaign=club-ns-2026&utm_content=poster-a&aid=AbCdEfGhIjKlMn12&choice=web');

  assert.equal(detectLinkToAppPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'ios');
  assert.equal(detectLinkToAppPlatform('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(detectLinkToAppPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'desktop');

  const nested = parseLinkToAppAttributionInput({
    attribution: {
      aid: 'AbCdEfGhIjKlMn12',
      utmSource: 'qr',
      utmCampaign: 'club-ns',
      choice: 'ios',
    },
  });
  assert.equal(nested.aid, 'AbCdEfGhIjKlMn12');
  assert.equal(nested.utm.source, 'qr');
  assert.equal(nested.utm.campaign, 'club-ns');
  assert.equal(nested.choice, 'ios');
  assert.equal(attributionHasSignal(nested), true);
  assert.equal(attributionHasSignal(parseLinkToAppAttributionInput({})), false);

  const cookieFallback = parseLinkToAppAttributionInput({}, 'AbCdEfGhIjKlMn12');
  assert.equal(cookieFallback.aid, 'AbCdEfGhIjKlMn12');

  const kept = coalesceUtm(
    { source: 'qr', medium: 'offline', campaign: 'club-a', content: null, term: null },
    { source: 'other', medium: null, campaign: 'club-b', content: 'poster', term: null }
  );
  assert.equal(kept.source, 'qr');
  assert.equal(kept.campaign, 'club-a');
  assert.equal(kept.content, 'poster');

  const aid = createLinkToAppAid();
  assert.equal(isLinkToAppAid(aid), true);
  assert.equal(isLinkToAppAid('short'), false);
  assert.equal(parseAidCookie(`other=1; bandeja_aid=${aid}`), aid);
  assert.ok(aidSetCookieHeader(aid, true).includes('Secure'));

  assert.equal(sanitizeCampaignLabel('  NS club poster  '), 'NS club poster');
  assert.equal(sanitizeCampaignLabel(''), null);
  assert.equal(displayCampaignName('550e8400-e29b-41d4-a716-446655440000', 'NS club'), 'NS club');
  assert.equal(displayCampaignName('raw-code', null), 'raw-code');
  assert.equal(displayCampaignName(null, null), '—');

  console.log('linkToApp.urls.test.ts: ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
