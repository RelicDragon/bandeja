import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { getAiService } from '../src/services/ai/ai.service';
import { LLM_REASON } from '../src/services/ai/llmReasons';
import {
  readBaseline,
  commitCountSince,
  gatherCommitLog,
} from './lib/app-release';

const SYSTEM_PROMPT = `You write "What's New" release notes for Bandeja — a multisport game scheduling and social app (padel, tennis, table tennis, badminton, pickleball, squash) on iOS and Android.

Rules:
- Audience: players using the app, not developers
- Clear, friendly language; no commit hashes, PR numbers, file paths, or internal jargon, no technical details
- Merge related commits into one bullet; skip version bumps, CI/deploy, refactors with no user-visible change, dependency updates, lint/tests-only work, docs-only changes
- Each bullet: one concrete user benefit (what they can do or what works better)
- Prefer 4–8 bullets; only add more when there are clearly separate user-facing features
- Do not use a generic "Bug fixes and improvements" bullet — name the improvement when possible
- English only
- Output format:
  1) Main notes (ready to paste into App Store Connect and Google Play)
  2) Blank line, then a line exactly: ---SHORT---
  3) A single paragraph under 500 characters for Google Play short description (no bullets)`;

function usage(): never {
  console.error(`Usage: app-release-whats-new.ts [--dry-run] [--save <file>]

  Compiles user-facing What's New from commits after docs/app-release-baseline.txt.
  Requires OPENAI_API_KEY or DEEPSEEK_API_KEY in Backend/.env (AI_PROVIDER).`);
  process.exit(1);
}

function parseArgs(argv: string[]): { dryRun: boolean; savePath: string | null } {
  let dryRun = false;
  let savePath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--save') {
      const next = argv[i + 1];
      if (!next) usage();
      savePath = next;
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      usage();
    } else {
      console.error(`Unknown option: ${arg}`);
      usage();
    }
  }
  return { dryRun, savePath };
}

async function main(): Promise<void> {
  const { dryRun, savePath } = parseArgs(process.argv.slice(2));
  const baseline = readBaseline();
  const count = commitCountSince(baseline);

  if (count === 0) {
    console.log('(none — HEAD is the baseline commit; nothing to summarize)');
    return;
  }

  const commitLog = gatherCommitLog(baseline);
  const userPrompt = `There are ${count} commits since the last app store release (baseline ${baseline.slice(0, 7)}).

Summarize the user-visible changes for store release notes:

${commitLog}`;

  if (dryRun) {
    console.log('# Dry run — prompt that would be sent to the LLM:\n');
    console.log('--- SYSTEM ---');
    console.log(SYSTEM_PROMPT);
    console.log('\n--- USER ---');
    console.log(userPrompt);
    return;
  }

  const ai = getAiService();
  if (!ai.isConfigured()) {
    console.error('AI is not configured. Set AI_PROVIDER and OPENAI_API_KEY or DEEPSEEK_API_KEY in Backend/.env');
    process.exit(1);
  }

  process.stderr.write(`Summarizing ${count} commits with LLM...\n`);
  const notes = await ai.createCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.35,
    max_tokens: 2000,
    reason: LLM_REASON.APP_RELEASE_NOTES,
  });

  if (savePath) {
    const resolved = path.resolve(savePath);
    fs.writeFileSync(resolved, `${notes}\n`, 'utf-8');
    process.stderr.write(`Saved to ${resolved}\n`);
  }

  console.log(notes);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
