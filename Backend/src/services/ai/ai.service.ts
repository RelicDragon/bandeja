import OpenAI from 'openai';
import { config } from '../../config/env';
import type { AiProvider, IAiService, CreateCompletionOptions } from './types';
import { logLlmUsage } from './llmUsageLog.service';

const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
// Canonical current alias (DeepSeek-V4.1-Flash). The old `deepseek-v4-flash` and
// `deepseek-chat` names still resolve here, so logging them recorded a model that
// was not the one actually serving the request.
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';

// When DeepSeek fails or stalls (it can accept a request and then only send
// keep-alives), retry once on OpenAI so AI features keep working.
const OPENAI_FALLBACK_MODEL = 'gpt-6-luna';
const OPENAI_FALLBACK_REASONING_EFFORT = 'medium';
// Without a caller deadline, give DeepSeek this long before falling back instead of
// the SDK default (10 min x 3 attempts), which would never let the fallback run.
const PRIMARY_TIMEOUT_WITH_FALLBACK_MS = 45000;
// After a primary failure, go straight to the fallback for a while so every call
// during an outage does not first wait out the primary timeout.
const PRIMARY_COOLDOWN_MS = 60000;
let primaryCooldownUntil = 0;

interface Attempt {
  provider: AiProvider;
  client: OpenAI;
  model: string;
  reasoningEffort?: string;
}

function getClient(): OpenAI | null {
  const provider = config.ai.provider;
  if (provider === 'deepseek') {
    if (!config.deepseek.apiKey) return null;
    return new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  if (provider === 'openai' && config.openai.apiKey) {
    return new OpenAI({ apiKey: config.openai.apiKey });
  }
  return null;
}

function getFallbackAttempt(): Attempt | null {
  if (config.ai.provider !== 'deepseek' || !config.openai.apiKey) return null;
  return {
    provider: 'openai',
    client: new OpenAI({ apiKey: config.openai.apiKey }),
    model: OPENAI_FALLBACK_MODEL,
    reasoningEffort: OPENAI_FALLBACK_REASONING_EFFORT,
  };
}

async function runAttempt(
  attempt: Attempt,
  options: CreateCompletionOptions,
  timeoutMs: number | undefined
): Promise<string> {
  const { provider, client, model } = attempt;
  const tokenLimit = options.max_tokens;
  // gpt-5+ OpenAI models reject max_tokens and non-default temperature.
  const usesMaxCompletionTokens = provider === 'openai' && /^gpt-([5-9]|\d{2,})/i.test(model);
  const response = await client.chat.completions.create(
    {
      model,
      messages: options.messages,
      ...(usesMaxCompletionTokens
        ? {}
        : options.temperature === undefined
          ? {}
          : { temperature: options.temperature }),
      ...(tokenLimit === undefined
        ? {}
        : usesMaxCompletionTokens
          ? { max_completion_tokens: tokenLimit }
          : { max_tokens: tokenLimit }),
      ...(attempt.reasoningEffort ? { reasoning_effort: attempt.reasoningEffort } : {}),
      ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    // An abort signal, not the SDK `timeout`: DeepSeek sends headers right away and then
    // keeps the body open with blank keep-alive lines, which the SDK timeout never covers.
    timeoutMs === undefined ? undefined : { signal: AbortSignal.timeout(timeoutMs), maxRetries: 0 }
  );
  const message = response.choices?.[0]?.message;
  const text = message?.content?.trim();
  if (!text) {
    const reasoning =
      message &&
      typeof message === 'object' &&
      'reasoning_content' in message &&
      typeof (message as { reasoning_content?: unknown }).reasoning_content === 'string'
        ? String((message as { reasoning_content?: string }).reasoning_content ?? '').length
        : 0;
    console.error('[ai] Empty AI response', {
      provider,
      model,
      reason: options.reason ?? null,
      finishReason: response.choices?.[0]?.finish_reason ?? null,
      reasoningChars: reasoning,
      usage: response.usage ?? null,
    });
    throw new Error('Empty AI response');
  }
  const usage = response.usage;
  logLlmUsage({
    provider,
    model,
    reason: options.reason ?? undefined,
    userId: options.userId ?? undefined,
    input: JSON.stringify(options.messages),
    output: text,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
  });
  return text;
}

export function getAiService(): IAiService {
  return {
    isConfigured(): boolean {
      return getClient() !== null;
    },
    async createCompletion(options: CreateCompletionOptions): Promise<string> {
      const c = getClient();
      if (!c) throw new Error('AI service is not configured');
      const provider = config.ai.provider;
      const primary: Attempt = {
        provider,
        client: c,
        model:
          options.model ??
          (provider === 'deepseek' ? DEEPSEEK_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL),
      };
      const fallback = getFallbackAttempt();
      if (!fallback) return runAttempt(primary, options, options.timeoutMs);

      if (Date.now() < primaryCooldownUntil) {
        return runAttempt(fallback, options, options.timeoutMs);
      }

      // With a caller deadline, split it between the two attempts.
      const deadline = options.timeoutMs === undefined ? null : Date.now() + options.timeoutMs;
      const primaryTimeout =
        options.timeoutMs === undefined
          ? PRIMARY_TIMEOUT_WITH_FALLBACK_MS
          : Math.floor(options.timeoutMs / 2);
      try {
        return await runAttempt(primary, options, primaryTimeout);
      } catch (error) {
        primaryCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
        console.error('[ai] Primary provider failed, falling back to OpenAI', {
          provider,
          model: primary.model,
          fallbackModel: fallback.model,
          reason: options.reason ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
        const remaining = deadline === null ? undefined : Math.max(deadline - Date.now(), 1000);
        return runAttempt(fallback, options, remaining);
      }
    },
  };
}
