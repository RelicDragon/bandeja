/**
 * App help `list_help` / `get_help` (real dev DB for the miss log + admin route, no LLM):
 *   - the shipped corpus (`Backend/agent-help/`): frontmatter, task sections, ids ↔ `_index.md`,
 *     related topics, `verified_against` paths, size; `labels.json` matches the Frontend locales;
 *   - parser / validator negatives on synthetic files;
 *   - section stripping per role (synthetic + the real corpus), markers removed, code fences kept;
 *   - roles from the account flags (trainer, tournament / league creator, admin sees all);
 *   - topic ids a model might send (`create_tournament`, `tasks/x.md`) resolve;
 *   - tools: core group, read, visible to every user, strict input; index = `_index.md`;
 *     labels come back in the user's language;
 *   - unknown topic: `found: false` + `helpMiss` + the topic list, and
 *     `GET /api/admin/agent/help-misses` (admin only) aggregates misses stored on runs.
 */
import '../../../routes/__tests__/agentRoutesTestEnv';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { AgentMessageRole, AgentRunStatus } from '@prisma/client';
import app from '../../../app';
import prisma from '../../../config/database';
import { generateShortAccessToken } from '../../../utils/jwt';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { listAgentHelpMissesForAdmin } from '../agentAudit.service';
import { serializeToolContent } from '../agentRun.service';
import {
  AGENT_HELP_TASK_SECTIONS,
  AGENT_HELP_TOPIC_MAX_CHARS,
  agentHelpRolesFor,
  getAgentHelpCorpus,
  localizeAgentHelpLabels,
  normalizeAgentHelpTopicId,
  parseAgentHelpFile,
  parseAgentHelpIndex,
  resolveAgentHelpDir,
  stripAgentHelpSections,
  validateAgentHelpCorpus,
  type AgentHelpCorpus,
  type AgentHelpTopic,
} from '../help/agentHelpCorpus';
import { buildAgentHelpLabels } from '../help/agentHelpLabels';
import { getAgentToolRegistry } from '../tools';
import { agentToolGroupOf, type AgentToolContext } from '../tools/registry';

const repoRoot = path.resolve(__dirname, '../../../../..');
const localesDir = path.join(repoRoot, 'Frontend/src/i18n/locales');

const base: AgentPrincipal = {
  userId: 'help-user',
  isAdmin: false,
  isTrainer: false,
  canCreateTournament: false,
  canCreateLeague: false,
  currentCityId: null,
  language: 'en',
  agentMemoryEnabled: false,
};
const admin: AgentPrincipal = { ...base, userId: 'help-admin', isAdmin: true };
const ctx = (principal: AgentPrincipal, locale = 'en', runId?: string): AgentToolContext => ({
  principal,
  locale,
  timezone: 'UTC',
  now: new Date(),
  runId,
});

type HelpData = {
  found: boolean;
  topic?: string;
  content?: string;
  omittedSections?: Array<{ heading: string; audience: string[] }>;
  helpMiss?: string;
  availableTopics?: string[];
  related?: string[];
};

function topicFixture(body: string, overrides: Partial<AgentHelpTopic> = {}): AgentHelpTopic {
  return { id: 'x-topic', audience: ['player'], requires: [], related: [], verifiedAgainst: ['Backend/package.json'], file: 'x-topic.md', body, ...overrides };
}

function corpusFixture(topics: AgentHelpTopic[], index: string): AgentHelpCorpus {
  return {
    dir: '/nowhere',
    index,
    indexEntries: parseAgentHelpIndex(index),
    topics: new Map(topics.map((topic) => [topic.id, topic])),
    labels: { bare: {}, keys: {} },
  };
}

