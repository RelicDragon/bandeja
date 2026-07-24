import { getAiService } from '../../src/services/ai/ai.service';
import { LLM_REASON } from '../../src/services/ai/llmReasons';
import { commitCountSince, gatherCommitLog } from './app-release';
import type { ReleaseNotes, ReleaseNotesSource } from './app-release-session';

export const RELEASE_NOTES_SYSTEM_PROMPT = `You write "What's New" release notes for Bandeja — a multisport game scheduling and social app (padel, tennis, table tennis, badminton, pickleball, squash) on iOS and Android.

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

export const RELEASE_NOTE_TEMPLATES: Array<{ id: string; label: string; notes: ReleaseNotes }> = [
  {
    id: 'stability',
    label: 'Stability & bug fixes',
    notes: {
      source: 'template',
      main: `• Fixed issues that could affect reliability during games and chats
• Improved error handling when syncing messages offline
• Resolved crashes reported on some devices`,
      short:
        'Stability improvements and bug fixes for a smoother experience scheduling games, chatting with players, and tracking matches.',
    },
  },
  {
    id: 'polish',
    label: 'Polish & performance',
    notes: {
      source: 'template',
      main: `• Smoother navigation across games, chats, and your profile
• Faster loading for game details and chat threads
• Visual polish across buttons, lists, and empty states`,
      short:
        'UI polish and performance improvements for faster loading and a cleaner experience across games, chats, and your profile.',
    },
  },
  {
    id: 'general',
    label: 'General improvements',
    notes: {
      source: 'template',
      main: `• Improvements to game scheduling and joining flows
• Better chat reliability and message delivery
• Minor fixes and quality-of-life updates throughout the app`,
      short:
        'General improvements to game scheduling, chat, and everyday app flows, plus minor fixes across Bandeja.',
    },
  },
];

const SHORT_DELIMITER = '---SHORT---';
const PLAY_SHORT_MAX = 500;

export function parseReleaseNotesOutput(text: string): Pick<ReleaseNotes, 'main' | 'short'> {
  const delimiterIndex = text.indexOf(SHORT_DELIMITER);
  if (delimiterIndex === -1) {
    return { main: text.trim() };
  }
  const main = text.slice(0, delimiterIndex).trim();
  const short = text.slice(delimiterIndex + SHORT_DELIMITER.length).trim();
  return { main, short: short || undefined };
}

export function derivePlayShortDescription(main: string, short?: string): string | undefined {
  if (short?.trim()) {
    return short.trim().slice(0, PLAY_SHORT_MAX);
  }
  const flattened = main
    .split('\n')
    .map((line) => line.replace(/^[\s•*-]+/, '').trim())
    .filter(Boolean)
    .join(' ');
  if (!flattened) {
    return undefined;
  }
  if (flattened.length <= PLAY_SHORT_MAX) {
    return flattened;
  }
  return `${flattened.slice(0, PLAY_SHORT_MAX - 1).trimEnd()}…`;
}

export function buildReleaseNotes(
  main: string,
  source: ReleaseNotesSource,
  short?: string,
): ReleaseNotes {
  const trimmedMain = main.trim();
  if (!trimmedMain) {
    throw new Error('Release notes cannot be empty');
  }
  const resolvedShort = derivePlayShortDescription(trimmedMain, short);
  return {
    main: trimmedMain,
    short: resolvedShort,
    source,
  };
}

export async function generateAiReleaseNotes(
  baselineSha: string,
  headSha: string,
): Promise<Pick<ReleaseNotes, 'main' | 'short'>> {
  const count = commitCountSince(baselineSha, headSha);
  if (count === 0) {
    throw new Error('No commits since baseline — nothing to summarize for release notes');
  }

  const ai = getAiService();
  if (!ai.isConfigured()) {
    throw new Error(
      'AI is not configured. Set AI_PROVIDER and OPENAI_API_KEY or DEEPSEEK_API_KEY in Backend/.env',
    );
  }

  const commitLog = gatherCommitLog(baselineSha, headSha);
  const userPrompt = `There are ${count} commits since the last app store release (baseline ${baselineSha.slice(0, 7)}).

Summarize the user-visible changes for store release notes:

${commitLog}`;

  const raw = await ai.createCompletion({
    messages: [
      { role: 'system', content: RELEASE_NOTES_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.35,
    max_tokens: 6000,
    reason: LLM_REASON.APP_RELEASE_NOTES,
  });

  return parseReleaseNotesOutput(raw);
}
