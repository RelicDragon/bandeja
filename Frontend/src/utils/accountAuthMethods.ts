import type { User } from '@/types';

export type LinkableAuthMethod = 'apple' | 'google' | 'telegram';

type AuthMethodUser = Pick<User, 'phone' | 'appleSub' | 'googleId' | 'telegramId'>;

export function getLinkedAuthMethodCount(user: AuthMethodUser | null | undefined): number {
  if (!user) return 0;
  return [user.phone, user.appleSub, user.googleId, user.telegramId].filter(Boolean).length;
}

export function canUnlinkAuthMethod(
  user: AuthMethodUser | null | undefined,
  method: LinkableAuthMethod
): boolean {
  if (!user) return false;

  const linkedByMethod: Record<LinkableAuthMethod, boolean> = {
    apple: Boolean(user.appleSub),
    google: Boolean(user.googleId),
    telegram: Boolean(user.telegramId),
  };

  return linkedByMethod[method] && getLinkedAuthMethodCount(user) > 1;
}

export function hasLegacyPhoneAuth(user: AuthMethodUser | null | undefined): boolean {
  return Boolean(user?.phone);
}

export function canRemoveLegacyPhoneAuth(user: AuthMethodUser | null | undefined): boolean {
  return hasLegacyPhoneAuth(user) && getLinkedAuthMethodCount(user) > 1;
}
