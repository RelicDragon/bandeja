/**
 * "The user sent the agent a message" — the one entry point for every channel
 * (HTTP `POST /agent/chats/:id/messages`, the Telegram assistant). Same checks in the
 * same order everywhere:
 *   1. per-user message quota (shared store) → 429 `RATE_LIMITED`
 *   2. `AgentRunService.enqueueRun`: text length, chat ownership (404), LLM configured
 *      (503), daily token budget (429 `BUDGET_EXCEEDED`), one live run per chat
 *      (409 `CHAT_BUSY`), queued-per-user cap (429 `RATE_LIMITED`); the run starts QUEUED.
 */
import type { AgentMessageDto } from '@bandeja/shared/agentContract';
import { consumeAgentMessageQuota } from './agentMessageRateLimit';
import { getAgentRunService } from './agentRun.service';

export type SendAgentUserMessageInput = {
  user: { id: string; isAdmin: boolean };
  chatId: string;
  text: string;
  /** Reply language hint (`X-App-Locale` over HTTP, the bot language in Telegram). */
  locale: string | null;
  /** Parsed `X-Agent-Client-Caps` (app only; Telegram and old builds: none). Stored on the run. */
  clientCaps?: readonly string[] | null;
  /**
   * `'consume'`: count this message against the quota here. `'counted'`: the HTTP route's
   * `express-rate-limit` middleware already counted it in the same store.
   */
  quota: 'consume' | 'counted';
};

export async function sendAgentUserMessage(
  input: SendAgentUserMessageInput,
): Promise<{ message: AgentMessageDto; runId: string }> {
  if (input.quota === 'consume') await consumeAgentMessageQuota(input.user.id);
  return getAgentRunService().enqueueRun({
    userId: input.user.id,
    chatId: input.chatId,
    text: input.text,
    headerLocale: input.locale,
    clientCaps: input.clientCaps ?? null,
  });
}
