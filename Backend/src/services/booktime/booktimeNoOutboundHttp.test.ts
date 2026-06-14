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

const outboundPatterns = [
  /BOOKTIME_API_URL/,
  /fetch\s*\(\s*[`'"]https:\/\/api\.booktime\.rs/,
  /fetch\s*\(\s*`\$\{BOOKTIME_API_URL/,
];

function run(): void {
  const srcRoot = path.join(__dirname, '..');
  const files = walkTsFiles(srcRoot);
  const offenders: string[] = [];

  for (const file of files) {
    const rel = path.relative(srcRoot, file);
    const text = fs.readFileSync(file, 'utf8');
    if (outboundPatterns.some((pattern) => pattern.test(text))) {
      offenders.push(rel);
    }
  }

  assert(offenders.length === 0, `Backend/src runtime must not call Booktime HTTP: ${offenders.join(', ')}`);
  console.log('booktimeNoOutboundHttp.test.ts: all passed');
}

run();
