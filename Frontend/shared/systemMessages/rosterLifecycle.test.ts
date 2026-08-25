import { describe, expect, it } from 'vitest';
import {
  isInviteOnlyChatViewerStatus,
  isRosterLifecycleSystemMessageContent,
  isRosterLifecycleSystemMessagePayload,
  isRosterLifecycleSystemPreview,
  shouldHideRosterLifecycleSystemMessage,
} from './rosterLifecycle';

const joined = JSON.stringify({
  type: 'USER_JOINED_GAME',
  variables: { userName: 'Alex' },
  text: 'Alex joined the game',
});

describe('rosterLifecycle', () => {
  it('treats invited and guest as invite-only viewers', () => {
    expect(isInviteOnlyChatViewerStatus('INVITED')).toBe(true);
    expect(isInviteOnlyChatViewerStatus('GUEST')).toBe(true);
    expect(isInviteOnlyChatViewerStatus('PLAYING')).toBe(false);
    expect(isInviteOnlyChatViewerStatus('IN_QUEUE')).toBe(false);
  });

  it('detects roster system messages and list previews', () => {
    expect(isRosterLifecycleSystemMessageContent(joined)).toBe(true);
    expect(isRosterLifecycleSystemPreview(`[TYPE:SYSTEM]${joined}`)).toBe(true);
    expect(isRosterLifecycleSystemMessageContent('hello')).toBe(false);
    expect(
      isRosterLifecycleSystemMessageContent(
        JSON.stringify({ type: 'GAME_DATE_TIME_CHANGED', variables: { dateTime: 'soon' } })
      )
    ).toBe(false);
  });

  it('hides roster updates from invite-only viewers only', () => {
    expect(
      shouldHideRosterLifecycleSystemMessage({
        participantStatus: 'INVITED',
        senderId: null,
        content: joined,
      })
    ).toBe(true);
    expect(
      shouldHideRosterLifecycleSystemMessage({
        participantStatus: 'GUEST',
        senderId: null,
        content: joined,
      })
    ).toBe(true);
    expect(
      shouldHideRosterLifecycleSystemMessage({
        participantStatus: 'PLAYING',
        senderId: null,
        content: joined,
      })
    ).toBe(false);
    expect(
      shouldHideRosterLifecycleSystemMessage({
        participantStatus: 'INVITED',
        senderId: 'user-1',
        content: 'normal message',
      })
    ).toBe(false);
  });

  it('reads roster type from chat emit payloads', () => {
    expect(isRosterLifecycleSystemMessagePayload({ message: { content: joined } })).toBe(true);
    expect(isRosterLifecycleSystemMessagePayload({ message: { content: 'hi' } })).toBe(false);
  });
});
