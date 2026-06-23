import dotenv from 'dotenv';
dotenv.config();

import * as readline from 'readline';
import * as clack from '@clack/prompts';
import {
  buildReleaseNotes,
  generateAiReleaseNotes,
  RELEASE_NOTE_TEMPLATES,
} from './lib/app-release-notes';
import {
  applyPlannedVersions,
  createReleaseSession,
  formatCommitPreview,
  isDryRun,
  parseBuildInput,
  parseVersionInput,
  runPreflight,
  shouldResumeSession,
} from './lib/app-release-planner';
import { ReleaseBuildError, runBuildPreflight, runReleaseBuild } from './lib/app-release-build';
import { clearSession, loadSession, saveSession, type ReleaseSession } from './lib/app-release-session';

function handleCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Release planner cancelled — no changes were made.');
    process.exit(0);
  }
  return value;
}

function persist(session: ReleaseSession): void {
  saveSession(session);
}

async function promptVersionOverride(session: ReleaseSession): Promise<ReleaseSession> {
  const version = handleCancel(
    await clack.text({
      message: 'Version name',
      initialValue: session.planned.version,
      validate: (value) => {
        try {
          parseVersionInput(value ?? '');
          return undefined;
        } catch {
          return 'Use dot-separated numeric segments, e.g. 0.96.41';
        }
      },
    }),
  );

  const build = handleCancel(
    await clack.text({
      message: 'Build number',
      initialValue: String(session.planned.build),
      validate: (value) => {
        try {
          parseBuildInput(value ?? '');
          return undefined;
        } catch {
          return 'Enter a non-negative integer build number';
        }
      },
    }),
  );

  return {
    ...session,
    planned: {
      version: parseVersionInput(version),
      build: parseBuildInput(build),
    },
  };
}

async function promptMultilineNotes(message: string): Promise<string> {
  clack.log.step(message);
  clack.log.info('Paste or type notes. Press Enter on an empty line when finished.');

  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.on('line', (line) => {
      if (line.trim() === '' && lines.length > 0) {
        rl.close();
        resolve(lines.join('\n').trim());
        return;
      }
      lines.push(line);
    });
  });
}

async function promptCustomNotes(session: ReleaseSession): Promise<ReleaseSession> {
  const main = await promptMultilineNotes('Release notes (main)');
  if (!main.trim()) {
    clack.log.warn('Release notes cannot be empty.');
    return session;
  }

  const short = handleCancel(
    await clack.text({
      message: 'Google Play short description (optional)',
      placeholder: 'Leave empty to auto-generate from main notes',
    }),
  );

  return {
    ...session,
    notes: buildReleaseNotes(main, 'custom', short || undefined),
  };
}

async function promptTemplateNotes(session: ReleaseSession): Promise<ReleaseSession> {
  const choice = handleCancel(
    await clack.select({
      message: 'Choose a release notes template',
      options: RELEASE_NOTE_TEMPLATES.map((template) => ({
        value: template.id,
        label: template.label,
        hint: template.notes.main.split('\n')[0],
      })),
    }),
  );

  const template = RELEASE_NOTE_TEMPLATES.find((entry) => entry.id === choice);
  if (!template) {
    throw new Error(`Unknown template: ${choice}`);
  }

  return {
    ...session,
    notes: { ...template.notes },
  };
}

function formatNotesPreview(notes: NonNullable<ReleaseSession['notes']>): string {
  const lines = [notes.main];
  if (notes.short) {
    lines.push('', '---SHORT---', notes.short);
  }
  return lines.join('\n');
}

