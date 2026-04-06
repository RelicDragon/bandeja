import type { TFunction } from 'i18next';
import { VOICE_TRANSCRIPTION_NO_SPEECH } from '@/constants/voiceTranscription';

/** Matches Backend `resolveTranscriptionText` echoed-token cleanup (legacy rows in DB). */
const ECHOED_NO_SPEECH_PATTERN = /^__PP[_A-Z0-9]*TRANSCRIPTION[_A-Z0-9_]*__$/i;

export function isVoiceTranscriptionNoSpeech(raw: string | null | undefined): boolean {
  const t = (raw?.trim() ?? '').replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!t) return false;
  return t === VOICE_TRANSCRIPTION_NO_SPEECH || ECHOED_NO_SPEECH_PATTERN.test(t);
}

export function formatVoiceTranscriptionForDisplay(raw: string | null | undefined, t: TFunction): string {
  if (!raw?.trim()) return '';
  if (isVoiceTranscriptionNoSpeech(raw)) {
    return t('chat.voice.noSpeechTranscription', { defaultValue: "Couldn't detect any speech." });
  }
  return raw;
}
