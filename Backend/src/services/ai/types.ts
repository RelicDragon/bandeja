import type { LlmReason } from './llmReasons';

export type AiProvider = 'openai' | 'deepseek';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CreateCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  reason?: LlmReason | string;
  userId?: string;
  /** Hard deadline for the whole call (including any fallback); disables SDK retries. */
  timeoutMs?: number;
}

export interface IAiService {
  createCompletion(options: CreateCompletionOptions): Promise<string>;
  isConfigured(): boolean;
}
