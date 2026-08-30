import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const androidFile = (relativePath: string) =>
  readFileSync(new URL(`../../android/app/src/main/${relativePath}`, import.meta.url), 'utf8');

describe('Android launcher icon task topology', () => {
  it('routes every mutable launcher alias through the disposable trampoline', () => {
    const manifest = androidFile('AndroidManifest.xml');
    const aliases = [...manifest.matchAll(/<activity-alias[\s\S]*?<\/activity-alias>/g)].map(
      (match) => match[0],
    );

    expect(aliases).toHaveLength(7);
    for (const alias of aliases) {
      expect(alias).toContain('android:targetActivity=".LauncherActivity"');
    }
  });

  it('keeps the Capacitor MainActivity outside launcher-component mutations', () => {
    const launcher = androidFile('java/com/funified/bandeja/LauncherActivity.java');
    const plugin = androidFile(
      'java/com/funified/bandeja/branding/LauncherIconPlugin.java',
    );
    const mainActivity = androidFile('java/com/funified/bandeja/MainActivity.java');

    expect(launcher).toContain('new Intent(this, MainActivity.class)');
    expect(mainActivity).toContain('registerPlugin(LauncherIconPlugin.class)');
    expect(plugin).toContain('packageName + "." + alias');
    expect(plugin).not.toMatch(/new ComponentName\([^\n]+MainActivity/);
    expect(plugin).not.toMatch(/packageName \+ "\.MainActivity"/);
  });
});
