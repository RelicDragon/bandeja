import dotenv from 'dotenv';
dotenv.config();

import * as readline from 'readline';
import * as clack from '@clack/prompts';
import { Listr } from 'listr2';
import {
  buildReleaseNotes,
  generateAiReleaseNotes,
  RELEASE_NOTE_TEMPLATES,
} from './lib/app-release-notes';
import {
  applyPlannedVersions,
  createReleaseSession,
  formatCommitPreview,
  getSessionPhase,
  hydrateReleaseSessionFromStores,
  isDryRun,
  parseBuildInput,
  parseVersionInput,
  refreshStoreVersionsKeepingPlanned,
  runPreflight,
  sessionHasStoreVersions,
  shouldResumeSession,
  shouldStartFreshSession,
  shouldCleanBuildArtifacts,
  storeConfigComplete,
} from './lib/app-release-planner';
import { ReleaseBuildError, runBuildPreflight, runReleaseBuild } from './lib/app-release-build';
import {
  commitVersionBump,
  markReleaseAsShipped,
  versionBumpFilesChanged,
} from './lib/app-release-finalize';
import {
  ReleaseUploadError,
  isAndroidAlreadyUploadedError,
  isGoogleReviewConflictError,
  isIosReviewConflictError,
  resolvePlayTrack,
  runAndroidStoreVerification,
  runAndroidUpload,
  runIosBinaryUpload,
  runIosProcessedBuildWait,
  runIosPendingReviewRemoval,
  runIosStoreVersionFinalize,
  runIosStoreVersionVerification,
  runStoreReviewCheck,
  runStoreReviewCheckPreflight,
  runStoreVerificationPreflight,
  runUploadPreflight,
  storeReviewCheckPlatforms,
} from './lib/app-release-upload';
import { validatePlannedAgainstStores } from './lib/app-release-store-version';
import {
  cleanReleaseWorkspace,
  clearSession,
  hasSavedSession,
  includesAndroid,
  includesIos,
  releaseArtifactsPresentOnDisk,
  releasePlatformLabel,
  tryLoadSession,
  saveSession,
  type IosAppStoreConnectState,
  type PendingStoreReview,
  type ReleasePlatform,
  type ReleaseSession,
} from './lib/app-release-session';
import { ReleaseProgressTimer, timedListrTask } from './lib/app-release-timer';
import {
  approveStoreReviews,
  androidReviewFingerprint,
  androidReviewNeedsApproval,
  iosReviewIsCanceling,
  iosReviewNeedsApproval,
  mergeStoreReviewSnapshot,
} from './lib/app-release-review';

function handleCancel<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('Release cancelled — no further changes were made.');
    process.exit(0);
  }
  return value;
}

function persist(session: ReleaseSession): void {
  saveSession(session);
}

function parseReleasePlatform(value: string): ReleasePlatform {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'android' || normalized === 'a') {
    return 'android';
  }
  if (normalized === 'ios' || normalized === 'i') {
    return 'ios';
  }
  if (normalized === 'both' || normalized === 'all' || normalized === 'b') {
    return 'both';
  }
  throw new Error(`Unknown release platform "${value}" — use android, ios, or both.`);
}