async function promptAiNotes(session: ReleaseSession): Promise<ReleaseSession | null> {
  for (;;) {
    const spinner = clack.spinner();
    spinner.start('Generating release notes from commits…');
    let parsed: { main: string; short?: string };
    try {
      parsed = await generateAiReleaseNotes(session.baselineSha, session.headSha);
      spinner.stop('Release notes generated');
    } catch (error) {
      spinner.stop('AI generation failed');
      clack.log.error(error instanceof Error ? error.message : String(error));
      return session;
    }

    clack.note(formatNotesPreview({ ...parsed, source: 'ai' }), 'AI preview');

    const decision = handleCancel(
      await clack.select({
        message: 'Use these release notes?',
        options: [
          { value: 'accept', label: 'Accept' },
          { value: 'retry', label: 'Try again' },
          { value: 'decline', label: 'Decline' },
        ],
      }),
    );

    if (decision === 'accept') {
      return {
        ...session,
        notes: buildReleaseNotes(parsed.main, 'ai', parsed.short),
      };
    }
    if (decision === 'decline') {
      return session;
    }
  }
}

async function releaseNotesLoop(session: ReleaseSession): Promise<ReleaseSession> {
  let current = session;

  for (;;) {
    persist(current);

    const options = [
      { value: 'ai', label: 'AI-generate from commits' },
      { value: 'custom', label: 'Custom notes' },
      { value: 'template', label: 'Use a template' },
      { value: 'version', label: 'Change version / build' },
    ];

    if (current.notes) {
      options.push({ value: 'continue', label: 'Continue to summary' });
    }

    options.push({ value: 'cancel', label: 'Cancel' });

    const choice = handleCancel(
      await clack.select({
        message: current.notes ? 'Release planner' : 'Choose release notes',
        options,
      }),
    );

    if (choice === 'cancel') {
      clack.cancel('Release planner cancelled — no changes were made.');
      process.exit(0);
    }

    if (choice === 'continue') {
      return current;
    }

    if (choice === 'ai') {
      const preflight = runPreflight(current);
      if (!preflight.aiConfigured) {
        clack.log.warn('AI is not configured in Backend/.env — set AI_PROVIDER and API keys first.');
        continue;
      }
      if (preflight.commitCount === 0) {
        clack.log.warn('No commits since baseline — pick custom notes or a template instead.');
        continue;
      }
      const updated = await promptAiNotes(current);
      if (updated) {
        current = updated;
      }
      continue;
    }

    if (choice === 'custom') {
      current = await promptCustomNotes(current);
      continue;
    }

    if (choice === 'template') {
      current = await promptTemplateNotes(current);
      continue;
    }

    if (choice === 'version') {
      current = await promptVersionOverride(current);
    }
  }
}

function renderSummary(session: ReleaseSession, dryRun: boolean): string {
  const notes = session.notes;
  if (!notes) {
    throw new Error('Summary requested without release notes');
  }

  return [
    `Current: ${session.current.version} (${session.current.build})`,
    `Planned: ${session.planned.version} (${session.planned.build})`,
    `Baseline: ${session.baselineSha.slice(0, 7)}`,
    `What's new range: ${session.baselineSha.slice(0, 7)}..${session.headSha.slice(0, 7)} (frozen at session start)`,
    `Notes source: ${notes.source}`,
    '',
    notes.main,
    notes.short ? `\n---SHORT---\n${notes.short}` : '',
    '',
    dryRun
      ? 'Dry run: native project files will not be modified. Build phase will be skipped.'
      : 'Confirm will write Android Gradle and iOS App target versions, then build signed AAB and IPA.',
  ].join('\n');
}