async function corpusChecks(): Promise<AgentHelpCorpus> {
  const dir = resolveAgentHelpDir();
  assert.ok(fs.existsSync(path.join(dir, '_index.md')), 'corpus found');
  const corpus = getAgentHelpCorpus();
  assert.deepEqual(validateAgentHelpCorpus(corpus, { repoRoot }), [], 'shipped corpus is valid');
  for (const id of ['roles', 'ui-map', 'create-game', 'create-tournament', 'create-league-season', 'create-training', 'invite-players', 'enter-results', 'split-costs', 'book-court']) {
    assert.ok(corpus.topics.has(id), `topic ${id}`);
  }
  assert.deepEqual(
    corpus.indexEntries.map((entry) => entry.id).sort(),
    [...corpus.topics.keys()].sort(),
    'every index id has a file and every file is indexed',
  );
  for (const topic of corpus.topics.values()) {
    assert.ok(topic.body.length <= AGENT_HELP_TOPIC_MAX_CHARS, `${topic.file} fits one tool result`);
  }
  if (fs.existsSync(localesDir)) {
    const { labels, errors } = buildAgentHelpLabels(corpus, localesDir);
    assert.deepEqual(errors, [], 'every quoted label is an English UI string');
    assert.deepEqual(corpus.labels, labels, 'labels.json is current (npm run check:agent-help -- --write)');
  }
  return corpus;
}