function requestedReleasePlatform(): ReleasePlatform | undefined {
  const fromEnv = process.env.APP_RELEASE_PLATFORM?.trim();
  if (fromEnv) {
    return parseReleasePlatform(fromEnv);
  }

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--android') {
      return 'android';
    }
    if (arg === '--ios') {
      return 'ios';
    }
    if (arg === '--both') {
      return 'both';
    }
    if (arg === '--platform' || arg === '-p') {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires android, ios, or both.`);
      }
      return parseReleasePlatform(value);
    }
    const inlineMatch = arg.match(/^--platform=(.+)$/);
    if (inlineMatch) {
      return parseReleasePlatform(inlineMatch[1]);
    }
    if (!arg.startsWith('-')) {
      return parseReleasePlatform(arg);
    }
  }

  return undefined;
}

async function promptReleasePlatform(session: ReleaseSession): Promise<ReleaseSession> {
  const targetPlatform = handleCancel(
    await clack.select({
      message: 'Release target',
      options: [
        { value: 'both', label: 'Both', hint: 'Google Play + App Store Connect' },
        { value: 'android', label: 'Android', hint: 'Google Play only' },
        { value: 'ios', label: 'iOS', hint: 'App Store Connect only' },
      ],
      initialValue: session.targetPlatform ?? 'both',
    }),
  ) as ReleasePlatform;

  return {
    ...session,
    targetPlatform,
  };
}

function hasIosAppStoreConnectState(state: IosAppStoreConnectState | undefined): boolean {
  return Boolean(state && Object.values(state).some((value) => Boolean(value)));
}

function withIosAppStoreConnectState(
  session: ReleaseSession,
  state: IosAppStoreConnectState | undefined,
): ReleaseSession {
  if (!hasIosAppStoreConnectState(state)) {
    return session;
  }

  return {
    ...session,
    iosAppStoreConnect: {
      ...session.iosAppStoreConnect,
      ...state,
    },
  };
}

function formatIosAppStoreConnectState(session: ReleaseSession): string | null {
  const state = session.iosAppStoreConnect;
  if (!hasIosAppStoreConnectState(state)) {
    return null;
  }

  const parts = [
    state.appStoreVersionId ? `version id ${state.appStoreVersionId}` : null,
    state.buildId ? `build id ${state.buildId}` : null,
    state.lastObservedProcessingStatus
      ? `processing ${state.lastObservedProcessingStatus}`
      : null,
    state.metadataUpdatedAt ? `metadata ${state.metadataUpdatedAt}` : null,
    state.submissionId ? `submission ${state.submissionId}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? `App Store state: ${parts.join(', ')}` : null;
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

  const planned = {
    version: parseVersionInput(version),
    build: parseBuildInput(build),
  };
  const validationError = validatePlannedAgainstStores(
    planned,
    session.storeVersions ?? {},
    session.targetPlatform,
  );
  if (validationError) {
    clack.log.error(validationError);
    return session;
  }

  return {
    ...session,
    planned,
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
      options.push({ value: 'continue', label: 'Continue to store settings' });
    }

    options.push({ value: 'cancel', label: 'Cancel' });

    const choice = handleCancel(
      await clack.select({
        message: current.notes ? 'Release planner' : 'Choose release notes',
        options,
      }),
    );

    if (choice === 'cancel') {
      clack.cancel('Release cancelled — no changes were made.');
      process.exit(0);
    }

    if (choice === 'continue') {
      return current;
    }

    if (choice === 'ai') {
      const preflight = runPreflight(current);
      if (!preflight.aiConfigured) {
        clack.log.warn(
          'AI is not configured in Backend/.env — set AI_PROVIDER and API keys first.',
        );
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

async function promptStoreConfig(session: ReleaseSession): Promise<ReleaseSession> {
  if (storeConfigComplete(session.store, session.targetPlatform) && session.autoCommit !== undefined) {
    return session;
  }

  let androidTrack = session.store.androidTrack;
  if (includesAndroid(session.targetPlatform) && !androidTrack) {
    androidTrack = handleCancel(
      await clack.select({
        message: 'Google Play track',
        options: [
          { value: 'internal', label: 'Internal testing', hint: 'Recommended for smoke tests' },
          { value: 'alpha', label: 'Closed testing', hint: 'Play API track: alpha' },
          { value: 'production', label: 'Production' },
        ],
        initialValue: session.store.androidTrack ?? 'internal',
      }),
    );

  }
  if (androidTrack) {
    const resolved = resolvePlayTrack(androidTrack);
    if (!resolved) {
      throw new Error(`Invalid Play track: ${androidTrack}`);
    }
    androidTrack = resolved;
  }

  let iosSubmitForReview = session.store.iosSubmitForReview;
  if (includesIos(session.targetPlatform) && iosSubmitForReview === undefined) {
    const iosMode = handleCancel(
      await clack.select({
        message: 'App Store Connect',
        options: [
          { value: 'upload', label: 'Prepare App Store version, do not submit' },
          { value: 'submit', label: 'Upload and submit for review' },
        ],
        initialValue: session.store.iosSubmitForReview ? 'submit' : 'upload',
      }),
    );
    iosSubmitForReview = iosMode === 'submit';
  }

  let autoCommit = session.autoCommit;
  if (autoCommit === undefined) {
    autoCommit = handleCancel(
      await clack.confirm({
        message: 'Auto-commit version bump and baseline updates when done?',
        initialValue: false,
      }),
    );
  }

  return {
    ...session,
    autoCommit,
    store: {
      ...session.store,
      androidTrack,
      iosSubmitForReview,
    },
  };
}

function storeReviewLabel(platform: 'android' | 'ios', review: PendingStoreReview): string {
  if (platform === 'android') {
    return `Google Play${review.versionCode ? ` version code ${review.versionCode}` : ''}`;
  }
  return `App Store${review.version ? ` version ${review.version}` : ''}`;
}

function storeReviewDetails(platform: 'android' | 'ios', review: PendingStoreReview): string {
  const state = review.state ? ` (${review.state})` : '';
  return `${storeReviewLabel(platform, review)}${state}`;
}

async function gatherPendingReviewDecisions(
  session: ReleaseSession,
  dryRun: boolean,
): Promise<ReleaseSession> {
  if (dryRun) {
    return session;
  }

  if (storeReviewCheckPlatforms(session).length === 0) {
    return session;
  }

  const preflight = runStoreReviewCheckPreflight(session);
  if (!preflight.ok) {
    persist(session);
    clack.note(preflight.issues.join('\n'), 'Store review check');
    clack.log.error('Store review state must be known before a review upload can continue.');
    process.exit(1);
  }

  const spinner = clack.spinner();
  spinner.start('Checking the stores for versions already in review…');
  let detected: Awaited<ReturnType<typeof runStoreReviewCheck>>;
  try {
    detected = await runStoreReviewCheck(session);
    spinner.stop('Store review check complete');
  } catch (error) {
    spinner.stop('Store review check failed');
    const uploadError =
      error instanceof ReleaseUploadError
        ? error
        : new ReleaseUploadError(error instanceof Error ? error.message : String(error), '');
    clack.log.error(uploadError.message);
    if (uploadError.logTail) {
      clack.note(uploadError.logTail, 'Last store-check output');
    }
    persist(session);
    process.exit(1);
  }

  let current = mergeStoreReviewSnapshot(session, detected, new Date().toISOString());
  persist(current);

  const androidConflict = detected.android?.inReview === true;
  const iosConflict = detected.ios?.inReview === true;
  if (!androidConflict && !iosConflict) {
    return current;
  }

  const conflictLines = [
    androidConflict ? storeReviewDetails('android', detected.android!) : null,
    iosConflict ? storeReviewDetails('ios', detected.ios!) : null,
  ].filter(Boolean);
  clack.note(
    [
      ...conflictLines,
      '',
      iosReviewIsCanceling(detected.ios)
        ? 'Apple removal is already in progress; the release will wait for it to complete.'
        : 'A new review upload cannot replace these without explicit approval.',
    ].join('\n'),
    'Existing store review detected',
  );

  const androidNeedsApproval = androidReviewNeedsApproval(current);
  const iosSubmissionId = detected.ios?.submissionId;
  const iosNeedsApproval = iosReviewNeedsApproval(current);

  if (androidNeedsApproval && !androidReviewFingerprint(detected.android)) {
    clack.log.error(
      'Google Play reported an in-review release without a version code or release name; it cannot be safely replaced.',
    );
    process.exit(1);
  }

  if (iosConflict && !iosSubmissionId) {
    clack.log.error(
      'App Store Connect reported an in-progress review without a submission id; it cannot be safely removed.',
    );
    process.exit(1);
  }

  if (!androidNeedsApproval && !iosNeedsApproval) {
    return current;
  }

  if (androidNeedsApproval && iosNeedsApproval) {
    const choice = handleCancel(
      await clack.select({
        message: 'Which old review submission(s) should be removed/replaced?',
        options: [
          {
            value: 'both',
            label: 'Both Google and Apple',
            hint: 'Continue the requested two-store release',
          },
          {
            value: 'android',
            label: 'Google only',
            hint: 'Continue as an Android-only release',
          },
          {
            value: 'ios',
            label: 'Apple only',
            hint: 'Continue as an iOS-only release',
          },
          { value: 'abort', label: 'Neither — stop release' },
        ],
      }),
    );

    if (choice === 'abort') {
      clack.cancel('Release stopped — no review submission was removed and nothing was uploaded.');
      process.exit(0);
    }

    current = approveStoreReviews(current, choice, { narrowTarget: true });
  } else {
    const platform = androidNeedsApproval ? 'android' : 'ios';
    const review = platform === 'android' ? detected.android! : detected.ios!;
    const approved = handleCancel(
      await clack.confirm({
        message: `Remove/replace ${storeReviewLabel(platform, review)} from review before continuing?`,
        initialValue: false,
      }),
    );

    if (!approved) {
      clack.cancel(
        'Release stopped — the existing review was not removed, so no new review upload is allowed.',
      );
      process.exit(0);
    }

    current = approveStoreReviews(current, platform);
  }

  persist(current);
  return current;
}

async function removeApprovedIosReview(session: ReleaseSession): Promise<ReleaseSession> {
  const review = session.reviewGuard.ios;
  const approvedId = session.reviewGuard.iosRemovalApprovedSubmissionId;
  if (
    !includesIos(session.targetPlatform) ||
    review?.inReview !== true ||
    !review.submissionId ||
    (!iosReviewIsCanceling(review) && approvedId !== review.submissionId)
  ) {
    return session;
  }

  const spinner = clack.spinner();
  spinner.start(`Removing ${storeReviewLabel('ios', review)} from App Review…`);
  try {
    await runIosPendingReviewRemoval(review.submissionId);
    spinner.stop('Old App Store submission removed from review');
  } catch (error) {
    spinner.stop('Could not remove old App Store submission');
    throw error;
  }

  const current: ReleaseSession = {
    ...session,
    reviewGuard: {
      ...session.reviewGuard,
      ios: { ...review, inReview: false, state: 'REMOVED' },
      iosRemovalCompletedSubmissionId: review.submissionId,
      iosRemovalCompletedAt: new Date().toISOString(),
    },
  };
  persist(current);
  return current;
}

function renderSummary(session: ReleaseSession, dryRun: boolean): string {
  const notes = session.notes;
  if (!notes) {
    throw new Error('Summary requested without release notes');
  }

  const storeLines: string[] = [];
  storeLines.push(`Target: ${releasePlatformLabel(session.targetPlatform)}`);
  if (includesAndroid(session.targetPlatform) && session.store.androidTrack) {
    storeLines.push(`Play track: ${session.store.androidTrack}`);
  }
  if (includesIos(session.targetPlatform) && session.store.iosSubmitForReview !== undefined) {
    storeLines.push(
      `App Store: ${
        session.store.iosSubmitForReview
          ? 'upload + submit for review'
          : 'prepare App Store version, do not submit'
      }`,
    );
  }
  if (session.autoCommit !== undefined) {
    storeLines.push(`Auto-commit: ${session.autoCommit ? 'yes' : 'no'}`);
  }
  if (dryRun && (session.store.androidTrack === 'production' || session.store.iosSubmitForReview)) {
    storeLines.push('Existing-review check: deferred to live release');
  } else {
    if (
      includesAndroid(session.targetPlatform) &&
      session.reviewGuard.android?.inReview &&
      !androidReviewNeedsApproval(session)
    ) {
      storeLines.push(
        `Review replacement: ${storeReviewLabel('android', session.reviewGuard.android)} approved`,
      );
    }
    if (
      includesIos(session.targetPlatform) &&
      session.reviewGuard.ios?.inReview &&
      session.reviewGuard.iosRemovalApprovedSubmissionId ===
        session.reviewGuard.ios.submissionId
    ) {
      storeLines.push(
        `Review removal: ${storeReviewLabel('ios', session.reviewGuard.ios)} approved`,
      );
    }
  }
  if (
    session.uploads?.android ||
    session.uploads?.androidStoreVerified ||
    session.uploads?.iosBinary ||
    session.uploads?.iosBuildProcessed ||
    session.uploads?.iosStoreVersion ||
    session.uploads?.iosStoreVersionVerified ||
    session.uploads?.ios ||
    session.uploads?.storesVerified
  ) {
    storeLines.push(
      [
        includesAndroid(session.targetPlatform)
          ? `Uploaded: Android ${session.uploads.android ? 'yes' : 'no'}`
          : null,
        includesAndroid(session.targetPlatform)
          ? `Android verified ${session.uploads.androidStoreVerified ? 'yes' : 'no'}`
          : null,
        includesIos(session.targetPlatform)
          ? `iOS binary ${session.uploads.iosBinary ? 'yes' : 'no'}`
          : null,
        includesIos(session.targetPlatform)
          ? `iOS processed ${session.uploads.iosBuildProcessed ? 'yes' : 'no'}`
          : null,
        includesIos(session.targetPlatform)
          ? `iOS metadata ${session.uploads.iosStoreVersion ? 'yes' : 'no'}`
          : null,
        includesIos(session.targetPlatform)
          ? `iOS verified ${session.uploads.iosStoreVersionVerified ? 'yes' : 'no'}`
          : null,
        `Stores verified ${session.uploads.storesVerified ? 'yes' : 'no'}`,
      ]
        .filter(Boolean)
        .join(', '),
    );
  }
  const iosState = formatIosAppStoreConnectState(session);
  if (iosState) {
    storeLines.push(iosState);
  }

  return [
    `Store floor: ${session.current.version} (${session.current.build})`,
    `Planned: ${session.planned.version} (${session.planned.build})`,
    ...(includesAndroid(session.targetPlatform) && session.storeVersions?.android
      ? [
          `Google Play latest: ${session.storeVersions.android.version} (${session.storeVersions.android.build})`,
        ]
      : []),
    ...(includesIos(session.targetPlatform) && session.storeVersions?.ios
      ? [
          `App Store latest: ${session.storeVersions.ios.version} (${session.storeVersions.ios.build})`,
        ]
      : []),
    `What's new range: ${session.baselineSha.slice(0, 7)}..${session.headSha.slice(0, 7)} (frozen at session start)`,
    `Notes source: ${notes.source}`,
    ...storeLines,
    '',
    notes.main,
    notes.short ? `\n---SHORT---\n${notes.short}` : '',
    '',
    dryRun
      ? 'Dry run: native project files, builds, uploads, and baseline will not be modified.'
      : `Confirm will bump versions, build signed ${
          includesAndroid(session.targetPlatform) && includesIos(session.targetPlatform)
            ? 'AAB/IPA'
            : includesAndroid(session.targetPlatform)
              ? 'AAB'
              : 'IPA'
        }, upload to ${releasePlatformLabel(session.targetPlatform)}, verify store state, and update the shipped baseline.`,
  ].join('\n');
}

async function runBuildPhase(
  session: ReleaseSession,
  timer: ReleaseProgressTimer,
): Promise<ReleaseSession> {
  const preflight = runBuildPreflight(session.targetPlatform);
  if (!preflight.ok) {
    clack.note(preflight.issues.join('\n'), 'Build preflight');
    clack.log.error('Fix the issues above before building release binaries.');
    process.exit(1);
  }

  let current = session;

  for (;;) {
    persist(current);

    try {
      const artifacts = await runReleaseBuild(current, timer);
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
      const buildError =
        error instanceof ReleaseBuildError
          ? error
          : new ReleaseBuildError(error instanceof Error ? error.message : String(error), '');

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

async function runUploadPhase(
  session: ReleaseSession,
  timer: ReleaseProgressTimer,
): Promise<ReleaseSession> {
  const preflight = runUploadPreflight(session);
  if (!preflight.ok) {
    clack.note(preflight.issues.join('\n'), 'Upload preflight');
    clack.log.error('Fix the issues above before uploading to the stores.');
    process.exit(1);
  }

  let current = session;

  for (;;) {
    persist(current);

    try {
      const androidDone = !includesAndroid(current.targetPlatform) || current.uploads?.android;
      const iosDone = !includesIos(current.targetPlatform) || current.uploads?.ios;
      if (androidDone && iosDone) {
        return current;
      }

      const uploadTasks = [];
      if (includesAndroid(current.targetPlatform) && !current.uploads?.android) {
        uploadTasks.push(
          timedListrTask(timer, 'Upload Android AAB to Google Play', async () => {
            try {
              await runAndroidUpload(current);
            } catch (error) {
              const uploadError =
                error instanceof ReleaseUploadError
                  ? error
                  : new ReleaseUploadError(
                      error instanceof Error ? error.message : String(error),
                      '',
                    );
              if (!isAndroidAlreadyUploadedError(uploadError)) {
                throw uploadError;
              }
              try {
                await runAndroidStoreVerification({
                  ...current,
                  targetPlatform: 'android',
                  uploads: { ...current.uploads, android: true },
                });
              } catch (verificationError) {
                const detail =
                  verificationError instanceof ReleaseUploadError
                    ? verificationError.logTail || verificationError.message
                    : verificationError instanceof Error
                      ? verificationError.message
                      : String(verificationError);
                throw new ReleaseUploadError(
                  'Google Play has already used this version code, but the planned track release could not be verified.',
                  detail,
                );
              }
              clack.log.warn(
                'Google Play already has this Android version code and the exact release was verified — marking Android upload complete.',
              );
            }
            current = {
              ...current,
              uploads: {
                ...current.uploads,
                android: true,
              },
            };
            persist(current);
          }),
        );
      }

      if (
        includesIos(current.targetPlatform) &&
        !current.uploads?.ios &&
        !current.uploads?.iosBinary
      ) {
        uploadTasks.push(
          timedListrTask(timer, 'Upload iOS IPA to App Store Connect', async () => {
            await runIosBinaryUpload(current);
            current = {
              ...current,
              uploads: {
                ...current.uploads,
                iosBinary: true,
                iosBinaryUploadedAt: new Date().toISOString(),
              },
            };
            persist(current);
          }),
        );
      }

      if (
        includesIos(current.targetPlatform) &&
        !current.uploads?.ios &&
        !current.uploads?.iosBuildProcessed
      ) {
        uploadTasks.push(
          timedListrTask(timer, 'Wait for processed App Store Connect build', async () => {
            const iosState = await runIosProcessedBuildWait(current);
            current = withIosAppStoreConnectState(current, iosState);
            current = {
              ...current,
              uploads: {
                ...current.uploads,
                iosBinary: true,
                iosBuildProcessed: true,
                iosBuildProcessedAt: new Date().toISOString(),
              },
            };
            persist(current);
          }),
        );
      }

      if (
        includesIos(current.targetPlatform) &&
        !current.uploads?.ios &&
        !current.uploads?.iosStoreVersion
      ) {
        uploadTasks.push(
          timedListrTask(
            timer,
            current.store.iosSubmitForReview
              ? 'Update App Store version metadata and submit for review'
              : 'Update App Store version metadata',
            async () => {
              const iosState = await runIosStoreVersionFinalize(current);
              current = withIosAppStoreConnectState(current, iosState);
              current = {
                ...current,
                uploads: {
                  ...current.uploads,
                  iosBinary: true,
                  iosBuildProcessed: true,
                  iosStoreVersion: true,
                  iosStoreVersionUpdatedAt: new Date().toISOString(),
                },
              };
              persist(current);
            },
          ),
        );
      }

      const tasks = new Listr(uploadTasks, { concurrent: false, exitOnError: true });

      await tasks.run();
      return current;
    } catch (error) {
      const uploadError =
        error instanceof ReleaseUploadError
          ? error
          : new ReleaseUploadError(error instanceof Error ? error.message : String(error), '');
      current = withIosAppStoreConnectState(current, uploadError.iosState);
      persist(current);

      clack.log.error(uploadError.message);
      if (uploadError.logTail) {
        clack.note(uploadError.logTail, 'Last upload output');
      }

      if (
        isGoogleReviewConflictError(uploadError) &&
        includesAndroid(current.targetPlatform) &&
        current.store.androidTrack === 'production'
      ) {
        const previousApproval = current.reviewGuard.androidReplacementApprovedFingerprint;
        const refreshed = await gatherPendingReviewDecisions(current, false);
        const nextApproval = refreshed.reviewGuard.androidReplacementApprovedFingerprint;
        if (
          refreshed.reviewGuard.android?.inReview !== true ||
          (previousApproval !== undefined && previousApproval === nextApproval)
        ) {
          persist(refreshed);
          clack.outro(
            'Upload stopped safely — Google Play reports reviewed changes that could not be matched to the approved production release. Inspect Publishing overview, then resume.',
          );
          process.exit(1);
        }
        current = refreshed;
        persist(current);
        continue;
      }

      if (
        isIosReviewConflictError(uploadError) &&
        includesIos(current.targetPlatform) &&
        current.store.iosSubmitForReview === true
      ) {
        current = await gatherPendingReviewDecisions(current, false);
        current = await removeApprovedIosReview(current);
        persist(current);
        continue;
      }

      const decision = handleCancel(
        await clack.select({
          message: 'Upload failed — what next?',
          options: [
            { value: 'retry', label: 'Retry upload' },
            { value: 'abort', label: 'Abort (session saved for resume)' },
          ],
        }),
      );

      if (decision === 'abort') {
        clack.outro('Upload aborted. Resume later with APP_RELEASE_RESUME=1.');
        process.exit(1);
      }
    }
  }
}

async function runStoreVerificationPhase(
  session: ReleaseSession,
  timer: ReleaseProgressTimer,
): Promise<ReleaseSession> {
  const preflight = runStoreVerificationPreflight(session);
  if (!preflight.ok) {
    clack.note(preflight.issues.join('\n'), 'Store verification preflight');
    clack.log.error('Fix the issues above before verifying final store state.');
    process.exit(1);
  }

  let current = session;

  for (;;) {
    persist(current);

    try {
      if (current.uploads?.storesVerified) {
        return current;
      }

      const verificationTasks = [];
      if (includesAndroid(current.targetPlatform) && !current.uploads?.androidStoreVerified) {
        verificationTasks.push(
          timedListrTask(timer, 'Verify Google Play release', async () => {
            await runAndroidStoreVerification(current);
            current = {
              ...current,
              uploads: {
                ...current.uploads,
                android: true,
                androidStoreVerified: true,
                androidStoreVerifiedAt: new Date().toISOString(),
              },
            };
            persist(current);
          }),
        );
      }

      if (includesIos(current.targetPlatform) && !current.uploads?.iosStoreVersionVerified) {
        verificationTasks.push(
          timedListrTask(
            timer,
            'Verify App Store version metadata',
            async () => {
              const iosState = await runIosStoreVersionVerification(current);
              current = withIosAppStoreConnectState(current, iosState);
              current = {
                ...current,
                uploads: {
                  ...current.uploads,
                  iosBinary: true,
                  iosBuildProcessed: true,
                  iosStoreVersion: true,
                  iosStoreVersionVerified: true,
                  iosStoreVersionVerifiedAt: new Date().toISOString(),
                  ios: true,
                },
              };
              persist(current);
            },
          ),
        );
      }

      if (verificationTasks.length > 0) {
        const tasks = new Listr(verificationTasks, { concurrent: false, exitOnError: true });
        await tasks.run();
      }

      current = {
        ...current,
        uploads: {
          ...current.uploads,
          ...(includesAndroid(current.targetPlatform)
            ? { android: true, androidStoreVerified: true }
            : {}),
          ...(includesIos(current.targetPlatform)
            ? { iosStoreVersionVerified: true, ios: true }
            : {}),
          storesVerified: true,
          storesVerifiedAt: new Date().toISOString(),
        },
      };
      persist(current);
      return current;
    } catch (error) {
      const uploadError =
        error instanceof ReleaseUploadError
          ? error
          : new ReleaseUploadError(error instanceof Error ? error.message : String(error), '');
      current = withIosAppStoreConnectState(current, uploadError.iosState);
      persist(current);

      clack.log.error(uploadError.message);
      if (uploadError.logTail) {
        clack.note(uploadError.logTail, 'Last verification output');
      }

      const decision = handleCancel(
        await clack.select({
          message: 'Store verification failed — what next?',
          options: [
            { value: 'retry', label: 'Retry verification' },
            { value: 'abort', label: 'Abort (session saved for resume)' },
          ],
        }),
      );

      if (decision === 'abort') {
        clack.outro('Store verification aborted. Resume later with APP_RELEASE_RESUME=1.');
        process.exit(1);
      }
    }
  }
}

async function finalizeRelease(session: ReleaseSession): Promise<void> {
  if (!session.uploads?.storesVerified) {
    clack.log.error('Store verification is incomplete — baseline was not updated.');
    process.exit(1);
  }

  const result = markReleaseAsShipped({ commitBaseline: session.autoCommit === true });
  clearSession();

  if (!result.baselineUpdated) {
    clack.log.warn(`Baseline was already at HEAD (${result.head.short}) — docs were not changed.`);
  } else {
    clack.log.success(
      `Baseline updated to ${result.version.version} (${result.version.build}) at ${result.head.short}`,
    );
  }

  clack.outro(
    `Shipped ${result.version.version} (${result.version.build}) to ${releasePlatformLabel(
      session.targetPlatform,
    )}.`,
  );
}

async function executeRelease(session: ReleaseSession): Promise<void> {
  const dryRun = isDryRun();
  let withStore = await promptStoreConfig(session);
  persist(withStore);
  withStore = await gatherPendingReviewDecisions(withStore, dryRun);
  clack.note(renderSummary(withStore, dryRun), 'Release summary');

  const confirmed = handleCancel(
    await clack.confirm({
      message: dryRun
        ? 'Finish dry-run planner?'
        : 'Run full release (bump, build, upload, baseline)?',
      initialValue: true,
    }),
  );

  if (!confirmed) {
    clack.cancel('Release cancelled — no changes were made.');
    process.exit(0);
  }

  persist(withStore);

  if (dryRun) {
    clearSession();
    clack.outro('Dry run complete — no files, builds, uploads, or baseline changes were made.');
    return;
  }

  const refreshSpinner = clack.spinner();
  refreshSpinner.start('Re-checking latest store versions before release…');
  try {
    withStore = await refreshStoreVersionsKeepingPlanned(withStore);
    refreshSpinner.stop(
      `Store floor confirmed: ${withStore.current.version} (${withStore.current.build}) → planned ${withStore.planned.version} (${withStore.planned.build})`,
    );
  } catch (error) {
    refreshSpinner.stop('Store version re-check failed');
    const uploadError =
      error instanceof ReleaseUploadError
        ? error
        : new ReleaseUploadError(error instanceof Error ? error.message : String(error), '');
    clack.log.error(uploadError.message);
    if (uploadError.logTail) {
      clack.note(uploadError.logTail, 'Store version lookup output');
    }
    persist(withStore);
    process.exit(1);
  }
  persist(withStore);

  const releaseTimer = new ReleaseProgressTimer();
  const phase = getSessionPhase(withStore);

  if (phase === 'ready-to-apply' || phase === 'planning') {
    applyPlannedVersions(withStore, { dryRun: false });
    if (withStore.autoCommit && versionBumpFilesChanged()) {
      clack.log.step('Committing version bump…');
      commitVersionBump(withStore.planned);
    }
  }

  let built = withStore;
  if (getSessionPhase(built) === 'ready-to-build') {
    clack.log.step('Starting release build pipeline…');
    built = await runBuildPhase(built, releaseTimer);
    clack.note(
      [
        includesAndroid(built.targetPlatform) ? `AAB: ${built.artifacts.aab ?? '(missing)'}` : null,
        includesIos(built.targetPlatform) ? `IPA: ${built.artifacts.ipa ?? '(missing)'}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      'Build artifacts',
    );
    clack.log.info(`Build finished in ${releaseTimer.totalElapsedLabel}.`);
  }

  built = await gatherPendingReviewDecisions(built, false);
  built = await removeApprovedIosReview(built);
  clack.log.step(`Uploading to ${releasePlatformLabel(built.targetPlatform)}…`);
  const uploaded = await runUploadPhase(built, releaseTimer);
  clack.log.info(`Upload finished — release pipeline total ${releaseTimer.totalElapsedLabel}.`);
  clack.log.step('Verifying final store state…');
  const verified = await runStoreVerificationPhase(uploaded, releaseTimer);
  clack.log.info(`Store verification finished — release pipeline total ${releaseTimer.totalElapsedLabel}.`);
  releaseTimer.dispose();
  await finalizeRelease(verified);
}

function renderPreflight(preflight: ReturnType<typeof runPreflight>): void {
  const aiStatus = preflight.aiConfigured ? 'AI configured' : 'AI not configured';
  const commitPreview = formatCommitPreview(preflight.baselineSha, preflight.headSha);
  const storeLines: string[] = [];
  if (preflight.storeVersions.android) {
    storeLines.push(
      `Google Play latest: ${preflight.storeVersions.android.version} (${preflight.storeVersions.android.build})`,
    );
  }
  if (preflight.storeVersions.ios) {
    storeLines.push(
      `App Store latest: ${preflight.storeVersions.ios.version} (${preflight.storeVersions.ios.build})`,
    );
  }
  if (preflight.localNative) {
    storeLines.push(
      `Local Android: ${preflight.localNative.android.version} (${preflight.localNative.android.build})`,
    );
    storeLines.push(
      `Local iOS: ${preflight.localNative.ios.version} (${preflight.localNative.ios.build})`,
    );
  }

  clack.note(
    [
      `Store floor: ${preflight.current.version} (${preflight.current.build})`,
      `Proposed version: ${preflight.planned.version}`,
      `Proposed build: ${preflight.planned.build}`,
      ...storeLines,
      `What's new baseline: ${preflight.baselineSha.slice(0, 7)}`,
      `Frozen HEAD: ${preflight.headSha.slice(0, 7)}`,
      `Commits since baseline: ${preflight.commitCount}`,
      aiStatus,
      '',
      'Recent commits:',
      commitPreview,
    ].join('\n'),
    'Preflight',
  );
}

function sessionPhaseLabel(session: ReleaseSession): string {
  const phase = getSessionPhase(session);
  if (phase === 'ready-to-apply') {
    return 'version bump';
  }
  if (phase === 'ready-to-build') {
    return 'build';
  }
  if (phase === 'ready-to-upload') {
    return 'store upload';
  }
  return 'planner';
}

type SessionResolution = {
  session: ReleaseSession;
  resume: boolean;
};

function renderSavedSessionSummary(session: ReleaseSession): string {
  const notesStatus = session.notes ? `set (${session.notes.source})` : 'not set';
  const onDisk = releaseArtifactsPresentOnDisk(session);
  const artifactParts = [
    includesAndroid(session.targetPlatform)
      ? `AAB ${onDisk.aab ? 'ready' : 'pending'}`
      : null,
    includesIos(session.targetPlatform) ? `IPA ${onDisk.ipa ? 'ready' : 'pending'}` : null,
  ].filter(Boolean);
  const artifactStatus = artifactParts.length > 0 ? artifactParts.join(', ') : 'none';
  const uploadStatus =
    session.uploads?.android ||
    session.uploads?.androidStoreVerified ||
    session.uploads?.iosBinary ||
    session.uploads?.iosBuildProcessed ||
    session.uploads?.iosStoreVersion ||
    session.uploads?.iosStoreVersionVerified ||
    session.uploads?.ios ||
    session.uploads?.storesVerified
      ? [
          includesAndroid(session.targetPlatform)
            ? `Android ${session.uploads.android ? 'done' : 'pending'}`
            : null,
          includesAndroid(session.targetPlatform)
            ? `Android verification ${session.uploads.androidStoreVerified ? 'done' : 'pending'}`
            : null,
          includesIos(session.targetPlatform)
            ? `iOS binary ${session.uploads.iosBinary ? 'done' : 'pending'}`
            : null,
          includesIos(session.targetPlatform)
            ? `iOS processing ${session.uploads.iosBuildProcessed ? 'done' : 'pending'}`
            : null,
          includesIos(session.targetPlatform)
            ? `iOS metadata ${session.uploads.iosStoreVersion ? 'done' : 'pending'}`
            : null,
          includesIos(session.targetPlatform)
            ? `iOS verification ${session.uploads.iosStoreVersionVerified ? 'done' : 'pending'}`
            : null,
          `Stores ${session.uploads.storesVerified ? 'verified' : 'pending'}`,
        ]
          .filter(Boolean)
          .join(', ')
      : 'none';
  const iosState = formatIosAppStoreConnectState(session);
  return [
    `Planned: ${session.planned.version} (${session.planned.build})`,
    `Target: ${releasePlatformLabel(session.targetPlatform)}`,
    `Frozen HEAD: ${session.headSha.slice(0, 7)}`,
    `Phase: ${sessionPhaseLabel(session)}`,
    `Notes: ${notesStatus}`,
    `Build artifacts: ${artifactStatus}`,
    `Uploads: ${uploadStatus}`,
    ...(iosState ? [iosState] : []),
  ].join('\n');
}

async function resolveSession(): Promise<SessionResolution> {
  if (shouldResumeSession()) {
    const existing = tryLoadSession();
    if (existing) {
      clack.log.info(`Resuming session frozen at HEAD ${existing.headSha.slice(0, 7)}`);
      return { session: existing, resume: true };
    }
    clack.log.warn('APP_RELEASE_RESUME=1 set but no session found — starting a new session.');
    return { session: createReleaseSession(), resume: false };
  }

  if (hasSavedSession()) {
    if (shouldStartFreshSession()) {
      const cleanArtifacts = shouldCleanBuildArtifacts();
      cleanReleaseWorkspace({ buildArtifacts: cleanArtifacts });
      clack.log.info(
        cleanArtifacts
          ? 'Saved session and build outputs removed — starting fresh.'
          : 'Saved session discarded — starting fresh.',
      );
      return { session: createReleaseSession(), resume: false };
    }

    const existing = tryLoadSession();
    if (!existing) {
      clack.log.warn('Saved session file is unreadable — removing it and starting fresh.');
      cleanReleaseWorkspace({ buildArtifacts: false });
      return { session: createReleaseSession(), resume: false };
    }

    clack.note(renderSavedSessionSummary(existing), 'Saved session');

    const phaseLabel = sessionPhaseLabel(existing);
    const decision = handleCancel(
      await clack.select({
        message: 'Saved release session found — what next?',
        options: [
          {
            value: 'resume',
            label: 'Resume saved session',
            hint: `Continue at ${phaseLabel} phase`,
          },
          {
            value: 'fresh',
            label: 'Start fresh',
            hint: 'Discard session; keep .app-release/ios and upload cache',
          },
          {
            value: 'fresh-clean',
            label: 'Start fresh and clean build outputs',
            hint: 'Discard session and remove .app-release/ios + upload cache',
          },
        ],
      }),
    );

    if (decision === 'resume') {
      clack.log.info(`Resuming session frozen at HEAD ${existing.headSha.slice(0, 7)}`);
      return { session: existing, resume: true };
    }

    const cleanArtifacts = decision === 'fresh-clean';
    cleanReleaseWorkspace({ buildArtifacts: cleanArtifacts });
    clack.log.info(
      cleanArtifacts ? 'Saved session and build outputs removed.' : 'Saved session discarded.',
    );
  }

  return { session: createReleaseSession(), resume: false };
}

async function main(): Promise<void> {
  const dryRun = isDryRun();
  const requestedPlatform = requestedReleasePlatform();
  const { session, resume } = await resolveSession();

  clack.intro(dryRun ? 'Bandeja app release (dry run)' : 'Bandeja app release');

  let current = requestedPlatform ? { ...session, targetPlatform: requestedPlatform } : session;
  if (requestedPlatform) {
    clack.log.info(`Release target: ${releasePlatformLabel(requestedPlatform)}`);
  }

  if (!resume && !requestedPlatform) {
    current = await promptReleasePlatform(current);
  }

  if (!resume || !sessionHasStoreVersions(current)) {
    const spinner = clack.spinner();
    spinner.start(
      `Reading latest uploaded versions from ${releasePlatformLabel(current.targetPlatform)}…`,
    );
    try {
      current = await hydrateReleaseSessionFromStores(current, current.targetPlatform);
      spinner.stop('Store versions loaded');
    } catch (error) {
      spinner.stop('Could not read store versions');
      const uploadError =
        error instanceof ReleaseUploadError
          ? error
          : new ReleaseUploadError(error instanceof Error ? error.message : String(error), '');
      clack.log.error(uploadError.message);
      if (uploadError.logTail) {
        clack.note(uploadError.logTail, 'Store version lookup output');
      }
      process.exit(1);
    }
  }

  const preflight = runPreflight(current);
  renderPreflight(preflight);

  persist(current);

  const phase = getSessionPhase(current);

  if (resume && phase !== 'planning') {
    const phaseLabel = sessionPhaseLabel(current);
    clack.log.info(`Resuming at ${phaseLabel} phase.`);
    await executeRelease(current);
    return;
  }

  if (resume && phase === 'planning') {
    clack.log.info('Resuming saved session — release notes still need to be chosen.');
  }

  current = await releaseNotesLoop(current);
  await executeRelease(current);
}

main().catch((error: unknown) => {
  clack.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
