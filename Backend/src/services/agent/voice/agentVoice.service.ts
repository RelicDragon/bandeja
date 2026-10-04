/**
 * Agent voice (docs/domains/agent.md § Voice): speech-to-text for dictation and voice turns,
 * text-to-speech for spoken replies. Nothing is stored except one `LlmUsageLog` row per call
 * (audit + budget charge; no transcript, no spoken text). The provider is OpenAI
 * (`OPENAI_API_KEY`, models from `config.agentVoice`); tests swap it with
 * `setAgentVoiceProviderForTests`.
 */
import OpenAI from 'openai';
import { parseBuffer } from 'music-metadata';
import {
  AGENT_VOICE_MAX_AUDIO_BYTES,
  AGENT_VOICE_MAX_AUDIO_MS,
  type AgentVoiceErrorCode,
  type AgentVoiceTranscriptionDto,
} from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import type { AgentVoiceEnvConfig } from '../../../config/agentVoiceEnv';
import { ApiError } from '../../../utils/ApiError';
import { LLM_REASON } from '../../ai/llmReasons';
import { assertAgentBudget } from '../agentGuards';
import {
  agentVoiceChargeDurationMs,
  agentVoiceFileExtension,
  agentVoiceSpeechCharge,
  agentVoiceTranscriptionCharge,
  buildAgentVoiceVocabulary,
  cleanAgentVoiceTranscript,
  normalizeAgentSpeechText,
} from './agentVoiceText';

export interface AgentVoiceProvider {
  readonly name: string;
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string;
    prompt: string;
    model: string;
    signal: AbortSignal;
  }): Promise<string>;
  /** MP3 bytes. */
  speak(input: { text: string; model: string; voice: string; instructions: string; signal: AbortSignal }): Promise<Buffer>;
}

/** Below this an upload can't hold a word (container headers alone are ~1 KB). */
const MIN_AUDIO_BYTES = 1200;
const CLUB_VOCABULARY_LIMIT = 40;

export function agentVoiceError(statusCode: number, code: AgentVoiceErrorCode, message: string): ApiError {
  return new ApiError(statusCode, message, true, { code });
}

function createOpenAiVoiceProvider(apiKey: string): AgentVoiceProvider {
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  return {
    name: 'openai',
    async transcribe({ audio, mimeType, filename, prompt, model, signal }) {
      const file = new File([new Uint8Array(audio)], filename, { type: mimeType });
      const res = await client.audio.transcriptions.create(
        { file, model, response_format: 'json', ...(prompt ? { prompt } : {}) },
        { signal },
      );
      return typeof res.text === 'string' ? res.text : '';
    },
    async speak({ text, model, voice, instructions, signal }) {
      const res = await client.audio.speech.create(
        {
          model,
          voice,
          input: text,
          response_format: 'mp3',
          // Only the gpt-4o TTS models take style instructions; tts-1 rejects the field.
          ...(model.startsWith('gpt-') ? { instructions } : {}),
        },
        { signal },
      );
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

let providerOverride: AgentVoiceProvider | null | undefined;

/** Tests: a fake provider, `null` to simulate "not configured", `undefined` to restore OpenAI. */
export function setAgentVoiceProviderForTests(provider: AgentVoiceProvider | null | undefined): void {
  providerOverride = provider;
}

let cachedOpenAi: { apiKey: string; provider: AgentVoiceProvider } | null = null;

function openAiProvider(apiKey: string): AgentVoiceProvider {
  if (cachedOpenAi?.apiKey !== apiKey) cachedOpenAi = { apiKey, provider: createOpenAiVoiceProvider(apiKey) };
  return cachedOpenAi.provider;
}

function resolveProvider(voiceConfig: AgentVoiceEnvConfig): AgentVoiceProvider {
  if (!voiceConfig.enabled) throw agentVoiceError(503, 'VOICE_UNAVAILABLE', 'Voice is turned off');
  const provider = providerOverride !== undefined ? providerOverride : config.openai.apiKey ? openAiProvider(config.openai.apiKey) : null;
  if (!provider) throw agentVoiceError(503, 'VOICE_UNAVAILABLE', 'Voice is not configured');
  return provider;
}

async function parseDurationMs(audio: Buffer, mimeType: string): Promise<number | null> {
  try {
    const meta = await parseBuffer(new Uint8Array(audio), { mimeType, size: audio.length }, { duration: true });
    const sec = meta.format.duration;
    return typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : null;
  } catch {
    return null;
  }
}

async function recordVoiceUsage(entry: {
  reason: string;
  userId: string;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  charge: number;
  now: Date;
}): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        provider: entry.provider.slice(0, 32),
        model: entry.model.slice(0, 128),
        reason: entry.reason,
        userId: entry.userId,
        input: JSON.stringify(entry.input).slice(0, 300),
        output: JSON.stringify(entry.output).slice(0, 300),
        inputTokens: Math.max(0, Math.trunc(entry.charge)),
        outputTokens: 0,
        createdAt: entry.now,
      },
    });
  } catch (error) {
    console.error('[agent-voice] usage row failed', { reason: entry.reason, error: error instanceof Error ? error.message : 'unknown' });
  }
}

