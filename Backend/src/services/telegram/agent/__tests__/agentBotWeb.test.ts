/**
 * Phase 13 Telegram web sources (pure): the block from `web` views (provider, cached,
 * escaping, http(s) only, dedupe, caps, exhausted, reads), the reducer collecting views
 * once per call from live events and replayed messages, and the final message carrying it.
 */
import assert from 'node:assert/strict';
import type { AgentMessageDto, AgentWebView } from '@bandeja/shared/agentContract';
import { AGENT_BOT_LANGUAGES, agentBotT } from '../agentBotCopy';
import { isWellFormedTelegramHtml } from '../agentTelegramHtml';
import { initialAgentBotRunState, reduceAgentBotRun, renderAgentBotFinal } from '../agentBotView';
import { WEB_LINKS_MAX, renderWebSourcesBlock } from '../agentBotWeb';

const search = (overrides: Partial<Extract<AgentWebView, { kind: 'search' }>> = {}): AgentWebView => ({
  kind: 'search',
  query: 'padel rules',
  provider: 'brave',
  cached: false,
  exhausted: false,
  answer: null,
  results: [
    { title: 'Rules <b>& scoring</b>', url: 'https://www.padelfip.com/rules?a=1&b=2', host: 'padelfip.com', snippet: '' },
    { title: 'Bad', url: 'javascript:alert(1)', host: 'x', snippet: '' },
    { title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Padel', host: 'en.wikipedia.org', snippet: '' },
  ],
  tried: [],
  ...overrides,
});

// --- block ---------------------------------------------------------------------------------------
{
  const html = renderWebSourcesBlock([search()], 'en');
  const lines = html.split('\n');
  assert.equal(lines[0], '🔎 Web search (Brave)');
  assert.equal(lines[1], '• <a href="https://www.padelfip.com/rules?a=1&amp;b=2">Rules &lt;b&gt;&amp; scoring&lt;/b&gt;</a> — padelfip.com');
  assert.ok(!html.includes('javascript:'), 'non-http links dropped');
  assert.equal(lines.length, 3);
  assert.ok(isWellFormedTelegramHtml(html));

  const cachedRu = renderWebSourcesBlock([search({ cached: true, provider: 'tavily' })], 'ru');
  assert.ok(cachedRu.startsWith('🔎 Поиск в интернете (Tavily, из кэша)'));

  // Same URLs in a second search are not repeated; the header of an all-duplicate search is skipped.
  const twice = renderWebSourcesBlock([search(), search({ provider: 'tavily' })], 'en');
  assert.equal(twice.split('\n').length, 3);

  const many = search({
    results: Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, url: `https://site${i}.example.org/`, host: `site${i}.example.org`, snippet: '' })),
  });
  const more = renderWebSourcesBlock([many, search({ results: Array.from({ length: 6 }, (_, i) => ({ title: `U${i}`, url: `https://other${i}.example.org/`, host: `other${i}.example.org`, snippet: '' })) })], 'en');
  assert.equal((more.match(/<a /g) ?? []).length, WEB_LINKS_MAX, 'at most 8 links');
  assert.ok(more.endsWith(agentBotT('entity.more', 'en', { count: 6 })), 'hidden links counted');

  const failed = renderWebSourcesBlock([search({ exhausted: true, results: [], provider: null }), search({ exhausted: true, results: [], provider: null })], 'en');
  assert.equal(failed, '🔎 Web search unavailable', 'once');

  const reads = renderWebSourcesBlock(
    [
      { kind: 'fetch', url: 'https://www.padelfip.com/rules', host: 'padelfip.com', title: 'Rules', cached: false, truncated: false },
      { kind: 'fetch', url: 'https://www.padelfip.com/rules', host: 'padelfip.com', title: 'Rules', cached: true, truncated: false },
    ],
    'en',
  );
  assert.equal(reads, '📄 Read: <a href="https://www.padelfip.com/rules">padelfip.com</a>');
  assert.equal(renderWebSourcesBlock([], 'en'), '');
  for (const lang of AGENT_BOT_LANGUAGES) {
    for (const key of ['web.search', 'web.searchCached'] as const) {
      assert.ok(agentBotT(key, lang, { provider: 'Brave' }).includes('Brave'), `${lang} ${key} placeholder`);
    }
    assert.ok(agentBotT('web.unavailable', lang).trim());
    assert.ok(agentBotT('web.read', lang).trim());
  }
}

// --- reducer + final message ---------------------------------------------------------------------
{
  let state = initialAgentBotRunState('r1');
  state = reduceAgentBotRun(state, { type: 'run.started', runId: 'r1', chatId: 'c1' });
  state = reduceAgentBotRun(state, { type: 'tool.started', callId: 't1', name: 'web_search', label: 'Searching the web' });
  state = reduceAgentBotRun(state, { type: 'tool.finished', callId: 't1', ok: true, summary: 'Web results: 2', web: search() });
  const toolMessage: AgentMessageDto = {
    id: 'm1',
    chatId: 'c1',
    seq: 2,
    role: 'TOOL',
    runId: 'r1',
    createdAt: '2026-10-01T10:00:00.000Z',
    blocks: [{ type: 'tool_result', callId: 't1', ok: true, summary: 'Web results: 2', web: search() }],
  };
  state = reduceAgentBotRun(state, { type: 'message.saved', message: toolMessage });
  assert.equal(state.web.length, 1, 'one view per call (live + replay)');
  state = reduceAgentBotRun(state, {
    type: 'message.saved',
    message: { ...toolMessage, id: 'm2', seq: 3, role: 'ASSISTANT', blocks: [{ type: 'text', text: 'Padel rules: see [FIP](https://www.padelfip.com/rules).' }] },
  });
  state = reduceAgentBotRun(state, { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
  const finals = renderAgentBotFinal(state, 'en', { frontendUrl: 'https://bandeja.me', inlineUrlButtons: true });
  const last = finals[finals.length - 1].html;
  assert.ok(last.includes('🔎 Web search (Brave)'), 'sources block under the answer');
  assert.ok(last.indexOf('Padel rules') < last.indexOf('🔎'), 'after the answer');
  assert.ok(isWellFormedTelegramHtml(last));
}

console.log('agentBotWeb.test.ts: ok');
