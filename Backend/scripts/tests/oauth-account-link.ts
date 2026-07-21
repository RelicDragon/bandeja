import { readFileSync } from 'fs';
import { join } from 'path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const servicePath = join(__dirname, '../../src/services/auth/oauthAccountLink.service.ts');
const oauthLoginPath = join(__dirname, '../../src/services/auth/oauthLogin.service.ts');
const routesPath = join(__dirname, '../../src/routes/auth.routes.ts');
const profilePath = join(__dirname, '../../../Frontend/src/pages/Profile.tsx');
const utilPath = join(__dirname, '../../../Frontend/src/utils/oauthAccountLink.ts');

const serviceSrc = readFileSync(servicePath, 'utf8');
const oauthLoginSrc = readFileSync(oauthLoginPath, 'utf8');
const routesSrc = readFileSync(routesPath, 'utf8');
const profileSrc = readFileSync(profilePath, 'utf8');
const utilSrc = readFileSync(utilPath, 'utf8');

assert(serviceSrc.includes('UserMergeService.mergeUsers'), 'oauth link must call UserMergeService');
assert(serviceSrc.includes('revokeAllRefreshSessionsForUser'), 'oauth merge must revoke source sessions');
assert(serviceSrc.includes('issueLoginTokens'), 'oauth merge must reissue tokens');
assert(serviceSrc.includes('auth.oauthLinkMergeRequired'), 'oauth link must use merge required code');
assert(serviceSrc.includes('confirmMerge'), 'oauth link must read confirmMerge');
assert(serviceSrc.includes('linkGoogleAccount'), 'service exports linkGoogleAccount');
assert(serviceSrc.includes('linkAppleAccount'), 'service exports linkAppleAccount');

assert(routesSrc.includes("body('confirmMerge').optional().isBoolean()"), 'routes must validate confirmMerge');
assert(routesSrc.includes('linkGoogleAccount') || routesSrc.includes('linkGoogle'), 'routes wire google link');

assert(profileSrc.includes('getOAuthLinkMergeRequired'), 'Profile must detect merge required');
assert(profileSrc.includes('confirmMerge: true') || profileSrc.includes('confirmMerge'), 'Profile must pass confirmMerge');
assert(profileSrc.includes('setAuth'), 'Profile must refresh auth after merge');
assert(profileSrc.includes('showOAuthMergeModal'), 'Profile must show merge modal');

assert(
  utilSrc.includes('auth.oauthLinkMergeRequired') && utilSrc.includes('data?.code'),
  'util must match API merge-required code'
);

assert(
  oauthLoginSrc.includes('attachGoogleToExistingByVerifiedEmail'),
  'Google login must auto-attach verified email to existing account'
);
assert(
  oauthLoginSrc.includes('attachAppleToExistingByVerifiedEmail'),
  'Apple login must auto-attach verified email to existing account'
);
assert(
  /if \(existingEmail\) \{[\s\S]*?attachGoogleToExistingByVerifiedEmail/.test(oauthLoginSrc),
  'Google email conflict must attempt attach before throwing emailAlreadyExistsUseLogin'
);

console.log('oauth-account-link: OK');
