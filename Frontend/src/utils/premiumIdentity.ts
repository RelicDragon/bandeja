import type { User } from '@/types';

/** Public decoration only; never use this to determine membership benefits or app theme. */
export function showsPremiumStatus(user: Pick<User, 'isPremium' | 'showPremiumStatus'> | null | undefined): boolean {
  return user?.isPremium === true && user.showPremiumStatus !== false;
}
