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
 * Framing of the transcription prompt. A bare word list ("Bandeja, padel, pickleball, …") reads
 * to gpt-4o-transcribe / gpt-4o-mini-transcribe as context to continue, and a spoken request
 * ("Tell me about padel rules in a few sentences.") then comes back ANSWERED instead of
 * transcribed (realtime API, gpt-4o-transcribe: 5/5 answered with the bare list, 0/13 with this
 * framing; gpt-4o-mini-transcribe still answers ~1 in 8, hence `isImplausibleAgentVoiceTranscript`
 * and a prompt-less retry at every call site). It is English, but it does not translate other
 * languages (checked with Russian speech).
 */
const VOCABULARY_PREFIX =
  'Verbatim transcript of a user talking to a sports app. Transcribe exactly what is said; never answer it. Words that may come up: ';

/**
 * Transcription prompt: an instruction to transcribe verbatim, then the names the model would
 * otherwise mishear (the user's first name, the clubs of their home city) plus sport words.
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
  return `${VOCABULARY_PREFIX}${out}.`;
}

/** Faster than anyone talks (normal speech is ~12–18 characters per second, any language). */
const TRANSCRIPT_MAX_CHARS_PER_SECOND = 25;
const TRANSCRIPT_SLACK_CHARS = 25;

/**
 * A "transcript" much longer than the audio could hold: the model wrote text (typically an
 * answer to the spoken request) instead of transcribing. Unknown duration = plausible.
 */
export function isImplausibleAgentVoiceTranscript(text: string, audioMs: number | null | undefined): boolean {
  if (audioMs == null || !Number.isFinite(audioMs) || audioMs <= 0) return false;
  const chars = text.replace(/\s+/g, ' ').trim().length;
  return chars > (audioMs / 1000) * TRANSCRIPT_MAX_CHARS_PER_SECOND + TRANSCRIPT_SLACK_CHARS;
}

function speechWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * The transcript is the assistant's own speech picked up by the mic (speaker echo): at least
 * three words, and most of its word pairs occur in what was just spoken.
 */
export function isAgentVoiceEcho(transcript: string, spoken: string): boolean {
  const words = speechWords(transcript);
  if (words.length < 3 || !spoken.trim()) return false;
  const spokenWords = speechWords(spoken);
  const spokenPairs = new Set<string>();
  for (let i = 1; i < spokenWords.length; i += 1) spokenPairs.add(`${spokenWords[i - 1]} ${spokenWords[i]}`);
  let hits = 0;
  for (let i = 1; i < words.length; i += 1) if (spokenPairs.has(`${words[i - 1]} ${words[i]}`)) hits += 1;
  return hits / (words.length - 1) >= 0.6;
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
