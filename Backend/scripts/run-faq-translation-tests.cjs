const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
require('dotenv').config();

async function main() {
  if (!process.env.DB_URL) throw new Error('DB_URL required');
  const url = new URL(process.env.DB_URL);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/padelpulse_dev') {
    throw new Error('FAQ integration tests require local padelpulse_dev');
  }
  const schema = 'faq_translation_test';
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  try { await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`); }
  finally { await client.end(); }
  url.searchParams.set('schema', schema);
  const env = { ...process.env, DB_URL: url.toString(), DB_SCHEMA: schema };
  delete env.SHADOW_DB_URL;
  for (const [command, args] of [
    ['./node_modules/.bin/prisma', ['migrate', 'deploy']],
    ['./node_modules/.bin/ts-node', ['--transpile-only', 'src/services/faq/faqTranslator.test.ts']],
    ['./node_modules/.bin/ts-node', ['--transpile-only', 'src/services/faq/faqTranslation.integration.test.ts']],
  ]) {
    const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
