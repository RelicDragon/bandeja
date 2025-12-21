#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distPath = join(__dirname, '..', 'dist');
const swPath = join(distPath, 'sw.js');

try {
  const buildTimestamp = Date.now();
  const swContent = readFileSync(swPath, 'utf-8');
  
  const buildComment = `\n// Build: ${buildTimestamp}\n// Note: CACHE_VERSION is managed manually. Update it in sw.js when you need to force cache refresh.`;
  const updatedContent = swContent.trimEnd() + buildComment;
  
  writeFileSync(swPath, updatedContent, 'utf-8');
  console.log(`✓ Service worker build timestamp added: ${buildTimestamp}`);
} catch (error) {
  console.error('✗ Failed to update service worker:', error.message);
  process.exit(1);
}

