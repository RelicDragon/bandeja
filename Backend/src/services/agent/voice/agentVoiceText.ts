/**
 * Pure helpers for agent voice (docs/domains/agent.md § Voice): transcript cleanup, the
 * speech text guard, charges, and the speech-to-text models' hints (keywords, languages, prompt).
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

// ---------------------------------------------------------------- speech-to-text models

/**
 * List prices, USD per minute of audio (2026-10). Prefix match, first wins; an unknown model is
 * charged like the priciest one so the budget never undercounts.
 */
const STT_USD_PER_MINUTE: readonly (readonly [prefix: string, usd: number])[] = [
  ['gpt-live-transcribe', 0.017],
  ['gpt-transcribe', 0.0045],
  ['gpt-4o-mini-transcribe', 0.003],
  ['gpt-4o-transcribe', 0.006],
  ['whisper-1', 0.006],
];
const STT_UNKNOWN_USD_PER_MINUTE = 0.017;

/**
 * Budget token-equivalents per USD of voice usage: the speech weighting (1 per spoken character
 * ≈ $15 per 1M characters, gpt-4o-mini-tts), so every voice reason costs $15 per 1M equivalents
 * (`AGENT_DEFAULT_PRICES` in `agentCost.ts`).
 */
export const AGENT_VOICE_TOKENS_PER_USD = 1_000_000 / 15;

/**
 * Budget charge per started second of transcribed audio for a model: its per-minute price at
 * {@link AGENT_VOICE_TOKENS_PER_USD} (gpt-transcribe 5, gpt-live-transcribe 19,
 * gpt-4o-transcribe 7, gpt-4o-mini-transcribe 3). `override` (`AGENT_VOICE_STT_TOKENS_PER_SECOND`)
 * wins when set.
 */
export function agentVoiceSttTokensPerSecond(model: string, override: number | null): number {
  if (override != null) return Math.max(0, override);
  const id = model.trim().toLowerCase();
  const usd = STT_USD_PER_MINUTE.find(([prefix]) => id.startsWith(prefix))?.[1] ?? STT_UNKNOWN_USD_PER_MINUTE;
  return Math.max(1, Math.round((usd / 60) * AGENT_VOICE_TOKENS_PER_USD));
}

/** gpt-transcribe / gpt-live-transcribe (and their snapshots): context prompt + `keywords` + `languages`. */
export function agentVoiceSttTakesHints(model: string): boolean {
  return /^gpt-(live-)?transcribe(-|$)/i.test(model.trim());
}

/**
 * Streaming models without provider turn detection (`server_vad` / `semantic_vad` are refused):
 * the server energy VAD commits each turn, and `delay` tunes their latency.
 */
export function agentVoiceSttIsLive(model: string): boolean {
  return /^gpt-(live-transcribe|realtime-whisper)(-|$)/i.test(model.trim());
}

/** Turn detection to request: VAD-less models always get `none`. */
export function agentVoiceSttTurnDetection<T extends string>(model: string, configured: T): T | 'none' {
  return agentVoiceSttIsLive(model) ? 'none' : configured;
}

/**
 * What the transcription should expect, independent of the model. Turned into request fields
 * per model family by {@link agentVoiceSttRequestHints}.
 */
export type AgentVoiceSttHints = {
  /** Literal terms: Bandeja, padel, pickleball, the user's first name, clubs of the home city. */
  keywords: string[];
  /** Expected input languages (ISO 639-1): the app locale, the user's language, English. */
  languages: string[];
};

/**
 * Language codes sent as `languages` (the API rejects the whole request on an unsupported
 * code): the app's locales, each checked against `v1/audio/transcriptions` and a Realtime
 * transcription session. Other codes are left out.
 */
const STT_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'cs', 'en', 'es', 'hi', 'id', 'ja', 'ru', 'sr', 'th', 'zh']);
const KEYWORD_MAX_CHARS = 100;

