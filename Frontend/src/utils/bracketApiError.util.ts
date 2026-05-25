import { AxiosError } from 'axios';

type TFn = (key: string, options?: { defaultValue?: string }) => string;

function extractServerMessage(err: unknown): string | null {
  if (!(err instanceof AxiosError)) return null;
  const data = err.response?.data;
  if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return null;
}

function extractStatus(err: unknown): number | null {
  if (!(err instanceof AxiosError)) return null;
  return err.response?.status ?? null;
}

const WALKOVER_MESSAGE_KEYS: Array<{ test: RegExp; key: string }> = [
  { test: /only owners and admins can assign bracket walkover/i, key: 'gameDetails.bracketWalkoverErrorForbidden' },
  { test: /cannot assign walkover on a bye slot/i, key: 'gameDetails.bracketWalkoverErrorBye' },
  { test: /this slot has no advancement target/i, key: 'gameDetails.bracketWalkoverErrorNoAdvance' },
  { test: /winner is not in the bracket pool/i, key: 'gameDetails.bracketWalkoverErrorInvalidWinner' },
  { test: /winner must be a contestant/i, key: 'gameDetails.bracketWalkoverErrorNotContestant' },
  { test: /match is already final/i, key: 'gameDetails.bracketWalkoverErrorAlreadyFinal' },
  { test: /complete all play-in games before knockout walkover/i, key: 'gameDetails.bracketWalkoverErrorPlayInGate' },
  {
    test: /cannot determine both contestants for walkover/i,
    key: 'gameDetails.bracketWalkoverErrorIncompleteSlot',
  },
  { test: /cannot finalize walkover: match teams are incomplete/i, key: 'gameDetails.bracketWalkoverErrorIncompleteTeams' },
  { test: /walkover requires two sides/i, key: 'gameDetails.bracketWalkoverErrorIncompleteTeams' },
  { test: /bracket slot not found/i, key: 'gameDetails.bracketWalkoverErrorNotFound' },
  { test: /slot is not part of a bracket playoff/i, key: 'gameDetails.bracketWalkoverErrorNotFound' },
  { test: /bracket game not found/i, key: 'gameDetails.bracketWalkoverErrorNotFound' },
];

const EDIT_MESSAGE_KEYS: Array<{ test: RegExp; key: string }> = [
  { test: /only owners and admins can edit bracket slots/i, key: 'gameDetails.bracketEditErrorForbidden' },
  { test: /bracket seeding is locked/i, key: 'gameDetails.bracketEditErrorSeedingLocked' },
  { test: /play-in results are final; bracket seeding is locked/i, key: 'gameDetails.bracketEditErrorPlayInLocked' },
  {
    test: /this knockout round has final results; seeding is locked/i,
    key: 'gameDetails.bracketEditErrorKnockoutLocked',
  },
  { test: /cannot edit: a later knockout game is already final/i, key: 'gameDetails.bracketEditErrorFinalSubtree' },
  { test: /cannot edit teams on a finalized game/i, key: 'gameDetails.bracketEditErrorGameFinal' },
  { test: /participant is already assigned to another bye slot/i, key: 'gameDetails.bracketEditErrorInvalidBye' },
  { test: /this slot does not support side assignment/i, key: 'gameDetails.bracketEditErrorInvalidSwap' },
  { test: /match sides must be different participants/i, key: 'gameDetails.bracketEditErrorInvalidSwap' },
  { test: /invalid change: bye teams cannot be moved into play-in slots/i, key: 'gameDetails.bracketEditErrorInvalidBye' },
  { test: /one or more slotids are invalid/i, key: 'gameDetails.bracketEditErrorInvalidSlot' },
  { test: /duplicate slotid/i, key: 'gameDetails.bracketEditErrorInvalidSlot' },
];

function mapMessageToKey(message: string | null, rules: Array<{ test: RegExp; key: string }>): string | null {
  if (!message) return null;
  for (const rule of rules) {
    if (rule.test.test(message)) return rule.key;
  }
  return null;
}

export function bracketWalkoverErrorMessage(err: unknown, t: TFn): string {
  const status = extractStatus(err);
  const serverMsg = extractServerMessage(err);
  const key = mapMessageToKey(serverMsg, WALKOVER_MESSAGE_KEYS);
  if (key) return t(key);
  if (status === 403) return t('gameDetails.bracketWalkoverErrorForbidden');
  if (status === 404) return t('gameDetails.bracketWalkoverErrorNotFound');
  if (status === 409) return t('gameDetails.bracketWalkoverErrorAlreadyFinal');
  return t('gameDetails.bracketWalkoverErrorGeneric');
}

export function bracketEditErrorMessage(err: unknown, t: TFn): string {
  const status = extractStatus(err);
  const serverMsg = extractServerMessage(err);
  const key = mapMessageToKey(serverMsg, EDIT_MESSAGE_KEYS);
  if (key) return t(key);
  if (status === 501) return t('gameDetails.bracketEditErrorNotImplemented');
  if (status === 403) return t('gameDetails.bracketEditErrorForbidden');
  if (status === 409) {
    const lower = serverMsg?.toLowerCase() ?? '';
    if (lower.includes('bye')) return t('gameDetails.bracketEditErrorInvalidBye');
    if (lower.includes('play-in')) return t('gameDetails.bracketEditErrorInvalidSwap');
    if (lower.includes('knockout') || lower.includes('round')) return t('gameDetails.bracketEditErrorInvalidSwap');
    return t('gameDetails.bracketEditErrorFinalSubtree');
  }
  if (status === 400 && serverMsg) {
    if (/bye/i.test(serverMsg)) return t('gameDetails.bracketEditErrorInvalidBye');
  }
  return t('gameDetails.bracketEditErrorSave');
}

export function bracketNotifySummaryErrorMessage(err: unknown, t: TFn): string {
  const status = extractStatus(err);
  const serverMsg = extractServerMessage(err);
  if (serverMsg && /only owners and admins can send bracket summary/i.test(serverMsg)) {
    return t('gameDetails.bracketNotifySummaryErrorForbidden');
  }
  if (serverMsg && /bracket champion is not determined yet/i.test(serverMsg)) {
    return t('gameDetails.bracketNotifySummaryErrorNoChampion');
  }
  if (serverMsg && /bracket playoff round not found/i.test(serverMsg)) {
    return t('gameDetails.bracketNotifySummaryErrorNotFound');
  }
  if (status === 403) return t('gameDetails.bracketNotifySummaryErrorForbidden');
  if (status === 404) return t('gameDetails.bracketNotifySummaryErrorNotFound');
  if (status === 409) return t('gameDetails.bracketNotifySummaryErrorNoChampion');
  return t('gameDetails.bracketNotifySummaryErrorGeneric');
}
