import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AAB_OUTPUT,
  EXPORT_OPTIONS_PLIST,
  FRONTEND_DIR,
  PRODUCTION_VITE_ENV,
  resolveIpaOutputPath,
  runBuildPreflight,
} from './app-release-build';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(PRODUCTION_VITE_ENV.VITE_API_BASE_URL === 'https://bandeja.me/api', 'production API URL');
assert(PRODUCTION_VITE_ENV.VITE_MEDIA_BASE_URL === 'https://bandeja.me', 'production media URL');
assert(!PRODUCTION_VITE_ENV.VITE_API_BASE_URL.includes('localhost'), 'production env avoids localhost');

assert(path.isAbsolute(AAB_OUTPUT), 'AAB output path is absolute');
assert(AAB_OUTPUT.endsWith('app-release.aab'), 'AAB output filename');

assert(fs.existsSync(FRONTEND_DIR), 'Frontend directory exists');
assert(fs.existsSync(EXPORT_OPTIONS_PLIST), 'iOS export plist exists');

const preflight = runBuildPreflight();
assert(Array.isArray(preflight.issues), 'preflight returns issues array');
assert(typeof preflight.ok === 'boolean', 'preflight returns ok boolean');

const tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-ipa-'));
const ipaPath = path.join(tempExportDir, 'App.ipa');
fs.writeFileSync(ipaPath, 'test');
assert(resolveIpaOutputPath(tempExportDir) === path.resolve(ipaPath), 'resolveIpaOutputPath finds IPA');
assert(path.isAbsolute(resolveIpaOutputPath(tempExportDir)), 'resolveIpaOutputPath returns absolute path');
fs.rmSync(tempExportDir, { recursive: true, force: true });

console.log('app-release-build tests: OK');
