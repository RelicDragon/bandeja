/**
 * App help (docs/domains/agent.md "App help"): `list_help` returns the topic index,
 * `get_help {topic}` one topic from the corpus in `Backend/agent-help/`, read from disk at
 * boot (`help/agentHelpCorpus.ts`; no DB, no embeddings).
 *
 * `get_help` drops the sections gated on an account role the caller lacks (trainer,
 * tournament/league creator, platform admin) and says which it dropped, so the model can
 * name what is missing instead of describing steps the user cannot take. That is a guard
 * behind the prompt rule, not a replacement for it. UI labels come back in the user's
 * language (`labels.json`, generated from the Frontend locales by `npm run check:agent-help`).
 *
 * A miss (unknown topic) is answered with the topic list, logged as `[agent-help] miss`, and
 * marked `helpMiss` in the tool message stored on the run, which
 * `listAgentHelpMissesForAdmin` (`GET /api/admin/agent/help-misses`) aggregates.
 */
import { z } from 'zod/v4';
import {
  agentHelpRolesFor,
  getAgentHelpCorpus,
  normalizeAgentHelpTopicId,
  renderAgentHelpTopic,
} from '../help/agentHelpCorpus';
import { agentHelpT } from '../i18n/agentHelpI18n';
import { agentLang } from '../i18n/agentI18n';
import { defineTool, type AgentToolContext } from './registry';

export const AGENT_HELP_MISS_MARKER = 'helpMiss';

export function recordAgentHelpMiss(ctx: Pick<AgentToolContext, 'runId' | 'principal'>, topic: string): void {
  console.warn('[agent-help] miss', JSON.stringify({ runId: ctx.runId ?? null, userId: ctx.principal.userId, topic }));
}

export const listHelpTool = defineTool({
  name: 'list_help',
  description:
    'The app help topic index: one line per topic id with what it covers (creating tournaments, leagues, games, ' +
    'trainings, splitting costs, booking courts, inviting players, entering results, roles and permissions, where things are in the app). ' +
    'Call it to pick the topic for get_help when you are not sure of the id.',
  kind: 'read',
  scope: 'user',
  input: z.object({}).strict(),
  label: (_args, locale) => agentHelpT(locale, 'label.listHelp'),
  handler: async (ctx) => {
    const corpus = getAgentHelpCorpus();
    return {
      data: {
        topics: corpus.indexEntries,
        note: 'Call get_help with one of these ids before answering how-to, permission or settings questions.',
      },
      summary: agentHelpT(ctx.locale, 'summary.index', { count: corpus.indexEntries.length }),
    };
  },
});

export const getHelpTool = defineTool({
  name: 'get_help',
  description:
    'How the app works, from the help corpus: one topic (ids from list_help, e.g. "create-tournament", "roles", "ui-map") with ' +
    'who can do it and how others get the permission, the exact UI steps and labels, what each setting causes, common ' +
    '"why can\'t I" answers, and which assistant tools can do it. Sections for roles this user does not have are left out ' +
    '(omittedSections). Call it before answering any how-do-I, why-can\'t-I or what-should-I-set question.',
  kind: 'read',
  scope: 'user',
  input: z
    .object({
      topic: z.string().trim().min(1).max(80).describe('Topic id from list_help, e.g. "create-tournament"'),
    })
    .strict(),
  label: (_args, locale) => agentHelpT(locale, 'label.getHelp'),
  handler: async (ctx, args) => {
    const corpus = getAgentHelpCorpus();
    const id = normalizeAgentHelpTopicId(args.topic);
    const topic = corpus.topics.get(id);
    if (!topic) {
      recordAgentHelpMiss(ctx, id);
      return {
        data: {
          found: false,
          [AGENT_HELP_MISS_MARKER]: id,
          availableTopics: corpus.indexEntries.map((entry) => entry.id),
          note: 'No such help topic. Retry with an id from availableTopics if one fits; otherwise tell the user the help does not cover this and do not guess app behavior or settings.',
        },
        summary: agentHelpT(ctx.locale, 'summary.miss', { topic: id }),
      };
    }
    const rendered = renderAgentHelpTopic(topic, {
      roles: agentHelpRolesFor(ctx.principal),
      locale: agentLang(ctx.locale),
      labels: corpus.labels,
    });
    return {
      data: {
        found: true,
        topic: rendered.id,
        related: rendered.related,
        requires: rendered.requires,
        ...(rendered.omittedSections.length
          ? {
              omittedSections: rendered.omittedSections,
              omittedNote:
                'These sections are for roles this user does not have. Do not describe their steps; say which role or permission is missing and how to get it (see "Who can do this").',
            }
          : {}),
        content: rendered.content,
      },
      summary: agentHelpT(ctx.locale, 'summary.topic', { topic: rendered.id }),
    };
  },
});

export const HELP_TOOLS = [listHelpTool, getHelpTool];

// Boot warm-up: read the corpus when the tool catalogue loads, not on the first question. A
// missing corpus is logged here and surfaces again as a tool error on use.
try {
  getAgentHelpCorpus();
} catch (error) {
  console.error('[agent-help] corpus failed to load', error);
}
