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
}

export interface IAiService {
  createCompletion(options: CreateCompletionOptions): Promise<string>;
  isConfigured(): boolean;
}
