/**
 * What a v2 voice session needs from the agent run machinery: send a voice turn (the same
 * entry point as `POST /messages {voice: true}`), cancel a run (the `POST /runs/:id/cancel`
 * path), follow a run's event log (`AgentRunFeed`, same as SSE / Telegram), and cut a stored
 * reply down to what the user heard after a barge-in.
 */
import { AgentMessageRole, AgentRunStatus, type Prisma } from '@prisma/client';
import type { AgentContentBlock, AgentStreamEvent } from '@bandeja/shared/agentContract';
import prisma from '../../../../config/database';
import { getAgentRunService, type AgentRunService } from '../../agentRun.service';
import { AgentRunFeed } from '../../agentRunFeed';
import { consumeAgentMessageQuota } from '../../agentMessageRateLimit';
import { sendAgentUserMessage } from '../../agentSendMessage.service';
import { truncateHeardText } from './agentVoiceHeard';

export interface AgentVoiceRunPort {
  send(input: {
    user: { id: string; isAdmin: boolean };
    chatId: string;
    text: string;
    locale: string | null;
    clientCaps: readonly string[] | null;
    /** Re-send: rewind the chat to this USER message (a turn the user kept talking in). */
    editMessageId?: string | null;
    /**
     * The stopped turn's words + the new ones, re-sent over its `editMessageId`: that message
     * already counted against the per-user message quota, so this send doesn't count again.
     */
    merged?: boolean;
  }): Promise<{ runId: string; messageId: string }>;
  cancel(userId: string, runId: string): Promise<void>;
  /** Follows a run of the user's chat; null when it isn't theirs. */
  follow(input: {
    userId: string;
    chatId: string;
    runId: string;
    onEvent: (event: AgentStreamEvent) => void;
    onEnd: () => void;
  }): Promise<{ close(): void } | null>;
  /** Client caps of the chat's latest run (the socket has no `X-Agent-Client-Caps` header). */
  latestClientCaps(userId: string, chatId: string): Promise<string[] | null>;
  /** After a barge-in: the run's reply text cut to `heardOffset` of its streamed text. */
  truncateReply(input: { runId: string; streamedText: string; heardOffset: number }): Promise<void>;
}

const FEED_KEEPALIVE_MS = 15_000;
const TERMINAL_WAIT_MS = 4_000;

let serviceOverride: AgentRunService | null = null;

/** Tests: a run service with a scripted LLM (null = the process singleton again). */
export function setAgentVoiceRunServiceForTests(service: AgentRunService | null): void {
  serviceOverride = service;
}

function runService(): AgentRunService {
  return serviceOverride ?? getAgentRunService();
}

async function waitForTerminal(runId: string): Promise<void> {
  const deadline = Date.now() + TERMINAL_WAIT_MS;
  for (;;) {
    const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (!run || (run.status !== AgentRunStatus.QUEUED && run.status !== AgentRunStatus.RUNNING)) return;
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function plainAssistantText(message: { content: Prisma.JsonValue; llmMessages: Prisma.JsonValue }): string | null {
  const blocks = message.content as unknown as AgentContentBlock[] | null;
  if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0]?.type !== 'text') return null;
  const llm = message.llmMessages as unknown as { role?: string; content?: unknown; tool_calls?: unknown }[] | null;
  if (llm != null && (!Array.isArray(llm) || llm.length !== 1 || llm[0]?.role !== 'assistant' || llm[0]?.tool_calls)) return null;
  return blocks[0].text;
}

export const defaultAgentVoiceRunPort: AgentVoiceRunPort = {
  async send(input) {
    // Server-side only (a voice session's own continuation): HTTP sends always count.
    const quota = input.merged === true && Boolean(input.editMessageId) ? 'counted' : 'consume';
    if (serviceOverride) {
      // Tests: same checks as `sendAgentUserMessage`, on the scripted service.
      if (quota === 'consume') await consumeAgentMessageQuota(input.user.id);
      const { message, runId } = await serviceOverride.enqueueRun({
        userId: input.user.id,
        chatId: input.chatId,
        text: input.text,
        editMessageId: input.editMessageId ?? null,
        headerLocale: input.locale,
        clientCaps: input.clientCaps,
        voice: true,
      });
      return { runId, messageId: message.id };
    }
    const { message, runId } = await sendAgentUserMessage({
      user: input.user,
      chatId: input.chatId,
      text: input.text,
      editMessageId: input.editMessageId ?? null,
      locale: input.locale,
      clientCaps: input.clientCaps,
      voice: true,
      quota,
    });
    return { runId, messageId: message.id };
  },

  async cancel(userId, runId) {
    await runService().cancelRun(userId, runId);
  },

  async follow({ userId, chatId, runId, onEvent, onEnd }) {
    const run = await prisma.agentRun.findFirst({ where: { id: runId, userId, chatId } });
    if (!run) return null;
    const service = runService();
    const feed = new AgentRunFeed({
      source: service,
      run,
      after: 0,
      onEvent: (stored) => onEvent(stored.event),
      onEnd,
      keepaliveMs: FEED_KEEPALIVE_MS,
      reloadRun: (id) => prisma.agentRun.findUnique({ where: { id } }),
    });
    await feed.start();
    return feed;
  },

  async latestClientCaps(userId, chatId) {
    const run = await prisma.agentRun.findFirst({
      where: { userId, chatId },
      orderBy: { createdAt: 'desc' },
      select: { clientCaps: true },
    });
    return run?.clientCaps ?? null;
  },

  async truncateReply({ runId, streamedText, heardOffset }) {
    // A run cancelled in another process saves its partial text when its heartbeat notices.
    await waitForTerminal(runId);
    const messages = await prisma.agentMessage.findMany({
      where: { runId, role: AgentMessageRole.ASSISTANT },
      orderBy: { seq: 'asc' },
      select: { id: true, content: true, llmMessages: true },
    });
    let cursor = 0;
    for (const message of messages) {
      const text = plainAssistantText(message);
      if (text == null || !text.trim()) continue;
      const start = streamedText.indexOf(text, cursor);
      if (start === -1) continue;
      cursor = start + text.length;
      const cut = truncateHeardText(text, start, heardOffset);
      if (cut == null) continue;
      await prisma.agentMessage.update({
        where: { id: message.id },
        data: {
          content: [{ type: 'text', text: cut }] as unknown as Prisma.InputJsonValue,
          llmMessages: [{ role: 'assistant', content: cut }] as unknown as Prisma.InputJsonValue,
        },
      });
    }
  },
};
