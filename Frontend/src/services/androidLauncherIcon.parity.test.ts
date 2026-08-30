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

  it('repairs entry activities before the trampoline launches MainActivity', () => {
    const launcher = androidFile('java/com/funified/bandeja/LauncherActivity.java');
    const application = androidFile('java/com/funified/bandeja/BandejaApp.java');
    const repair = androidFile(
      'java/com/funified/bandeja/branding/LauncherComponentRepair.java',
    );

    expect(launcher.indexOf('LauncherComponentRepair.repair(this)')).toBeLessThan(
      launcher.indexOf('startActivity(destination)'),
    );
    expect(application).toContain('LauncherComponentRepair.repair(this)');
    expect(repair).toContain('MainActivity.class');
    expect(repair).toContain('LauncherActivity.class');
    expect(repair).toContain('COMPONENT_ENABLED_STATE_ENABLED');
  });

  it('repairs persisted component overrides after an app update', () => {
    const manifest = androidFile('AndroidManifest.xml');
    const receiver = androidFile(
      'java/com/funified/bandeja/branding/LauncherComponentRepairReceiver.java',
    );

    expect(manifest).toContain('.branding.LauncherComponentRepairReceiver');
    expect(manifest).toContain('android.intent.action.MY_PACKAGE_REPLACED');
    expect(receiver).toContain('LauncherComponentRepair.repair(context)');
  });
});
