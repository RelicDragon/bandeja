#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const swPath = join(__dirname, '..', 'public', 'sw.js');

try {
  let swContent = readFileSync(swPath, 'utf-8');
  
  const versionRegex = /const CACHE_VERSION = '([^']+)';/;
  const match = swContent.match(versionRegex);
  
  if (!match) {
    console.error('✗ Could not find CACHE_VERSION in sw.js');
    process.exit(1);
  }
  
  const currentVersion = match[1];
  const versionMatch = currentVersion.match(/^v(\d+)$/);
  
  if (!versionMatch) {
    console.error('✗ CACHE_VERSION format should be "v{number}" (e.g., "v1")');
    process.exit(1);
  }
  
  const versionNumber = parseInt(versionMatch[1], 10);
  const newVersion = `v${versionNumber + 1}`;
  
  swContent = swContent.replace(versionRegex, `const CACHE_VERSION = '${newVersion}';`);
  
  writeFileSync(swPath, swContent, 'utf-8');
  console.log(`✓ Service worker version updated: ${currentVersion} → ${newVersion}`);
} catch (error) {
  console.error('✗ Failed to update service worker version:', error.message);
  process.exit(1);
}
