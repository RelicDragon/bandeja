import { config } from '../config/env';

export const DEV_DB_NAMES = new Set(['padelpulse_dev', 'padelpulse_shadow']);

export const PROD_DB_URL_MARKERS = [
  'bandeja.com',
  'back.bandeja.com',
  'thepadel',
  'rds.amazonaws',
  'hetzner',
  '.prod.',
  '/prod',
];

export function getDatabaseUrl(): string {
  return (process.env.DB_URL || process.env.DATABASE_URL || '').toLowerCase();
}

export function isProdDatabaseUrl(dbUrl = getDatabaseUrl()): boolean {
  if (!dbUrl) return false;
  if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
    return PROD_DB_URL_MARKERS.some((marker) => dbUrl.includes(marker));
  }
  return PROD_DB_URL_MARKERS.some((marker) => dbUrl.includes(marker));
}

export function isDevDatabaseName(dbName = config.db.name): boolean {
  return DEV_DB_NAMES.has(dbName);
}

export function isDevDatabase(): boolean {
  const dbUrl = getDatabaseUrl();
  return isDevDatabaseName() && !isProdDatabaseUrl(dbUrl);
}

export function isProdLikeDatabase(): boolean {
  return isProdDatabaseUrl() || !isDevDatabaseName();
}
