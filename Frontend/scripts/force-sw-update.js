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
  
  let updatedContent = swContent;
  
  if (swContent.includes('Date.now()')) {
    updatedContent = swContent.replace(
      /const CACHE_VERSION\s*=\s*Date\.now\(\);?/g,
      `const CACHE_VERSION = ${buildTimestamp};`
    );
    
    if (updatedContent === swContent) {
      updatedContent = swContent.replace(
        /CACHE_VERSION\s*=\s*Date\.now\(\)/g,
        `CACHE_VERSION = ${buildTimestamp}`
      );
    }
  }
  
  if (updatedContent === swContent || !updatedContent.includes(String(buildTimestamp))) {
    const buildComment = `\n// Build timestamp: ${buildTimestamp}`;
    updatedContent = swContent.trimEnd() + buildComment;
  }
  
  writeFileSync(swPath, updatedContent, 'utf-8');
  console.log(`✓ Service worker updated with build timestamp: ${buildTimestamp}`);
} catch (error) {
  console.error('✗ Failed to update service worker:', error.message);
  process.exit(1);
}

