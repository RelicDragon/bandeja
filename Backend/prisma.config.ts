import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DB_URL'),
    shadowDatabaseUrl: env('SHADOW_DB_URL'),
  },
});