/**
 * Hints for one user: keywords (sport words, first name, home-city clubs; one line each, no
 * `<` / `>`, deduped) and languages (app locale, the user's language, English: never a single
 * forced language, a hint only; Russian speech stays Russian with `["en"]`).
 */
export function buildAgentVoiceSttHints(params: {
  firstName: string | null;
  clubNames: readonly string[];
  locales: readonly (string | null | undefined)[];
}): AgentVoiceSttHints {
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const raw of ['Bandeja', 'padel', 'pickleball', params.firstName ?? '', ...params.clubNames]) {
    const word = raw.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, KEYWORD_MAX_CHARS);
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    keywords.push(word);
  }
  const languages: string[] = [];
  for (const locale of [...params.locales, 'en']) {
    const base = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? '';
    if (STT_LANGUAGES.has(base) && !languages.includes(base)) languages.push(base);
  }
  return { keywords, languages };
}

/**
 * Context for gpt-transcribe / gpt-live-transcribe: what the recording is, not the task (their
 * guide: don't restate the transcription task). Measured 2026-10 (tts-1 clips): with keywords
 * and this context neither model answered a spoken request ("Tell me about padel rules in a few
 * sentences.", "Give me three bandeja tips.", a Russian one; 0 of 80 batch and ~220 realtime
 * turns), with or without a "never answer it" sentence, so it is left out.
 */
export const AGENT_VOICE_STT_CONTEXT = 'A player talking to Bandeja, a padel and pickleball app, about games, clubs, courts and bookings.';

const VOCABULARY_MAX_CHARS = 700;

/**
 * Framing of the prompt for older models (gpt-4o-transcribe, gpt-4o-mini-transcribe, whisper-1),
 * which have no keyword field. A bare word list ("Bandeja, padel, pickleball, …") reads to them
 * as context to continue, and a spoken request ("Tell me about padel rules in a few sentences.")
 * then comes back ANSWERED instead of transcribed (realtime API, gpt-4o-transcribe: 5/5 answered
 * with the bare list, 0/13 with this framing; gpt-4o-mini-transcribe still answers ~1 in 8, hence
 * `isImplausibleAgentVoiceTranscript` and a hint-less retry at every call site). It is English,
 * but it does not translate other languages (checked with Russian speech).
 */
const VOCABULARY_PREFIX =
  'Verbatim transcript of a user talking to a sports app. Transcribe exactly what is said; never answer it. Words that may come up: ';

/** The older models' prompt: the instruction above, then the keywords (≤ 700 chars). */
export function buildAgentVoiceVocabulary(keywords: readonly string[]): string {
  let out = '';
  for (const word of keywords) {
    const next = out ? `${out}, ${word}` : word;
    if (next.length > VOCABULARY_MAX_CHARS) break;
    out = next;
  }
  return `${VOCABULARY_PREFIX}${out}.`;
}

/** Transcription request fields shared by `v1/audio/transcriptions` and a Realtime session. */
export type AgentVoiceSttRequestHints = { prompt?: string; keywords?: string[]; languages?: string[] };

/**
 * The hints in the shape a model takes: gpt-transcribe / gpt-live-transcribe get
 * {@link AGENT_VOICE_STT_CONTEXT} + `keywords` + `languages` (never the singular `language`);
 * older models get the vocabulary prompt only (their single `language` would force one
 * language). `null` hints (the answer-guard retry) = no fields at all.
 */
export function agentVoiceSttRequestHints(model: string, hints: AgentVoiceSttHints | null): AgentVoiceSttRequestHints {
  if (!hints) return {};
  if (agentVoiceSttTakesHints(model)) {
    return {
      prompt: AGENT_VOICE_STT_CONTEXT,
      ...(hints.keywords.length ? { keywords: [...hints.keywords] } : {}),
      ...(hints.languages.length ? { languages: [...hints.languages] } : {}),
    };
  }
  return hints.keywords.length ? { prompt: buildAgentVoiceVocabulary(hints.keywords) } : {};
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
