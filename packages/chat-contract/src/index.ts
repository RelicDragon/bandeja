import {
  ChatSyncEventType as chatSyncEventTypeValues,
  CHAT_SYNC_EVENT_TYPES as chatSyncEventTypes,
} from './chatSyncEventType';
import {
  MESSAGE_TRANSLATION_PENDING as messageTranslationPending,
  MESSAGE_TRANSCRIPTION_PENDING as messageTranscriptionPending,
  MESSAGE_TRANSCRIPTION_NO_SPEECH as messageTranscriptionNoSpeech,
  isMessageTranslationPending,
} from './sentinels';
import { normalizeClientMutationId } from './clientMutationId';

export const ChatSyncEventType = chatSyncEventTypeValues;
export type ChatSyncEventTypeValue = (typeof ChatSyncEventType)[keyof typeof ChatSyncEventType];
export const CHAT_SYNC_EVENT_TYPES = chatSyncEventTypes;
export const MESSAGE_TRANSLATION_PENDING = messageTranslationPending;
export const MESSAGE_TRANSCRIPTION_PENDING = messageTranscriptionPending;
export const MESSAGE_TRANSCRIPTION_NO_SPEECH = messageTranscriptionNoSpeech;
export { isMessageTranslationPending, normalizeClientMutationId };
