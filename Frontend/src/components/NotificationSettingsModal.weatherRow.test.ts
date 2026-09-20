/**
 * PRD 357 — the "Weather alerts" preference row.
 *
 * `NotificationSettingsModal` is a large stateful overlay; rendering it needs
 * the whole auth/query stack. What actually has to hold for this PRD is
 * structural, and a structural test survives the modal being restyled:
 *
 *  - the row exists, sits under the reminders row, and is wired to the
 *    `sendWeatherAlerts` column the backend preference key points at;
 *  - its copy keys resolve in all 11 locales, with the "Only for outdoor
 *    courts" helper the PRD asks for;
 *  - it defaults to on, so a user who has never opened the modal still gets
 *    alerts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;
const ROOT = process.cwd();

const modalSource = readFileSync(
  join(ROOT, 'src/components/NotificationSettingsModal.tsx'),
  'utf8',
);
const apiSource = readFileSync(join(ROOT, 'src/api/users.ts'), 'utf8');

describe('weather alerts preference row', () => {
  it('is a toggle key, directly after reminders', () => {
    const declaration = modalSource.slice(modalSource.indexOf('const TOGGLE_KEYS'));
    const keys = declaration
      .slice(declaration.indexOf('= [') + 3, declaration.indexOf('];'))
      .split('\n')
      .map((line) => line.trim().replace(/[',]/g, ''))
      .filter((line) => line.startsWith('send'));
    expect(keys).toContain('sendWeatherAlerts');
    expect(keys[keys.indexOf('sendWeatherAlerts') - 1]).toBe('sendReminders');
  });

  it('has a label and the "outdoor courts" helper', () => {
    expect(modalSource).toContain(
      "sendWeatherAlerts: { label: 'profile.sendWeatherAlerts', desc: 'profile.sendWeatherAlertsDescription' }",
    );
  });

  it('normalises a missing value to on', () => {
    expect(modalSource).toContain('sendWeatherAlerts: p.sendWeatherAlerts ?? true');
  });

  it('is part of the API preference type', () => {
    expect(apiSource).toMatch(/sendWeatherAlerts:\s*boolean/);
  });

  for (const locale of LOCALES) {
    it(`has ${locale} copy for the row`, () => {
      const profile = JSON.parse(
        readFileSync(join(ROOT, `src/i18n/locales/${locale}/profile.json`), 'utf8'),
      ) as { profile: Record<string, string> };
      expect(typeof profile.profile.sendWeatherAlerts).toBe('string');
      expect(profile.profile.sendWeatherAlerts.length).toBeGreaterThan(0);
      expect(typeof profile.profile.sendWeatherAlertsDescription).toBe('string');
      expect(profile.profile.sendWeatherAlertsDescription.length).toBeGreaterThan(0);
    });
  }
});
