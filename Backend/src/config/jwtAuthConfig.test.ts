import assert from 'node:assert/strict';
import {
  DEFAULT_DEV_JWT_SECRET,
  DEFAULT_JWT_ACCESS_EXPIRES_IN,
  DEFAULT_JWT_LEGACY_EXPIRES_IN,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
  MIN_PRODUCTION_JWT_SECRET_LENGTH,
  SAMPLE_JWT_SECRET,
  assertProductionJwtAuthConfig,
  assertProductionJwtSecret,
  isInsecureJwtSecret,
  isProductionNodeEnv,
  normalizeNodeEnv,
  parseExpiresInToMs,
  resolveJwtAccessExpiresIn,
  resolveJwtLegacyExpiresIn,
  resolveJwtSecret,
  resolveRefreshTokenExpiresIn,
} from './jwtAuthConfig';

const STRONG_SECRET = 'a'.repeat(MIN_PRODUCTION_JWT_SECRET_LENGTH);
const PROD_OK = {
  nodeEnv: 'production',
  jwtSecret: STRONG_SECRET,
  jwtAccessExpiresIn: '30m',
  refreshTokenExpiresIn: '60d',
  refreshTokenEnabled: true,
  legacyJwtIssuanceEndAt: new Date('2026-05-15T00:00:00.000Z'),
} as const;

function run() {
  assert.equal(normalizeNodeEnv('PRODUCTION'), 'production');
  assert.equal(normalizeNodeEnv(''), 'development');
  assert.equal(isProductionNodeEnv('Production'), true);
  assert.equal(isProductionNodeEnv('development'), false);

  assert.equal(parseExpiresInToMs('30m'), 30 * 60 * 1000);
  assert.equal(parseExpiresInToMs('60d'), 60 * 86_400_000);
  assert.throws(() => parseExpiresInToMs('banana'), /Unsupported expires/);
  assert.throws(() => parseExpiresInToMs('0m'), /Unsupported expires/);

  assert.equal(isInsecureJwtSecret(undefined), true);
  assert.equal(isInsecureJwtSecret(''), true);
  assert.equal(isInsecureJwtSecret('  '), true);
  assert.equal(isInsecureJwtSecret(DEFAULT_DEV_JWT_SECRET), true);
  assert.equal(isInsecureJwtSecret(SAMPLE_JWT_SECRET), true);
  assert.equal(isInsecureJwtSecret('secret'), true);
  assert.equal(isInsecureJwtSecret('PASSWORD'), true);
  assert.equal(isInsecureJwtSecret(STRONG_SECRET), false);

  assert.equal(
    resolveJwtSecret({ nodeEnv: 'development', jwtSecretEnv: undefined }),
    DEFAULT_DEV_JWT_SECRET
  );
  assert.equal(
    resolveJwtSecret({ nodeEnv: 'development', jwtSecretEnv: 'dev-override' }),
    'dev-override'
  );

  assert.throws(
    () => resolveJwtSecret({ nodeEnv: 'production', jwtSecretEnv: undefined }),
    /JWT_SECRET must be set/
  );
  assert.throws(
    () => resolveJwtSecret({ nodeEnv: 'PRODUCTION', jwtSecretEnv: SAMPLE_JWT_SECRET }),
    /JWT_SECRET must be set/
  );
  assert.throws(
    () => resolveJwtSecret({ nodeEnv: 'production', jwtSecretEnv: 'short' }),
    /at least 32/
  );
  assert.equal(
    resolveJwtSecret({ nodeEnv: 'production', jwtSecretEnv: STRONG_SECRET }),
    STRONG_SECRET
  );

  assert.equal(resolveJwtAccessExpiresIn(undefined), DEFAULT_JWT_ACCESS_EXPIRES_IN);
  assert.equal(resolveJwtAccessExpiresIn('', 'development'), DEFAULT_JWT_ACCESS_EXPIRES_IN);
  assert.equal(resolveJwtAccessExpiresIn('15m', 'production'), '15m');
  assert.equal(resolveJwtAccessExpiresIn('30m', 'production'), '30m');
  assert.throws(
    () => resolveJwtAccessExpiresIn('90d', 'production'),
    /between 1m and 30m/
  );
  assert.throws(
    () => resolveJwtAccessExpiresIn('30s', 'production'),
    /between 1m and 30m/
  );
  assert.throws(() => resolveJwtAccessExpiresIn('nope', 'development'), /Unsupported expires/);
  assert.equal(DEFAULT_JWT_ACCESS_EXPIRES_IN, '30m');

  assert.equal(resolveJwtLegacyExpiresIn(undefined), DEFAULT_JWT_LEGACY_EXPIRES_IN);
  assert.equal(resolveRefreshTokenExpiresIn(undefined), DEFAULT_REFRESH_TOKEN_EXPIRES_IN);
  assert.equal(resolveRefreshTokenExpiresIn('60d', 'production'), '60d');
  assert.throws(
    () => resolveRefreshTokenExpiresIn('12h', 'production'),
    /between 1d and 90d/
  );
  assert.throws(
    () => resolveRefreshTokenExpiresIn('180d', 'production'),
    /between 1d and 90d/
  );
  assert.equal(DEFAULT_REFRESH_TOKEN_EXPIRES_IN, '60d');

  assert.doesNotThrow(() => assertProductionJwtAuthConfig({ ...PROD_OK }));
  assert.doesNotThrow(() =>
    assertProductionJwtAuthConfig({
      ...PROD_OK,
      nodeEnv: 'development',
      jwtSecret: DEFAULT_DEV_JWT_SECRET,
      refreshTokenEnabled: false,
      legacyJwtIssuanceEndAt: null,
    })
  );
  assert.throws(
    () => assertProductionJwtAuthConfig({ ...PROD_OK, refreshTokenEnabled: false }),
    /REFRESH_TOKEN_ENABLED/
  );
  assert.throws(
    () => assertProductionJwtAuthConfig({ ...PROD_OK, legacyJwtIssuanceEndAt: null }),
    /LEGACY_JWT_ISSUANCE_END_AT/
  );
  assert.throws(
    () => assertProductionJwtSecret({ nodeEnv: 'production', jwtSecret: 'short' }),
    /at least 32|JWT_SECRET must be set/
  );
  assert.doesNotThrow(() =>
    assertProductionJwtSecret({ nodeEnv: 'production', jwtSecret: STRONG_SECRET })
  );

  console.log('jwtAuthConfig.test.ts: ok');
}

run();
