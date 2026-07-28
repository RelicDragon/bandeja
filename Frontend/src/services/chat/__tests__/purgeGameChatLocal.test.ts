import { describe, expect, it } from 'vitest';
import {
  isGameChatChannelDeniedHttpError,
  isGameChatContextGoneHttpError,
  shouldPurgeGameChatOnHttpError,
} from '@/services/chat/purgeGameChatLocal';

describe('purgeGameChatLocal http helpers', () => {
  it('treats 404 and 403 as gone for game-scoped sync', () => {
    expect(isGameChatContextGoneHttpError({ response: { status: 404 } })).toBe(true);
    expect(isGameChatContextGoneHttpError({ response: { status: 403 } })).toBe(true);
    expect(isGameChatContextGoneHttpError({ response: { status: 500 } })).toBe(false);
  });

  it('does not treat chat.threadArchived 403 as gone', () => {
    const err = { response: { status: 403, data: { code: 'chat.threadArchived' } } };
    expect(isGameChatContextGoneHttpError(err)).toBe(false);
    expect(shouldPurgeGameChatOnHttpError(err, 'PUBLIC')).toBe(false);
  });

  it('purges on PUBLIC/undefined 403 but not PRIVATE/ADMINS', () => {
    const err = { response: { status: 403 } };
    expect(shouldPurgeGameChatOnHttpError(err, 'PUBLIC')).toBe(true);
    expect(shouldPurgeGameChatOnHttpError(err, undefined)).toBe(true);
    expect(shouldPurgeGameChatOnHttpError(err, 'PRIVATE')).toBe(false);
    expect(shouldPurgeGameChatOnHttpError(err, 'ADMINS')).toBe(false);
    expect(isGameChatChannelDeniedHttpError(err, 'PRIVATE')).toBe(true);
    expect(isGameChatChannelDeniedHttpError(err, 'PUBLIC')).toBe(false);
  });
});
