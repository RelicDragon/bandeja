import { Capacitor } from '@capacitor/core';
import type { User } from '@/types';
import {
  getRefreshCredentialNative,
  getTokenNative,
  type RefreshCredentialRead,
} from '@/services/authBridge';
import {
  applySharedSessionAccountSwitch,
  applySharedSessionUser,
} from '@/services/sharedSessionAccountSwitch';

export type SharedSessionSettlementMode = 'cold_start' | 'foreground';

export type SharedSessionSettlementAction =
  | { type: 'continue' }
  | { type: 'degraded'; reason: string }
  | { type: 'cleared'; reason: string };

export type SharedSessionSettlementDeps = {
  mode: SharedSessionSettlementMode;
  getAccessToken: () => string | null;
  getPreviousUser: () => User | null;
  hasStoredUserCandidate: () => boolean;
  adoptAccessToken: (token: string) => void;
  clearLocalAuth: (reason: string) => Promise<void>;
  loadCurrentUser: () => Promise<User | null>;
  onAccountSwitch: (previousUserId: string, nextUser: User) => Promise<void>;
  applyCurrentUser: (nextUser: User) => Promise<void>;
  readCredential?: () => Promise<RefreshCredentialRead>;
  readSharedAccess?: () => Promise<string | null>;
};

export function isIosSharedSessionPlatform(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function hasLocalSessionCandidate(deps: SharedSessionSettlementDeps): boolean {
  return !!(deps.getAccessToken() || deps.getPreviousUser() || deps.hasStoredUserCandidate());
}

export async function settleSharedSession(
  deps: SharedSessionSettlementDeps,
): Promise<SharedSessionSettlementAction> {
  if (!isIosSharedSessionPlatform()) return { type: 'continue' };

  const readCredential = deps.readCredential ?? getRefreshCredentialNative;
  const readSharedAccess = deps.readSharedAccess ?? getTokenNative;
  const credential = await readCredential();

  if (credential.status === 'unavailable') {
    if (hasLocalSessionCandidate(deps)) {
      return { type: 'degraded', reason: 'keychain_unavailable' };
    }
    return { type: 'continue' };
  }

  if (credential.status === 'missing') {
    if (hasLocalSessionCandidate(deps)) {
      await deps.clearLocalAuth('shared_credential_missing');
      return { type: 'cleared', reason: 'shared_credential_missing' };
    }
    return { type: 'continue' };
  }

  let accessToken = deps.getAccessToken();
  const sharedAccess = await readSharedAccess();
  const adoptedSharedAccess = !!sharedAccess && sharedAccess !== accessToken;
  if (sharedAccess && sharedAccess !== accessToken) {
    deps.adoptAccessToken(sharedAccess);
    accessToken = sharedAccess;
  }

  const shouldVerifyProfile =
    adoptedSharedAccess ||
    (deps.mode === 'foreground' && !!accessToken && hasLocalSessionCandidate(deps));

  if (!shouldVerifyProfile) return { type: 'continue' };

  const previousUser = deps.getPreviousUser();
  try {
    const nextUser = await deps.loadCurrentUser();
    if (
      nextUser?.id &&
      previousUser?.id &&
      String(nextUser.id) !== String(previousUser.id)
    ) {
      await deps.onAccountSwitch(String(previousUser.id), nextUser);
    } else if (nextUser) {
      await deps.applyCurrentUser(nextUser);
    }
  } catch {
    return { type: 'degraded', reason: 'profile_verify_failed' };
  }

  return { type: 'continue' };
}

export async function defaultLoadCurrentUser(): Promise<User | null> {
  const { usersApi } = await import('@/api');
  const response = await usersApi.getProfile();
  return response.data ?? null;
}

export const defaultSharedSessionAccountSwitch = applySharedSessionAccountSwitch;
export const defaultApplySharedSessionUser = applySharedSessionUser;