function providerFailure(kind: 'transcribe' | 'speak', userId: string, error: unknown): ApiError {
  const err = error as { message?: string; status?: number; code?: string; name?: string };
  console.error('[agent-voice] provider_failed', { kind, userId, status: err?.status, code: err?.code, name: err?.name, message: err?.message });
  return agentVoiceError(503, 'VOICE_UNAVAILABLE', 'Voice is temporarily unavailable. Please try again.');
}

async function vocabularyFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, currentCityId: true } });
  const clubs = user?.currentCityId
    ? await prisma.club.findMany({
        where: { cityId: user.currentCityId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: CLUB_VOCABULARY_LIMIT,
      })
    : [];
  return buildAgentVoiceVocabulary({ firstName: user?.firstName ?? null, clubNames: clubs.map((c) => c.name) });
}

export async function transcribeAgentVoice(input: {
  userId: string;
  audio: Buffer;
  mimeType: string;
  /** `X-Audio-Duration-Ms` from the app (charge fallback when the container has no duration). */
  clientDurationMs: number | null;
  now?: Date;
}): Promise<AgentVoiceTranscriptionDto> {
  const voiceConfig = config.agentVoice;
  const provider = resolveProvider(voiceConfig);
  const now = input.now ?? new Date();
  const mimeType = input.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const extension = agentVoiceFileExtension(mimeType);
  if (!extension) throw agentVoiceError(400, 'VOICE_AUDIO_INVALID', 'Unsupported audio format');
  if (input.audio.length < MIN_AUDIO_BYTES) throw agentVoiceError(400, 'VOICE_AUDIO_INVALID', 'Recording is too short');
  if (input.audio.length > AGENT_VOICE_MAX_AUDIO_BYTES) throw agentVoiceError(400, 'VOICE_AUDIO_INVALID', 'Recording is too large');

  const parsedMs = await parseDurationMs(input.audio, mimeType);
  if (parsedMs != null && parsedMs > AGENT_VOICE_MAX_AUDIO_MS + 1000) {
    throw agentVoiceError(400, 'VOICE_AUDIO_INVALID', 'Recording is too long');
  }
  const durationMs = agentVoiceChargeDurationMs({ parsedMs, clientMs: input.clientDurationMs, bytes: input.audio.length });
  await assertAgentBudget(input.userId, config.agent, now);

  const prompt = await vocabularyFor(input.userId);
  let raw: string;
  try {
    raw = await provider.transcribe({
      audio: input.audio,
      mimeType,
      filename: `speech.${extension}`,
      prompt,
      model: voiceConfig.sttModel,
      signal: AbortSignal.timeout(voiceConfig.timeoutMs),
    });
  } catch (error) {
    throw providerFailure('transcribe', input.userId, error);
  }
  const text = cleanAgentVoiceTranscript(raw);
  await recordVoiceUsage({
    reason: LLM_REASON.AGENT_VOICE_TRANSCRIPTION,
    userId: input.userId,
    provider: provider.name,
    model: voiceConfig.sttModel,
    input: { bytes: input.audio.length, mimeType, durationMs },
    output: { chars: text.length },
    charge: agentVoiceTranscriptionCharge(durationMs, voiceConfig.sttTokensPerSecond),
    now,
  });
  return { text, durationMs };
}

export async function speakAgentVoice(input: { userId: string; text: string; now?: Date }): Promise<Buffer> {
  const voiceConfig = config.agentVoice;
  const provider = resolveProvider(voiceConfig);
  const now = input.now ?? new Date();
  const text = normalizeAgentSpeechText(input.text);
  if (!text) throw agentVoiceError(400, 'VOICE_AUDIO_INVALID', 'Nothing to say');
  await assertAgentBudget(input.userId, config.agent, now);

  let audio: Buffer;
  try {
    audio = await provider.speak({
      text,
      model: voiceConfig.ttsModel,
      voice: voiceConfig.ttsVoice,
      instructions: voiceConfig.ttsInstructions,
      signal: AbortSignal.timeout(voiceConfig.timeoutMs),
    });
  } catch (error) {
    throw providerFailure('speak', input.userId, error);
  }
  await recordVoiceUsage({
    reason: LLM_REASON.AGENT_VOICE_SPEECH,
    userId: input.userId,
    provider: provider.name,
    model: voiceConfig.ttsModel,
    input: { chars: text.length },
    output: { bytes: audio.length },
    charge: agentVoiceSpeechCharge(text, voiceConfig.ttsTokensPerChar),
    now,
  });
  return audio;
}