function parserChecks(): void {
  assert.throws(() => parseAgentHelpFile('# no frontmatter', 'a.md'), /missing --- frontmatter/);
  assert.throws(
    () => parseAgentHelpFile('---\nid: a\naudience: [player]\nrequires: []\nrelated: []\nverified_against: [x]\nsecret: y\n---\n# A', 'a.md'),
    /unknown frontmatter key secret/,
  );
  assert.throws(
    () => parseAgentHelpFile('---\nid: a\naudience: player\nrequires: []\nrelated: []\nverified_against: [x]\n---\n# A', 'a.md'),
    /audience: expected an inline list/,
  );
  const parsed = parseAgentHelpFile(
    '---\r\nid: a-b\r\naudience: [player, trainer]\r\nrequires: []\r\nrelated: [roles]\r\nverified_against: [Backend/package.json]\r\n---\r\n# A\r\n\r\nText',
    'a-b.md',
  );
  assert.deepEqual(
    { id: parsed.id, audience: parsed.audience, related: parsed.related, body: parsed.body },
    { id: 'a-b', audience: ['player', 'trainer'], related: ['roles'], body: '# A\n\nText' },
  );

  const sections = AGENT_HELP_TASK_SECTIONS.map((section) => `## ${section}\n\ntext`).join('\n\n');
  const good = topicFixture(`# Good\n\n${sections}`, { id: 'good', file: 'tasks/good.md' });
  const bad = topicFixture('No title\n\n## Goal\n\n<!-- audience: wizard -->\n\n<!--audience trainer-->', {
    id: 'bad',
    file: 'tasks/bad.md',
    audience: ['player', 'ghost'],
    related: ['missing', 'bad'],
    requires: ['Bad Value'],
    verifiedAgainst: ['does/not/exist.ts'],
  });
  const orphan = topicFixture('# Orphan', { id: 'orphan', file: 'orphan.md' });
  const errors = validateAgentHelpCorpus(corpusFixture([good, bad, orphan], '- `good`: ok\n- `bad`: bad\n- `ghost-topic`: none'), { repoRoot });
  const expectError = (pattern: RegExp) => assert.ok(errors.some((error) => pattern.test(error)), `validator reports ${pattern}: ${errors.join(' | ')}`);
  expectError(/_index\.md: topic ghost-topic has no file/);
  expectError(/orphan\.md: topic orphan missing from _index\.md/);
  expectError(/tasks\/bad\.md: unknown audience ghost/);
  expectError(/related topic missing does not exist/);
  expectError(/related lists itself/);
  expectError(/bad requires value Bad Value/);
  expectError(/verified_against does\/not\/exist\.ts does not exist/);
  expectError(/body must start with a # title/);
  expectError(/section audience wizard unknown/);
  expectError(/malformed audience marker/);
  expectError(/tasks\/bad\.md: H2 sections must be exactly/);
  assert.ok(!errors.some((error) => error.startsWith('tasks/good.md')), `good task passes: ${errors.join(' | ')}`);
  assert.ok(
    validateAgentHelpCorpus(corpusFixture([topicFixture(`# Big\n${'x'.repeat(AGENT_HELP_TOPIC_MAX_CHARS)}`, { id: 'big', file: 'big.md' })], '- `big`: big')).some((e) =>
      /max 12000/.test(e),
    ),
    'size limit',
  );
}

function strippingChecks(): void {
  const body = [
    '# Topic',
    '## Who can do this',
    'Everyone reads this.',
    '### Trainer steps',
    '<!-- audience: trainer, admin -->',
    'Trainer only.',
    '#### Detail',
    'Still trainer only.',
    '### Player steps',
    'Everyone again.',
    '```',
    '# not a heading',
    '<!-- audience: admin -->',
    '```',
    '## Admin',
    '',
    '<!-- audience: admin -->',
    'Admin only.',
    '## Open',
    '<!-- audience: player -->',
    'Open section.',
  ].join('\n');
  const player = stripAgentHelpSections(body, agentHelpRolesFor(base));
  assert.deepEqual(player.omitted, [
    { heading: 'Trainer steps', audience: ['trainer', 'admin'] },
    { heading: 'Admin', audience: ['admin'] },
  ]);
  for (const hidden of ['Trainer only.', 'Still trainer only.', 'Admin only.']) assert.ok(!player.body.includes(hidden), `player: ${hidden} stripped`);
  for (const shown of ['Everyone reads this.', 'Everyone again.', '# not a heading', 'Open section.']) assert.ok(player.body.includes(shown), `player: ${shown} kept`);
  assert.ok(player.body.includes('```\n# not a heading\n<!-- audience: admin -->\n```'), 'code fences untouched');
  assert.ok(!/<!-- audience: (trainer|player)/.test(player.body), 'markers removed');

  const trainer = stripAgentHelpSections(body, agentHelpRolesFor({ ...base, isTrainer: true }));
  assert.deepEqual(trainer.omitted.map((o) => o.heading), ['Admin']);
  assert.ok(trainer.body.includes('Still trainer only.'));
  const adminView = stripAgentHelpSections(body, agentHelpRolesFor(admin));
  assert.deepEqual(adminView.omitted, [], 'admins see every section');

  const roles = (p: Partial<AgentPrincipal>) => [...agentHelpRolesFor({ ...base, ...p })].sort();
  assert.deepEqual(roles({}), ['organizer', 'player', 'season_admin']);
  assert.deepEqual(roles({ canCreateTournament: true }), ['organizer', 'player', 'season_admin', 'tournament_creator']);
  assert.deepEqual(roles({ canCreateLeague: true }), ['league_creator', 'organizer', 'player', 'season_admin']);
  assert.deepEqual(roles({ isAdmin: true }), ['admin', 'league_creator', 'organizer', 'player', 'season_admin', 'tournament_creator', 'trainer']);

  assert.equal(normalizeAgentHelpTopicId(' Create_Tournament '), 'create-tournament');
  assert.equal(normalizeAgentHelpTopicId('tasks/book-court.md'), 'book-court');
  assert.equal(normalizeAgentHelpTopicId('split costs'), 'split-costs');

  const labels = { bare: { Save: 'common.save' }, keys: { 'common.save': { en: 'Save', ru: 'Сохранить' }, 'x.create': { en: 'Create', ru: 'Создать' } } };
  assert.equal(
    localizeAgentHelpLabels('Tap "Save" then "Create"{x.create} and "Unknown".\n```\n"Save"\n```', labels, 'ru'),
    'Tap "Сохранить" then "Создать" and "Unknown".\n```\n"Save"\n```',
  );
}

async function toolChecks(corpus: AgentHelpCorpus): Promise<void> {
  const registry = getAgentToolRegistry();
  for (const name of ['list_help', 'get_help']) {
    const tool = registry.get(name);
    assert.ok(tool, `${name} registered`);
    assert.equal(tool.kind, 'read');
    assert.equal(tool.scope, 'user');
    assert.equal(agentToolGroupOf(tool), 'core', `${name} is always listed`);
    for (const principal of [base, admin, { ...base, agentMemoryEnabled: true }]) {
      assert.ok(registry.toolsForPrincipal(principal).some((t) => t.name === name), `${name} visible to every user`);
    }
  }
  const getHelp = registry.get('get_help')!;
  assert.equal(getHelp.input.safeParse({ topic: 'roles', extra: 1 }).success, false, 'strict input');
  assert.equal(getHelp.input.safeParse({ topic: ' ' }).success, false, 'empty topic refused');
  assert.equal(registry.get('list_help')!.input.safeParse({ any: 1 }).success, false, 'list_help takes no args');

  const index = await registry.executeTool(ctx(base), 'list_help', {});
  assert.equal(index.ok, true);
  assert.deepEqual((index.data as { topics: unknown }).topics, corpus.indexEntries, 'list_help = _index.md');
  assert.equal(index.summary, `${corpus.indexEntries.length} help topics`);
  assert.equal((await registry.executeTool(ctx(base, 'ru'), 'list_help', {})).label, 'Смотрю разделы справки', 'localized chip');

  const roles = await registry.executeTool(ctx(base), 'get_help', { topic: 'Roles' });
  const rolesData = roles.data as HelpData;
  assert.equal(roles.ok, true);
  assert.equal(rolesData.found, true);
  assert.equal(rolesData.topic, 'roles');
  assert.ok(rolesData.content?.startsWith('# '), 'content is the topic body');
  assert.ok(!rolesData.content?.includes('<!-- audience'), 'no markers reach the model');
  assert.equal(roles.summary, 'Help: roles');

  // The real corpus gates role-only steps: a plain player gets fewer sections than an admin,
  // with the omitted headings named.
  const gated = [...corpus.topics.values()].filter((topic) => stripAgentHelpSections(topic.body, agentHelpRolesFor(base)).omitted.length > 0);
  assert.ok(gated.length > 0, 'some topic has role-gated sections');
  for (const topic of gated) {
    const forPlayer = (await registry.executeTool(ctx(base), 'get_help', { topic: topic.id })).data as HelpData;
    const forAdmin = (await registry.executeTool(ctx(admin), 'get_help', { topic: topic.id })).data as HelpData;
    assert.ok(forPlayer.omittedSections?.length, `${topic.id}: player sees omittedSections`);
    assert.equal(forAdmin.omittedSections, undefined, `${topic.id}: admin sees everything`);
    assert.ok((forPlayer.content?.length ?? 0) < (forAdmin.content?.length ?? 0), `${topic.id}: player content is shorter`);
  }

  // Labels come back in the user's language.
  const translated = Object.entries(corpus.labels.bare).find(([label, key]) => {
    const ru = corpus.labels.keys[key]?.ru;
    return ru && ru !== label && [...corpus.topics.values()].some((topic) => topic.body.includes(`"${label}"`));
  });
  assert.ok(translated, 'the corpus quotes at least one translated label');
  const [label, key] = translated;
  const ruTopic = [...corpus.topics.values()].find((topic) => {
    const { body } = stripAgentHelpSections(topic.body, agentHelpRolesFor(admin));
    return body.includes(`"${label}"`);
  })!;
  const ruContent = ((await registry.executeTool(ctx(admin, 'ru'), 'get_help', { topic: ruTopic.id })).data as HelpData).content ?? '';
  assert.ok(ruContent.includes(`"${corpus.labels.keys[key].ru}"`), `"${label}" is quoted in Russian`);
}

async function missChecks(suffix: string): Promise<void> {
  const registry = getAgentToolRegistry();
  const missTopic = `qa-help-miss-${suffix}`;
  const miss = await registry.executeTool(ctx(base), 'get_help', { topic: missTopic.toUpperCase() });
  const missData = miss.data as HelpData;
  assert.equal(miss.ok, true, 'a miss is an answer, not a tool error');
  assert.equal(missData.found, false);
  assert.equal(missData.helpMiss, missTopic);
  assert.deepEqual(missData.availableTopics, getAgentHelpCorpus().indexEntries.map((entry) => entry.id));
  assert.equal(miss.summary, `No help topic "${missTopic}"`);

  const user = await prisma.user.create({ data: { phone: `qa-agent-help-${suffix}`, firstName: 'Help', isAdmin: false } });
  const adminUser = await prisma.user.create({ data: { phone: `qa-agent-help-admin-${suffix}`, firstName: 'HelpAdmin', isAdmin: true } });
  const chat = await prisma.agentChat.create({ data: { userId: user.id, title: `Help ${suffix}` } });
  const server = app.listen(0);
  try {
    const runs = [];
    for (let i = 0; i < 2; i += 1) runs.push(await prisma.agentRun.create({ data: { chatId: chat.id, userId: user.id, status: AgentRunStatus.COMPLETED } }));
    const found = await registry.executeTool(ctx(base), 'get_help', { topic: 'roles' });
    let seq = 1;
    for (const [run, contents] of [
      [runs[0], [serializeToolContent(miss), serializeToolContent(found)]],
      [runs[1], [serializeToolContent(miss), 'not json helpMiss']],
    ] as const) {
      await prisma.agentMessage.create({
        data: {
          chatId: chat.id,
          seq: seq++,
          role: AgentMessageRole.TOOL,
          runId: run.id,
          content: [],
          llmMessages: contents.map((content, index) => ({ role: 'tool', tool_call_id: `call-${index}`, content })),
        },
      });
    }
    const report = await listAgentHelpMissesForAdmin({ days: 1 });
    const row = report.misses.find((entry) => entry.topic === missTopic);
    assert.ok(row, 'miss aggregated');
    assert.equal(row.count, 2, 'one per stored miss; found topics and junk ignored');
    assert.deepEqual([...row.runIds].sort(), runs.map((run) => run.id).sort());
    assert.ok(!report.misses.some((entry) => entry.topic === 'roles'), 'a found topic is not a miss');

    const { port } = server.address() as AddressInfo;
    await prisma.user.updateMany({ where: { id: { in: [user.id, adminUser.id] } }, data: { lastUserIP: '::ffff:127.0.0.1' } });
    const call = async (userId: string | null, query = '') => {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/agent/help-misses${query}`, {
        headers: userId ? { Authorization: `Bearer ${generateShortAccessToken({ userId })}` } : {},
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as { data?: { days: number; misses: Array<{ topic: string; count: number }> } } };
    };
    assert.equal((await call(null)).status, 401, 'anonymous refused');
    assert.equal((await call(user.id)).status, 403, 'non-admin refused');
    const ok = await call(adminUser.id, '?days=1');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data?.days, 1);
    assert.equal(ok.body.data?.misses.find((entry) => entry.topic === missTopic)?.count, 2);
    assert.equal((await call(adminUser.id)).body.data?.days, 30, 'default window');
    assert.equal((await call(adminUser.id, '?days=0')).status, 400, 'days validated');
  } finally {
    server.close();
    await prisma.agentMessage.deleteMany({ where: { chatId: chat.id } });
    await prisma.agentRun.deleteMany({ where: { chatId: chat.id } });
    await prisma.agentChat.deleteMany({ where: { id: chat.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, adminUser.id] } } });
  }
}

void (async () => {
  let exitCode = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const corpus = await corpusChecks();
    parserChecks();
    strippingChecks();
    await toolChecks(corpus);
    await missChecks(suffix);
    console.log(`agentHelp.integration.test.ts: ok (${corpus.topics.size} topics)`);
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
