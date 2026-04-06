import type { TFunction } from 'i18next';
import { VOICE_TRANSCRIPTION_NO_SPEECH } from '@/constants/voiceTranscription';

export function isVoiceTranscriptionNoSpeech(raw: string | null | undefined): boolean {
  return (raw?.trim() ?? '') === VOICE_TRANSCRIPTION_NO_SPEECH;
}

export function formatVoiceTranscriptionForDisplay(raw: string | null | undefined, t: TFunction): string {
  if (!raw?.trim()) return '';
  if (isVoiceTranscriptionNoSpeech(raw)) {
    return t('chat.voice.noSpeechTranscription', { defaultValue: "Couldn't detect any speech." });
  }
  return raw;
}
