import {
  APP_UI_LANGUAGES,
  GAME_TEXT_TRANSLATION_POLICY_VERSION,
} from '@bandeja/app-locale';
import {
  authoredGameTextEquals,
  normalizeAuthoredGameText,
} from './gameTextAuthoredText';

/** Debounce window for rapid edits (plan: ~2s). */
export const GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS = 2000;

export type GameTextSourceChangePlanInput = {
  previousName: string | null | undefined;
  previousDescription: string | null | undefined;
  /** Pass the property (even as undefined/null) only when the write includes that field. */
  nextName?: string | null;
  nextDescription?: string | null;
  nameInPatch: boolean;
  descriptionInPatch: boolean;
  previousNameSourceRevision: number;
  previousDescriptionSourceRevision: number;
  keepOriginalNameInAllLocales: boolean;
  /** When omitted, jobs are not enqueued (caller should pass env/runtime flag). */
  enqueueJobs?: boolean;
  policyVersion?: number;
  locales?: readonly string[];
};

export type GameTextSourceChangePlan = {
  nameChanged: boolean;
  descriptionChanged: boolean;
  nameCleared: boolean;
  descriptionCleared: boolean;
  nameSourceRevision: number;
  descriptionSourceRevision: number;
  keepOriginalNameInAllLocales: boolean;
  includeName: boolean;
  includeDescription: boolean;
  shouldUpsertMeta: boolean;
  shouldEnqueueJobs: boolean;
  shouldWakeWorker: boolean;
  policyVersion: number;
  locales: readonly string[];
  effectiveName: string | null;
  effectiveDescription: string | null;
};

export function planGameTextSourceChange(
  input: GameTextSourceChangePlanInput,
): GameTextSourceChangePlan {
  const previousName = normalizeAuthoredGameText(input.previousName);
  const previousDescription = normalizeAuthoredGameText(input.previousDescription);
  const nextName = input.nameInPatch
    ? normalizeAuthoredGameText(input.nextName)
    : previousName;
  const nextDescription = input.descriptionInPatch
    ? normalizeAuthoredGameText(input.nextDescription)
    : previousDescription;

  const nameChanged =
    input.nameInPatch &&
    !authoredGameTextEquals(input.previousName, input.nextName);
  const descriptionChanged =
    input.descriptionInPatch &&
    !authoredGameTextEquals(input.previousDescription, input.nextDescription);

  const nameCleared = nameChanged && nextName === null;
  const descriptionCleared = descriptionChanged && nextDescription === null;

  const nameSourceRevision = nameChanged
    ? input.previousNameSourceRevision + 1
    : input.previousNameSourceRevision;
  const descriptionSourceRevision = descriptionChanged
    ? input.previousDescriptionSourceRevision + 1
    : input.previousDescriptionSourceRevision;

  const keepOriginalNameInAllLocales = input.keepOriginalNameInAllLocales;

  const includeName =
    nameChanged && nextName !== null && !keepOriginalNameInAllLocales;
  const includeDescription = descriptionChanged && nextDescription !== null;

  const enqueueJobs = input.enqueueJobs ?? false;
  const shouldEnqueueJobs = enqueueJobs && (includeName || includeDescription);
  const shouldUpsertMeta = nameChanged || descriptionChanged;

  return {
    nameChanged,
    descriptionChanged,
    nameCleared,
    descriptionCleared,
    nameSourceRevision,
    descriptionSourceRevision,
    keepOriginalNameInAllLocales,
    includeName,
    includeDescription,
    shouldUpsertMeta,
    shouldEnqueueJobs,
    shouldWakeWorker: shouldEnqueueJobs,
    policyVersion: input.policyVersion ?? GAME_TEXT_TRANSLATION_POLICY_VERSION,
    locales: input.locales ?? APP_UI_LANGUAGES,
    effectiveName: nextName,
    effectiveDescription: nextDescription,
  };
}
