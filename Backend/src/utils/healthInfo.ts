import { config } from '../config/env';
import { DEV_DB_NAMES, getDatabaseUrl, isProdDatabaseUrl } from './dbEnvironment';

export function buildHealthPayload() {
  const dbName = config.db.name;
  const dbUrl = getDatabaseUrl();
  const e2eDatabaseAllowed =
    DEV_DB_NAMES.has(dbName) &&
    !isProdDatabaseUrl(dbUrl);

  return {
    status: 'ok',
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
