/**
 * `npm run check:agent-help`: validates the
 * assistant's help corpus in `Backend/agent-help/`:
 *   - frontmatter shape, ids ↔ `_index.md`, related topics, task sections, size, audience markers;
 *   - every `verified_against` path exists in the repo;
 *   - every quoted UI label exists in `Frontend/src/i18n/locales/en` (and is unambiguous);
 *   - `agent-help/labels.json` matches the Frontend locales (rewrite with `-- --write`).
 * Exit code 1 on any problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAgentHelpCorpus, validateAgentHelpCorpus } from '../src/services/agent/help/agentHelpCorpus';
import { buildAgentHelpLabels } from '../src/services/agent/help/agentHelpLabels';

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const corpusDir = path.join(backendRoot, 'agent-help');
const localesDir = path.join(repoRoot, 'Frontend/src/i18n/locales');
const labelsPath = path.join(corpusDir, 'labels.json');
const write = process.argv.includes('--write');

const corpus = loadAgentHelpCorpus(corpusDir);
const errors = validateAgentHelpCorpus(corpus, { repoRoot });
const { labels, errors: labelErrors } = buildAgentHelpLabels(corpus, localesDir);
errors.push(...labelErrors);

const expected = `${JSON.stringify(labels, null, 2)}\n`;
if (errors.length === 0) {
  const current = fs.existsSync(labelsPath) ? fs.readFileSync(labelsPath, 'utf8') : '';
  if (write) {
    if (current !== expected) fs.writeFileSync(labelsPath, expected);
  } else if (current !== expected) {
    errors.push('agent-help/labels.json is out of date with the corpus or the Frontend locales: run `npm run check:agent-help -- --write`');
  }
}

if (errors.length) {
  for (const error of errors) console.error(`check-agent-help: ${error}`);
  console.error(`check-agent-help: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(
  `check-agent-help: ok (${corpus.topics.size} topics, ${Object.keys(labels.keys).length} labels${write ? ', labels.json written' : ''})`,
);
