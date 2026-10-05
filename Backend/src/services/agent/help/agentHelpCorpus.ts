/**
 * The assistant's app-help corpus (docs/domains/agent.md "App help"): hand-written
 * markdown in `Backend/agent-help/`, loaded from disk once (no DB, no embeddings) and served
 * by `get_help` / `list_help` (`tools/help.tools.ts`).
 *
 * File shape (validated by `validateAgentHelpCorpus`, run by `npm run check:agent-help` and
 * `npm run test:agent-help`):
 *   - `_index.md`: one line per topic, `- \`topic-id\`: description`.
 *   - every other `*.md` (and `tasks/*.md`): frontmatter `id`, `audience[]`, `requires[]`,
 *     `related[]`, `verified_against[]`, then the body. Task files have the six H2 sections
 *     of `AGENT_HELP_TASK_SECTIONS`, in that order.
 *   - a heading followed by `<!-- audience: trainer, admin -->` is a role-gated section:
 *     `renderAgentHelpTopic` drops it for callers without one of those roles.
 *   - double quotes are reserved for UI labels: `"Create"` or `"Save"{common.save}`. Each
 *     label is an English string from `Frontend/src/i18n/locales/en`; `labels.json` (written
 *     by the checker) maps it to the 11 app languages so the reply quotes the user's UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AgentPrincipal } from '../access/agentPrincipal';

/** Every audience value a file or section may name (defined in `agent-help/roles.md`). */
export const AGENT_HELP_AUDIENCES = [
  'player',
  'organizer',
  'season_admin',
  'trainer',
  'tournament_creator',
  'league_creator',
  'admin',
] as const;
export type AgentHelpAudience = (typeof AGENT_HELP_AUDIENCES)[number];

/**
 * Audiences that every signed-in user holds or can reach on their own (anyone can create a
 * game and so become its organizer). Sections gated on them are never stripped; only the
 * global account flags below are enforced.
 */
const OPEN_AUDIENCES: ReadonlySet<AgentHelpAudience> = new Set(['player', 'organizer', 'season_admin']);

/** H2 sections of a task file, in order. */
export const AGENT_HELP_TASK_SECTIONS = [
  'Goal',
  'Who can do this',
  'Steps in the UI',
  'Settings that matter',
  'Common mistakes',
  'What the assistant can do',
] as const;

/** A topic file must fit one tool result (`TOOL_CONTENT_MAX_CHARS` is 16 000 incl. JSON). */
export const AGENT_HELP_TOPIC_MAX_CHARS = 12_000;

export const AGENT_HELP_TOPIC_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

export type AgentHelpFrontmatter = {
  id: string;
  audience: string[];
  requires: string[];
  related: string[];
  verifiedAgainst: string[];
};

export type AgentHelpTopic = AgentHelpFrontmatter & {
  /** Path relative to the corpus dir, e.g. `tasks/create-tournament.md`. */
  file: string;
  body: string;
};

/** `labels.json`: English label → i18n key, and key → text per app language. */
export type AgentHelpLabels = {
  bare: Record<string, string>;
  keys: Record<string, Record<string, string>>;
};

export type AgentHelpCorpus = {
  dir: string;
  index: string;
  indexEntries: Array<{ id: string; description: string }>;
  topics: Map<string, AgentHelpTopic>;
  labels: AgentHelpLabels;
};

