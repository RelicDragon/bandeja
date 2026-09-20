/**
 * PRD 347 — the two chat system messages, "A spot opened (Luka left)" and
 * "Ana was seated from the queue".
 *
 * Guards the whole chain: the type exists on both sides of the wire, the
 * English copy is present in `chat.json` for every locale, and the neutral
 * system-style template interpolates `{{userName}}`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SystemMessageType, parseSystemMessage } from '@/utils/systemMessages';

const LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;

const KEYS = ['GAME_SPOT_OPENED', 'GAME_SEAT_AUTO_FILLED'] as const;

function chatSystemMessages(locale: string): Record<string, unknown> {
  const raw = readFileSync(
    join(process.cwd(), 'src/i18n/locales', locale, 'chat.json'),
    'utf8',
  );
  return (JSON.parse(raw) as { chat: { systemMessages: Record<string, unknown> } }).chat
    .systemMessages;
}

describe('spot-opened system messages', () => {
  it('declares both types on the client enum', () => {
    expect(SystemMessageType.GAME_SPOT_OPENED).toBe('GAME_SPOT_OPENED');
    expect(SystemMessageType.GAME_SEAT_AUTO_FILLED).toBe('GAME_SEAT_AUTO_FILLED');
  });

  it('parses the backend payload shape', () => {
    const parsed = parseSystemMessage(
      JSON.stringify({ type: 'GAME_SEAT_AUTO_FILLED', variables: { userName: 'Ana' } }),
    );
    expect(parsed).toEqual({
      type: SystemMessageType.GAME_SEAT_AUTO_FILLED,
      variables: { userName: 'Ana' },
    });
  });

  it('has translated copy with the {{userName}} placeholder in every locale', () => {
    for (const locale of LOCALES) {
      const messages = chatSystemMessages(locale);
      for (const key of KEYS) {
        const value = messages[key];
        expect(typeof value, `${locale}.${key}`).toBe('string');
        expect(value as string, `${locale}.${key}`).toContain('{{userName}}');
      }
    }
  });

  it('is actually translated, not an English copy', () => {
    const english = chatSystemMessages('en');
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const messages = chatSystemMessages(locale);
      for (const key of KEYS) {
        expect(messages[key], `${locale}.${key}`).not.toBe(english[key]);
      }
    }
  });
});
