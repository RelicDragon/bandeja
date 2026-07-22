import { config } from '../config/env';
import { DEV_DB_NAMES, getDatabaseUrl, isProdDatabaseUrl } from './dbEnvironment';

/** Public liveness payload — no env/DB reconnaissance fields. */
export function buildPublicHealthPayload() {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  };
}

/** Detailed probe for ops/CI (admin or loopback only). */
export function buildDetailedHealthPayload() {
  const dbName = config.db.name;
  const dbUrl = getDatabaseUrl();
  const e2eDatabaseAllowed =
    DEV_DB_NAMES.has(dbName) &&
    !isProdDatabaseUrl(dbUrl);

  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    database: {
      name: dbName,
      e2eSafe: e2eDatabaseAllowed,
    },
    runtime: {
      nodeEnv: config.nodeEnv,
    },
  };
}

/** @deprecated Use buildPublicHealthPayload or buildDetailedHealthPayload */
export function buildHealthPayload() {
  return buildPublicHealthPayload();
}