/** `"Label"` or `"Label"{ns.key}` outside code. Group 1 = label, group 2 = optional key. */
export const AGENT_HELP_LABEL_PATTERN = /"([^"\n]{1,120})"(?:\{([A-Za-z0-9_.-]+)\})?/g;

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;
const AUDIENCE_MARKER_PATTERN = /^<!--\s*audience:\s*([a-z_,\s]+?)\s*-->$/;
const INDEX_LINE_PATTERN = /^- `([^`]+)`: (.+)$/;

function parseList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`expected an inline list [a, b], got "${trimmed}"`);
  }
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Minimal frontmatter reader: `key: value` and `key: [a, b]` lines only. */
export function parseAgentHelpFile(source: string, file: string): AgentHelpTopic {
  const normalized = source.replace(/\r\n/g, '\n');
  const match = FRONTMATTER_PATTERN.exec(normalized);
  if (!match) throw new Error(`${file}: missing --- frontmatter ---`);
  const fields = new Map<string, string>();
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error(`${file}: bad frontmatter line "${line}"`);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const list = (key: string): string[] => {
    const raw = fields.get(key);
    if (raw === undefined) throw new Error(`${file}: frontmatter needs ${key}`);
    try {
      return parseList(raw);
    } catch (error) {
      throw new Error(`${file}: ${key}: ${(error as Error).message}`);
    }
  };
  const id = fields.get('id') ?? '';
  const known = new Set(['id', 'audience', 'requires', 'related', 'verified_against']);
  for (const key of fields.keys()) {
    if (!known.has(key)) throw new Error(`${file}: unknown frontmatter key ${key}`);
  }
  return {
    id,
    audience: list('audience'),
    requires: list('requires'),
    related: list('related'),
    verifiedAgainst: list('verified_against'),
    file,
    body: normalized.slice(match[0].length).trim(),
  };
}

export function parseAgentHelpIndex(source: string): Array<{ id: string; description: string }> {
  const entries: Array<{ id: string; description: string }> = [];
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const match = INDEX_LINE_PATTERN.exec(line.trim());
    if (match) entries.push({ id: match[1], description: match[2].trim() });
  }
  return entries;
}

function listMarkdownFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listMarkdownFiles(dir, rel));
    else if (entry.isFile() && entry.name.endsWith('.md') && rel !== '_index.md' && entry.name !== 'README.md') out.push(rel);
  }
  return out.sort();
}

/**
 * Corpus directory: `AGENT_HELP_DIR`, else the copy `npm run build` puts in `dist/agent-help`
 * (this file compiles to `dist/services/agent/help/`), else the source `Backend/agent-help`
 * (ts-node / dev, where this file is `src/services/agent/help/`).
 */
export function resolveAgentHelpDir(): string {
  const candidates = [
    process.env.AGENT_HELP_DIR,
    path.resolve(__dirname, '../../../agent-help'),
    path.resolve(__dirname, '../../../../agent-help'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '_index.md'))) return candidate;
  }
  throw new Error(`agent help corpus not found (looked in ${candidates.join(', ')})`);
}

export function loadAgentHelpCorpus(dir: string = resolveAgentHelpDir()): AgentHelpCorpus {
  const index = fs.readFileSync(path.join(dir, '_index.md'), 'utf8').replace(/\r\n/g, '\n').trim();
  const topics = new Map<string, AgentHelpTopic>();
  for (const file of listMarkdownFiles(dir)) {
    const topic = parseAgentHelpFile(fs.readFileSync(path.join(dir, file), 'utf8'), file);
    if (topics.has(topic.id)) throw new Error(`${file}: duplicate topic id ${topic.id}`);
    topics.set(topic.id, topic);
  }
  const labelsPath = path.join(dir, 'labels.json');
  const labels: AgentHelpLabels = fs.existsSync(labelsPath)
    ? (JSON.parse(fs.readFileSync(labelsPath, 'utf8')) as AgentHelpLabels)
    : { bare: {}, keys: {} };
  return { dir, index, indexEntries: parseAgentHelpIndex(index), topics, labels };
}

let cachedCorpus: AgentHelpCorpus | null = null;

/** Loaded once per process (boot warm-up in `help.tools.ts`); files never change at runtime. */
export function getAgentHelpCorpus(): AgentHelpCorpus {
  if (!cachedCorpus) cachedCorpus = loadAgentHelpCorpus();
  return cachedCorpus;
}

/** Roles of the caller that gate sections. Per-entity roles (organizer, season admin) are open. */
export function agentHelpRolesFor(
  principal: Pick<AgentPrincipal, 'isAdmin' | 'isTrainer' | 'canCreateTournament' | 'canCreateLeague'>,
): Set<AgentHelpAudience> {
  const roles = new Set<AgentHelpAudience>(OPEN_AUDIENCES);
  if (principal.isTrainer) roles.add('trainer');
  if (principal.canCreateTournament) roles.add('tournament_creator');
  if (principal.canCreateLeague) roles.add('league_creator');
  if (principal.isAdmin) {
    roles.add('admin');
    // Platform admins pass every create gate in the app (`roles.md`), so they see every section.
    for (const audience of AGENT_HELP_AUDIENCES) roles.add(audience);
  }
  return roles;
}

export function parseAudienceMarker(line: string): string[] | null {
  const match = AUDIENCE_MARKER_PATTERN.exec(line.trim());
  if (!match) return null;
  return match[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export type AgentHelpOmittedSection = { heading: string; audience: string[] };

/**
 * Drops sections whose `<!-- audience: … -->` marker names none of `roles`. A section runs
 * from its heading to the next heading of the same or a higher level. Markers are removed
 * from the output either way.
 */
export function stripAgentHelpSections(
  body: string,
  roles: ReadonlySet<string>,
): { body: string; omitted: AgentHelpOmittedSection[] } {
  const lines = body.split('\n');
  const out: string[] = [];
  const omitted: AgentHelpOmittedSection[] = [];
  let skipLevel: number | null = null;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line.trim())) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (skipLevel !== null && level <= skipLevel) skipLevel = null;
      if (skipLevel === null) {
        let next = i + 1;
        while (next < lines.length && !lines[next].trim()) next += 1;
        const audience = next < lines.length ? parseAudienceMarker(lines[next]) : null;
        if (audience && !audience.some((value) => roles.has(value))) {
          skipLevel = level;
          omitted.push({ heading: heading[2].trim(), audience });
          continue;
        }
      }
    }
    if (skipLevel !== null) continue;
    if (!inFence && parseAudienceMarker(line)) continue;
    out.push(line);
  }
  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), omitted };
}

/** Replaces `"Label"` / `"Label"{key}` with the label in `locale` (English when unknown). */
export function localizeAgentHelpLabels(body: string, labels: AgentHelpLabels, locale: string): string {
  let inFence = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(AGENT_HELP_LABEL_PATTERN, (_match, label: string, key: string | undefined) => {
        const resolvedKey = key ?? labels.bare[label];
        const translated = resolvedKey ? labels.keys[resolvedKey]?.[locale] : undefined;
        return `"${translated ?? label}"`;
      });
    })
    .join('\n');
}

export type RenderedAgentHelpTopic = {
  id: string;
  related: string[];
  requires: string[];
  content: string;
  omittedSections: AgentHelpOmittedSection[];
};

export function renderAgentHelpTopic(
  topic: AgentHelpTopic,
  options: { roles: ReadonlySet<string>; locale: string; labels: AgentHelpLabels },
): RenderedAgentHelpTopic {
  const { body, omitted } = stripAgentHelpSections(topic.body, options.roles);
  return {
    id: topic.id,
    related: topic.related,
    requires: topic.requires,
    content: localizeAgentHelpLabels(body, options.labels, options.locale),
    omittedSections: omitted,
  };
}

/** Topic ids are kebab-case; tolerate what a model might send (`create_tournament`, spaces, `.md`). */
export function normalizeAgentHelpTopicId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^tasks\//, '')
    .replace(/\.md$/, '')
    .replace(/[\s_]+/g, '-');
}

/**
 * Structural checks shared by the checker script and the test (no Frontend access needed).
 * `repoRoot` enables the `verified_against` path check.
 */
export function validateAgentHelpCorpus(corpus: AgentHelpCorpus, options: { repoRoot?: string } = {}): string[] {
  const errors: string[] = [];
  const audiences = new Set<string>(AGENT_HELP_AUDIENCES);
  const indexIds = corpus.indexEntries.map((entry) => entry.id);
  if (new Set(indexIds).size !== indexIds.length) errors.push('_index.md: duplicate topic id');
  for (const id of indexIds) {
    if (!corpus.topics.has(id)) errors.push(`_index.md: topic ${id} has no file`);
  }
  for (const [id, topic] of corpus.topics) {
    const where = topic.file;
    if (!AGENT_HELP_TOPIC_ID_PATTERN.test(id)) errors.push(`${where}: id "${id}" must be kebab-case`);
    const expectedName = path.basename(topic.file, '.md');
    if (expectedName !== id) errors.push(`${where}: id "${id}" must match the file name`);
    if (!indexIds.includes(id)) errors.push(`${where}: topic ${id} missing from _index.md`);
    if (topic.audience.length === 0) errors.push(`${where}: audience is empty`);
    for (const value of topic.audience) {
      if (!audiences.has(value)) errors.push(`${where}: unknown audience ${value}`);
    }
    for (const related of topic.related) {
      if (!corpus.topics.has(related)) errors.push(`${where}: related topic ${related} does not exist`);
      if (related === id) errors.push(`${where}: related lists itself`);
    }
    for (const value of topic.requires) {
      if (!/^[a-z][a-zA-Z0-9_.]*$/.test(value)) errors.push(`${where}: bad requires value ${value}`);
    }
    if (topic.verifiedAgainst.length === 0) errors.push(`${where}: verified_against is empty`);
    if (options.repoRoot) {
      for (const source of topic.verifiedAgainst) {
        if (!fs.existsSync(path.join(options.repoRoot, source))) errors.push(`${where}: verified_against ${source} does not exist`);
      }
    }
    if (topic.body.length > AGENT_HELP_TOPIC_MAX_CHARS) {
      errors.push(`${where}: ${topic.body.length} chars, max ${AGENT_HELP_TOPIC_MAX_CHARS}`);
    }
    if (!/^# \S/.test(topic.body)) errors.push(`${where}: body must start with a # title`);
    for (const line of topic.body.split('\n')) {
      const marker = parseAudienceMarker(line);
      if (marker) {
        for (const value of marker) if (!audiences.has(value)) errors.push(`${where}: section audience ${value} unknown`);
      } else if (/<!--\s*audience/.test(line)) {
        errors.push(`${where}: malformed audience marker "${line.trim()}"`);
      }
    }
    if (topic.file.startsWith('tasks/')) {
      const h2 = topic.body
        .split('\n')
        .filter((line) => /^## /.test(line))
        .map((line) => line.slice(3).trim());
      const expected = [...AGENT_HELP_TASK_SECTIONS];
      if (JSON.stringify(h2) !== JSON.stringify(expected)) {
        errors.push(`${where}: H2 sections must be exactly ${expected.join(' | ')} (got ${h2.join(' | ')})`);
      }
    }
  }
  return errors;
}
