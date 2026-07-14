/**
 * Regenerate `src/deepLinks/catalog.mirror.json` from the TS catalog SoT.
 * Usage: npm run sync:deep-link-catalog
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeDeepLinkCatalogMirror } from '../src/deepLinks/catalog.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '../src/deepLinks/catalog.mirror.json');
const mirror = serializeDeepLinkCatalogMirror();
writeFileSync(outPath, `${JSON.stringify(mirror, null, 2)}\n`, 'utf8');
console.log(`wrote ${outPath}`);
