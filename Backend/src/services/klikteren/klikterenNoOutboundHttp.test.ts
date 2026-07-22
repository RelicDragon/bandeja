import fs from 'fs';
import path from 'path';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Only the dedicated upstream proxy may call api.klikteren.com (CORS forces BE hop). */
const ALLOWED_OUTBOUND = new Set(['klikteren/klikterenUpstream.service.ts']);

const outboundPatterns = [
  /https:\/\/api\.klikteren\.com/,
  /fetch\s*\(\s*[`'"]https:\/\/api\.klikteren\.com/,
];

function run(): void {
  const srcRoot = path.join(__dirname, '..');
  const files = walkTsFiles(srcRoot);
  const offenders: string[] = [];

  for (const file of files) {
    const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
    if (ALLOWED_OUTBOUND.has(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (outboundPatterns.some((pattern) => pattern.test(text))) {
      offenders.push(rel);
    }
  }

  assert(
    offenders.length === 0,
    `Backend/src must not call Klikteren HTTP outside upstream proxy: ${offenders.join(', ')}`,
  );
  console.log('klikterenNoOutboundHttp.test.ts: all passed');
}

run();
