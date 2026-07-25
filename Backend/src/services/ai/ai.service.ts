import OpenAI from 'openai';
import { config } from '../../config/env';
import type { IAiService, CreateCompletionOptions } from './types';
import { logLlmUsage } from './llmUsageLog.service';

const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-pro';

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

export function getAiService(): IAiService {
  return {
    isConfigured(): boolean {
      return getClient() !== null;
    },
    async createCompletion(options: CreateCompletionOptions): Promise<string> {
      const c = getClient();
      if (!c) throw new Error('AI service is not configured');
      const provider = config.ai.provider;
      const model =
        options.model ??
        (provider === 'deepseek' ? DEEPSEEK_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL);
      const response = await c.chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
      const message = response.choices[0]?.message;
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
          finishReason: response.choices[0]?.finish_reason ?? null,
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
    },
  };
}
