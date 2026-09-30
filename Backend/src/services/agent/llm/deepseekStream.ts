/**
 * Streaming chat-completions client for the agent (DeepSeek, OpenAI-compatible).
 *
 * Uses the `openai` SDK that `services/ai/ai.service.ts` already points at DeepSeek,
 * rather than the raw `fetch` + manual SSE parsing travel-bandeja needed in plain JS:
 * the SDK parses the SSE stream, types the chunks, honours an AbortSignal and retries
 * nothing on its own (`maxRetries: 0`, the run has a 60s wall clock). `IAiService` is
 * untouched. Thinking is disabled on every call, like the rest of the backend's
 * DeepSeek usage (reasoning tokens would blow the step budget and are not shown).
 *
 * The run loop only depends on `AgentLlmClient`, so tests inject a scripted fake.
 */
import OpenAI from 'openai';
import type { AgentOpenAiTool } from '../tools/registry';

export type AgentLlmToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

/** JSON-safe message shape; persisted in `AgentMessage.llmMessages` and replayed. */
export type AgentLlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AgentLlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type AgentLlmStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'finish'; reason: string | null };

export type AgentLlmStreamParams = {
  messages: AgentLlmMessage[];
  /** Omit (or empty) to force a text answer. */
  tools?: AgentOpenAiTool[];
  signal: AbortSignal;
};

export interface AgentLlmClient {
  readonly provider: string;
  readonly model: string;
  stream(params: AgentLlmStreamParams): AsyncIterable<AgentLlmStreamChunk>;
}

export class AgentLlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AgentLlmError';
  }
}

export class DeepSeekAgentLlmClient implements AgentLlmClient {
  readonly provider = 'deepseek';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: { apiKey: string; baseUrl: string; model: string }) {
    this.model = options.model;
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl, maxRetries: 0 });
  }

  async *stream(params: AgentLlmStreamParams): AsyncIterable<AgentLlmStreamChunk> {
    const hasTools = Boolean(params.tools && params.tools.length > 0);
    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: params.messages as OpenAI.Chat.ChatCompletionMessageParam[],
          ...(hasTools ? { tools: params.tools, tool_choice: 'auto' as const } : {}),
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.3,
          thinking: { type: 'disabled' },
        } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        { signal: params.signal },
      );
    } catch (error) {
      throw toAgentLlmError(error, params.signal);
    }
    try {
      for await (const chunk of stream) {
        if (chunk.usage) {
          yield {
            type: 'usage',
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) yield { type: 'text', text: delta.content };
        for (const toolCall of delta?.tool_calls ?? []) {
          yield {
            type: 'tool_call_delta',
            index: toolCall.index ?? 0,
            id: toolCall.id ?? undefined,
            name: toolCall.function?.name ?? undefined,
            arguments: toolCall.function?.arguments ?? undefined,
          };
        }
        if (choice.finish_reason) yield { type: 'finish', reason: choice.finish_reason };
      }
    } catch (error) {
      throw toAgentLlmError(error, params.signal);
    }
  }
}

function toAgentLlmError(error: unknown, signal: AbortSignal): unknown {
  // Aborts are the loop's own cancellation/timeout: let the caller classify them.
  if (signal.aborted) return error;
  if (error instanceof OpenAI.APIError) {
    return new AgentLlmError(`LLM request failed (${error.status ?? 'network'}): ${error.message}`, error.status ?? null);
  }
  if (error instanceof Error) return new AgentLlmError(`LLM request failed: ${error.message}`);
  return new AgentLlmError('LLM request failed');
}

/**
 * Accumulates streamed `tool_calls` deltas by index (the id and name arrive once, the
 * arguments arrive in pieces). Mirrors travel-bandeja `streamDeepSeekChat`.
 */
export class ToolCallAccumulator {
  private readonly byIndex = new Map<number, AgentLlmToolCall>();

  add(delta: { index: number; id?: string; name?: string; arguments?: string }): void {
    let call = this.byIndex.get(delta.index);
    if (!call) {
      call = { id: '', type: 'function', function: { name: '', arguments: '' } };
      this.byIndex.set(delta.index, call);
    }
    if (delta.id) call.id = delta.id;
    if (delta.name) call.function.name = delta.name;
    if (delta.arguments) call.function.arguments += delta.arguments;
  }

  /** Calls in index order; missing ids get a stable synthetic one. Nameless fragments are dropped. */
  calls(runId: string, step: number): AgentLlmToolCall[] {
    return [...this.byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.function.name)
      .map(([index, call]) => ({
        ...call,
        id: call.id || `call_${runId.slice(-8)}_${step}_${index}`,
      }));
  }
}

let defaultClient: { key: string; client: AgentLlmClient } | null = null;

/** Real client from env; null when `DEEPSEEK_API_KEY` is missing. */
export function getDefaultAgentLlmClient(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): AgentLlmClient | null {
  if (!options.apiKey) return null;
  const key = `${options.baseUrl}|${options.model}|${options.apiKey.length}`;
  if (!defaultClient || defaultClient.key !== key) {
    defaultClient = { key, client: new DeepSeekAgentLlmClient(options) };
  }
  return defaultClient.client;
}
