/**
 * UI-label check for the help corpus (docs/domains/agent.md "App help"). Every
 * quoted label in a topic must be an English string of the app (`Frontend/src/i18n/locales/en`);
 * `buildAgentHelpLabels` resolves each one to its i18n key and its text in the 11 app
 * languages, which `npm run check:agent-help -- --write` stores as `agent-help/labels.json`
 * (the deployed backend has no Frontend tree, so it reads that snapshot).
 *
 * A bare `"Label"` is accepted when every key with that English text has the same text in
 * every language; otherwise the author pins the key: `"Save"{common.save}`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_HELP_LABEL_PATTERN, type AgentHelpCorpus, type AgentHelpLabels } from './agentHelpCorpus';

export const AGENT_HELP_LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function flatten(value: Json, prefix: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(prefix, value);
    return;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
}

/**
 * One locale as the app builds it (`locales/<lng>/index.ts`): top-level files are spread (each
 * wraps its namespace key), files in a sub-folder sit under `<folder>.<file>`.
 */
export function readFrontendLocale(localesDir: string, locale: string): Map<string, string> {
  const out = new Map<string, string>();
  const root = path.join(localesDir, locale);
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      flatten(JSON.parse(fs.readFileSync(path.join(root, entry.name), 'utf8')) as Json, '', out);
    } else if (entry.isDirectory()) {
      for (const file of fs.readdirSync(path.join(root, entry.name)).filter((name) => name.endsWith('.json')).sort()) {
        const json = JSON.parse(fs.readFileSync(path.join(root, entry.name, file), 'utf8')) as Json;
        flatten(json, `${entry.name}.${file.replace(/\.json$/, '')}`, out);
      }
    }
  }
  return out;
}

export type AgentHelpLabelUse = { file: string; line: number; label: string; key?: string };

/** Quoted labels in topic bodies, outside code fences, inline code and HTML comments. */
export function extractAgentHelpLabels(corpus: AgentHelpCorpus): AgentHelpLabelUse[] {
  const uses: AgentHelpLabelUse[] = [];
  for (const topic of corpus.topics.values()) {
    let inFence = false;
    topic.body.split('\n').forEach((rawLine, index) => {
      if (/^```/.test(rawLine.trim())) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const line = rawLine.replace(/`[^`]*`/g, '').replace(/<!--.*?-->/g, '');
      for (const match of line.matchAll(AGENT_HELP_LABEL_PATTERN)) {
        uses.push({ file: topic.file, line: index + 1, label: match[1], ...(match[2] ? { key: match[2] } : {}) });
      }
      const quotes = (line.match(/"/g) ?? []).length;
      if (quotes % 2 !== 0) uses.push({ file: topic.file, line: index + 1, label: '', key: '__unbalanced__' });
    });
  }
  return uses;
}

export function buildAgentHelpLabels(
  corpus: AgentHelpCorpus,
  localesDir: string,
): { labels: AgentHelpLabels; errors: string[] } {
  const locales = new Map(AGENT_HELP_LOCALES.map((locale) => [locale, readFrontendLocale(localesDir, locale)]));
  const en = locales.get('en')!;
  const byText = new Map<string, string[]>();
  for (const [key, text] of en) {
    const list = byText.get(text) ?? [];
    list.push(key);
    byText.set(text, list);
  }
  const translationsOf = (key: string): Record<string, string> =>
    Object.fromEntries(AGENT_HELP_LOCALES.map((locale) => [locale, locales.get(locale)!.get(key) ?? en.get(key) ?? '']));

  const errors: string[] = [];
  const labels: AgentHelpLabels = { bare: {}, keys: {} };
  for (const use of extractAgentHelpLabels(corpus)) {
    const where = `${use.file}:${use.line}`;
    if (use.key === '__unbalanced__') {
      errors.push(`${where}: odd number of double quotes (quotes are reserved for UI labels)`);
      continue;
    }
    if (use.key) {
      const text = en.get(use.key);
      if (text === undefined) errors.push(`${where}: i18n key ${use.key} does not exist in the en locale`);
      else if (text !== use.label) errors.push(`${where}: "${use.label}" ≠ en ${use.key} ("${text}")`);
      else labels.keys[use.key] = translationsOf(use.key);
      continue;
    }
    const keys = (byText.get(use.label) ?? []).sort();
    if (keys.length === 0) {
      errors.push(`${where}: "${use.label}" is not an English UI string (Frontend/src/i18n/locales/en)`);
      continue;
    }
    const variants = new Set(keys.map((key) => JSON.stringify(translationsOf(key))));
    if (variants.size > 1) {
      errors.push(`${where}: "${use.label}" is translated differently under ${keys.length} keys; pin one, e.g. "${use.label}"{${keys[0]}} (${keys.slice(0, 6).join(', ')})`);
      continue;
    }
    labels.bare[use.label] = keys[0];
    labels.keys[keys[0]] = translationsOf(keys[0]);
  }
  const sorted = (record: Record<string, unknown>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  return {
    labels: { bare: sorted(labels.bare) as AgentHelpLabels['bare'], keys: sorted(labels.keys) as AgentHelpLabels['keys'] },
    errors,
  };
}
