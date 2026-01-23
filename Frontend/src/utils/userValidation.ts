import { User } from '@/types';

export const hasValidUsername = (user: User | null): boolean => {
  if (!user) return false;

  const trimmedFirst = (user.firstName || '').trim();
  const trimmedLast = (user.lastName || '').trim();
  
  return trimmedFirst.length >= 3 || trimmedLast.length >= 3;
};

export const isProfileComplete = (user: User | null): boolean => {
  if (!user) return false;

  // For users whose PRIMARY auth provider is Apple, don't require username/email
  // per Apple guidelines. Apple provides this information through Authentication
  // Services framework and we should not require users to provide it again.
  // Note: Users can have multiple auth providers linked, but we only exempt
  // those whose primary authProvider is Apple (not those who just have appleSub linked).
  const requiresUsername = user.authProvider !== 'APPLE';
  const hasValidName = requiresUsername ? hasValidUsername(user) : true;

  return !!user.currentCity && hasValidName && user.genderIsSet === true;
};

