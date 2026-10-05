/**
 * Every key this feature uses exists in `en/courtReservation.json`
 * (the namespace guard only checks files whose sole hook is
 * `useTranslation('courtReservation')`; most of our strings go through
 * helpers that take `t`). Plural keys count when `_one`/`_other` exist.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COURT_RESERVATION_I18N_KEYS } from '@shared/gameBooking/reservationCopy';
import en from '@/i18n/locales/en/courtReservation.json';
import { toNamespaceKey } from './reservationText';

const DIR = join(process.cwd(), 'src/features/court-reservations');
const SECTIONS = ['card', 'action', 'sheet', 'move', 'run', 'banner', 'drift', 'followUp', 'duration', 'slot', 'summary', 'reschedule'];
const KEY_RE = new RegExp(`['\`]((?:${SECTIONS.join('|')})\\.[A-Za-z_.]+)['\`]`, 'g');

function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en.courtReservation);
}

function exists(key: string): boolean {
  return typeof lookup(key) === 'string' || (typeof lookup(`${key}_one`) === 'string' && typeof lookup(`${key}_other`) === 'string');
}

describe('courtReservation i18n keys', () => {
  it('every key literal in the feature exists in English', () => {
    const missing: string[] = [];
    for (const file of readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
      const text = readFileSync(join(DIR, file), 'utf8');
      for (const m of text.matchAll(KEY_RE)) if (!exists(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('every shared reservationCopy key resolves inside the owned namespace', () => {
    const all = Object.values(COURT_RESERVATION_I18N_KEYS).flatMap((group) => Object.values(group));
    expect(all.filter((key) => !exists(toNamespaceKey(key)))).toEqual([]);
  });

  it('never uses the forbidden vocabulary', () => {
    const text = JSON.stringify(en).toLowerCase();
    for (const word of ['game only', 'fully booked', 'booked']) expect(text).not.toContain(word);
  });
});
