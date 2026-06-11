import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// prisma generate only loads this config; it does not connect. Fallback lets CI typecheck without DB_URL.
const FALLBACK_DB_URL =
  'postgresql://postgres:postgres@localhost:5432/padelpulse_dev?schema=padelpulse';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DB_URL ?? FALLBACK_DB_URL,
    shadowDatabaseUrl: process.env.SHADOW_DB_URL,
  },
});
