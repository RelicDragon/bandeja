import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLIENT_CUSTOM_REQUEST_HEADERS,
  CORS_ALLOWED_HEADERS,
  CORS_EXPOSED_HEADERS,
} from './corsHeaders';

const FRONTEND_SRC = path.resolve(__dirname, '../../../Frontend/src');

/** Response headers the client reads back; these belong in exposedHeaders, not allowedHeaders. */
const RESPONSE_ONLY_HEADERS = new Set(CORS_EXPOSED_HEADERS.map((h) => h.toLowerCase()));

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Matches `headers['X-Foo'] =` and `'X-Foo':` inside a headers object literal. */
const HEADER_ASSIGN = /headers\[\s*['"](X-[A-Za-z0-9-]+)['"]\s*\]\s*=/g;
const HEADER_LITERAL = /headers:\s*\{[^}]*?['"](X-[A-Za-z0-9-]+)['"]\s*:/gs;

function clientRequestHeadersFromSource(): Set<string> {
  const found = new Set<string>();
  for (const file of collectTsFiles(FRONTEND_SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of [HEADER_ASSIGN, HEADER_LITERAL]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) != null) {
        const header = m[1]!;
        if (!RESPONSE_ONLY_HEADERS.has(header.toLowerCase())) found.add(header);
      }
    }
  }
  return found;
}

function run(): void {
  const allowed = new Set(CORS_ALLOWED_HEADERS.map((h) => h.toLowerCase()));

  for (const header of CLIENT_CUSTOM_REQUEST_HEADERS) {
    assert(allowed.has(header.toLowerCase()), `${header} must be in CORS_ALLOWED_HEADERS`);
  }

  // Native builds are cross-origin, so a header the client sends but CORS omits is
  // silently dropped by the browser and never reaches the server. Catch that here.
  if (fs.existsSync(FRONTEND_SRC)) {
    const sent = clientRequestHeadersFromSource();
    assert(sent.size > 0, 'expected to find client request headers in Frontend/src');
    const missing = [...sent].filter((h) => !allowed.has(h.toLowerCase()));
    assert.deepEqual(
      missing,
      [],
      `Frontend sends header(s) the backend CORS allowedHeaders omits: ${missing.join(', ')}`
    );
  }

  console.log('corsHeaders.test.ts: ok');
}

run();
