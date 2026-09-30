import assert from 'node:assert/strict';
import type { AgentRun } from '@prisma/client';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import { InMemoryAgentEventStore, AGENT_SYNTHETIC_EVENT_ID_BASE } from '../../../agent/agentEvents';
import { AgentRunFeed, type AgentRunFeedSource } from '../../../agent/agentRunFeed';

const run = { id: 'run_1', chatId: 'chat_1', status: 'RUNNING' } as unknown as AgentRun;

function source(store: InMemoryAgentEventStore, synthetic: AgentStreamEvent[] = []): AgentRunFeedSource & { reconciled: number } {
  return {
    events: store,
    reconciled: 0,
    async ensureLiveLog() {
      return false;
    },
    async buildSyntheticEvents() {
      return synthetic;
    },
    async reconcileTerminal() {
      this.reconciled += 1;
    },
  };
}

async function testReplayThenLiveInOrderUntilTerminal(): Promise<void> {
  const store = new InMemoryAgentEventStore(60_000);
  await store.open('run_1');
  await store.append('run_1', { type: 'run.started', runId: 'run_1', chatId: 'chat_1' });
  await store.append('run_1', { type: 'text.delta', text: 'a' });
  const seen: string[] = [];
  let ended = 0;
  const feed = new AgentRunFeed({
    source: source(store),
    run,
    after: 1,
    onEvent: (stored) => seen.push(`${stored.id}:${stored.event.type}`),
    onEnd: () => {
      ended += 1;
    },
    keepaliveMs: 60_000,
  });
  await feed.start();
  await store.append('run_1', { type: 'text.delta', text: 'b' });
  await store.append('run_1', { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 0, outputTokens: 0 } });
  await store.append('run_1', { type: 'text.delta', text: 'ignored after terminal' });
  assert.deepEqual(seen, ['2:text.delta', '3:text.delta', '4:run.completed'], 'cursor respected, live appended, stops at terminal');
  assert.equal(ended, 1);
  assert.equal(feed.isClosed, true);
  feed.close();
  assert.equal(ended, 1, 'onEnd fires once');
}

async function testMissingLogReplaysFromDatabase(): Promise<void> {
  const store = new InMemoryAgentEventStore(60_000);
  const events: AgentStreamEvent[] = [
    { type: 'run.started', runId: 'run_1', chatId: 'chat_1' },
    { type: 'run.failed', code: 'INTERNAL', message: 'The run was interrupted' },
  ];
  const seen: number[] = [];
  let ended = false;
  await new AgentRunFeed({
    source: source(store, events),
    run,
    after: 0,
    onEvent: (stored) => seen.push(stored.id),
    onEnd: () => {
      ended = true;
    },
    keepaliveMs: 60_000,
  }).start();
  assert.deepEqual(seen, [AGENT_SYNTHETIC_EVENT_ID_BASE + 1, AGENT_SYNTHETIC_EVENT_ID_BASE + 2]);
  assert.equal(ended, true);
}

void (async () => {
  await testReplayThenLiveInOrderUntilTerminal();
  await testMissingLogReplaysFromDatabase();
  console.log('agentRunFeed.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
