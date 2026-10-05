#!/usr/bin/env node
// `postbuild`: ships the assistant's help corpus (Backend/agent-help, docs/domains/agent.md "App help")
// next to the compiled code, as dist/agent-help. `tsc` copies only .ts output; the loader
// (`src/services/agent/help/agentHelpCorpus.ts`) reads dist/agent-help first.
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const source = path.join(backend, 'agent-help');
const target = path.join(backend, 'dist', 'agent-help');

if (!fs.existsSync(path.join(source, '_index.md'))) {
  console.error(`copy-agent-help: ${source}/_index.md not found`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true, filter: (file) => !file.endsWith('README.md') });
const count = fs.readdirSync(target, { recursive: true }).filter((file) => String(file).endsWith('.md')).length;
console.log(`copy-agent-help: ${count} files → dist/agent-help`);