async function runBuildPhase(session: ReleaseSession): Promise<ReleaseSession> {
  const preflight = runBuildPreflight();
  if (!preflight.ok) {
    clack.note(preflight.issues.join('\n'), 'Build preflight');
    clack.log.error('Fix the issues above before building release binaries.');
    process.exit(1);
  }

  let current = session;

  for (;;) {
    persist(current);

    try {
      const artifacts = await runReleaseBuild(current);
      current = {
        ...current,
        artifacts: {
          aab: artifacts.aab,
          ipa: artifacts.ipa,
        },
      };
      persist(current);
      return current;
    } catch (error) {
      const buildError = error instanceof ReleaseBuildError ? error : new ReleaseBuildError(
        error instanceof Error ? error.message : String(error),
        '',
      );

      clack.log.error(buildError.message);
      if (buildError.logTail) {
        clack.note(buildError.logTail, 'Last build output');
      }

      const decision = handleCancel(
        await clack.select({
          message: 'Build failed — what next?',
          options: [
            { value: 'retry', label: 'Retry build' },
            { value: 'abort', label: 'Abort (session saved for resume)' },
          ],
        }),
      );

      if (decision === 'abort') {
        clack.outro('Build aborted. Resume later with APP_RELEASE_RESUME=1.');
        process.exit(1);
      }
    }
  }
}

async function confirmAndApply(session: ReleaseSession): Promise<void> {
  const dryRun = isDryRun();
  clack.note(renderSummary(session, dryRun), 'Release summary');

  const confirmed = handleCancel(
    await clack.confirm({
      message: dryRun ? 'Finish dry-run planner?' : 'Apply version bump and build release binaries?',
      initialValue: true,
    }),
  );

  if (!confirmed) {
    clack.cancel('Release planner cancelled — no changes were made.');
    process.exit(0);
  }

  persist(session);
  applyPlannedVersions(session, { dryRun });

  if (dryRun) {
    clearSession();
    clack.outro('Dry run complete — native project files were not modified. Build phase skipped.');
    return;
  }

  clack.log.step('Starting release build pipeline…');
  const built = await runBuildPhase(session);

  clack.note(
    [`AAB: ${built.artifacts.aab ?? '(missing)'}`, `IPA: ${built.artifacts.ipa ?? '(missing)'}`].join('\n'),
    'Build artifacts',
  );

  clack.outro(
    `Built ${built.planned.version} (${built.planned.build}). Session saved for store upload.`,
  );
}

function renderPreflight(preflight: ReturnType<typeof runPreflight>): void {
  const parity = 'Android/iOS versions match';
  const aiStatus = preflight.aiConfigured ? 'AI configured' : 'AI not configured';
  const commitPreview = formatCommitPreview(preflight.baselineSha, preflight.headSha);

  clack.note(
    [
      `Current version: ${preflight.current.version}`,
      `Current build: ${preflight.current.build}`,
      `Proposed version: ${preflight.planned.version}`,
      `Proposed build: ${preflight.planned.build}`,
      `Baseline: ${preflight.baselineSha.slice(0, 7)}`,
      `Frozen HEAD: ${preflight.headSha.slice(0, 7)}`,
      `Commits since baseline: ${preflight.commitCount}`,
      parity,
      aiStatus,
      '',
      'Recent commits:',
      commitPreview,
    ].join('\n'),
    'Preflight',
  );
}

async function resolveSession(): Promise<ReleaseSession> {
  if (shouldResumeSession()) {
    const existing = loadSession();
    if (existing) {
      clack.log.info(`Resuming session frozen at HEAD ${existing.headSha.slice(0, 7)}`);
      return existing;
    }
    clack.log.warn('APP_RELEASE_RESUME=1 set but no session found — starting a new session.');
  }

  return createReleaseSession();
}

function sessionReadyToConfirm(session: ReleaseSession): boolean {
  return Boolean(session.notes) && !session.artifacts?.aab && !session.artifacts?.ipa;
}

async function main(): Promise<void> {
  const dryRun = isDryRun();
  clack.intro(dryRun ? 'Bandeja app release (dry run)' : 'Bandeja app release');

  let session = await resolveSession();
  const preflight = runPreflight(session);
  renderPreflight(preflight);

  session = { ...session, current: preflight.current };
  persist(session);

  if (shouldResumeSession() && sessionReadyToConfirm(session)) {
    clack.log.info('Resuming planned release — skipping notes loop.');
    await confirmAndApply(session);
    return;
  }

  session = await releaseNotesLoop(session);
  await confirmAndApply(session);
}

main().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
