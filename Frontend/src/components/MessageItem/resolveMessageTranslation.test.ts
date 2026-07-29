import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/api/chat';
import { resolveMessageTranslation } from './resolveMessageTranslation';

const message = {
  translation: { languageCode: 'en', translation: 'Hello everyone!' },
  translations: [
    { languageCode: 'en', translation: 'Hello everyone!' },
    { languageCode: 'ru', translation: 'Всем привет!' },
    { languageCode: 'sr', translation: 'Zdravo svima!' },
  ],
} as ChatMessage;

describe('resolveMessageTranslation', () => {
  it('uses the preferred incoming translation language instead of the app language', () => {
    expect(
      resolveMessageTranslation(message, {
        language: 'en-GB',
        translateToLanguage: 'ru',
      })
    ).toEqual({ languageCode: 'ru', translation: 'Всем привет!' });
  });

  it('shows the original instead of another language when the preferred translation is absent', () => {
    expect(
      resolveMessageTranslation(
        {
          translation: { languageCode: 'en', translation: 'Hello everyone!' },
          translations: [
            { languageCode: 'en', translation: 'Hello everyone!' },
            { languageCode: 'sr', translation: 'Zdravo svima!' },
          ],
        },
        {
          language: 'en-GB',
          translateToLanguage: 'ru',
        }
      )
    ).toBeUndefined();
  });
});
