/**
 * Pure helpers for agent voice (docs/domains/agent.md § Voice): transcript cleanup, the
 * speech text guard, charges and the transcription vocabulary prompt.
 */
import { AGENT_VOICE_MAX_AUDIO_MS, AGENT_VOICE_SPEECH_MAX_CHARS } from '@bandeja/shared/agentContract';

/**
 * Lines speech-to-text models are known to invent for silence or noise (subtitle credits,
 * outro phrases). A transcript that is only one of these counts as "no speech".
 */
const NO_SPEECH_PATTERNS: readonly RegExp[] = [
  /amara\.org/i,
  /^(thank you|thanks) (so much )?for watching[.!]*$/i,
  /^please subscribe[.!]*$/i,
  /^you[.!]*$/i,
  /субтитр/i,
  /dimatorzok/i,
  /^продолжение следует[.…]*$/i,
  /^спасибо за просмотр[.!]*$/i,
  /^sous-titr/i,
  /^untertitel/i,
  /^subtítulos (realizados )?por/i,
];

/** Trimmed transcript, or '' when it is empty or a known silence hallucination. */
export function cleanAgentVoiceTranscript(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const bare = text.replace(/^["'«»`]+|["'«»`]+$/g, '').trim();
  if (!bare || !/[\p{L}\p{N}]/u.test(bare)) return '';
  if (NO_SPEECH_PATTERNS.some((re) => re.test(bare))) return '';
  return text;
}

/**
 * Text accepted by `/voice/speech`: whitespace collapsed, control characters dropped, capped.
 * The client already turned markdown into speakable text; this is only a guard.
 */
export function normalizeAgentSpeechText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AGENT_VOICE_SPEECH_MAX_CHARS);
}

/**
 * Audio length to charge: the parsed container duration when there is one, else the
 * client's own measure, else a bitrate estimate (32 kbit/s). Never under 1 s.
 */
export function agentVoiceChargeDurationMs(params: {
  parsedMs: number | null;
  clientMs: number | null;
  bytes: number;
}): number {
  const valid = (ms: number | null): ms is number => ms != null && Number.isFinite(ms) && ms > 0;
  const estimate = Math.round((params.bytes * 8) / 32);
  const ms = valid(params.parsedMs) ? params.parsedMs : valid(params.clientMs) ? params.clientMs : estimate;
  return Math.max(1000, Math.min(AGENT_VOICE_MAX_AUDIO_MS, Math.round(ms)));
}

export function agentVoiceTranscriptionCharge(durationMs: number, tokensPerSecond: number): number {
  return Math.ceil(durationMs / 1000) * Math.max(0, tokensPerSecond);
}

export function agentVoiceSpeechCharge(text: string, tokensPerChar: number): number {
  return text.length * Math.max(0, tokensPerChar);
}

const VOCABULARY_MAX_CHARS = 700;

/**
 * Transcription prompt: names the model would otherwise mishear (the user's first name, the
 * clubs of their home city) plus sport words. Names only, no sentences, so it does not push
 * the transcript toward one language.
 */
export function buildAgentVoiceVocabulary(params: { firstName: string | null; clubNames: readonly string[] }): string {
  const words = [
    'Bandeja',
    'padel',
    'pickleball',
    ...(params.firstName?.trim() ? [params.firstName.trim()] : []),
    ...params.clubNames.map((name) => name.replace(/\s+/g, ' ').trim()).filter(Boolean),
  ];
  const seen = new Set<string>();
  let out = '';
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const next = out ? `${out}, ${word}` : word;
    if (next.length > VOCABULARY_MAX_CHARS) break;
    out = next;
  }
  return out;
}

/** `audio/webm;codecs=opus` → `webm`: the filename extension the provider sniffs the format from. */
export function agentVoiceFileExtension(mimeType: string): string | null {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
  };
  return map[base] ?? null;
}
