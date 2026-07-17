import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANDROID_APP_PACKAGE, ANDROID_APP_SCHEME } from './telegramAppHandoff';

const manifest = readFileSync(
  new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url),
  'utf8'
);
const buildGradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8');

describe('Telegram Android native handoff contract', () => {
  it('registers the same package and custom scheme used by the browser intent', () => {
    expect(buildGradle).toContain(`applicationId "${ANDROID_APP_PACKAGE}"`);
    expect(manifest).toContain(
      `<data android:scheme="${ANDROID_APP_SCHEME}" android:host="bandeja.me" />`
    );
    expect(manifest).toContain('<category android:name="android.intent.category.BROWSABLE" />');
  });
});
