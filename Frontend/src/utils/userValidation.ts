import { User } from '@/types';

export const hasValidUsername = (user: User | null): boolean => {
  if (!user) return false;

  // For Apple-authenticated users, allow empty names since Apple may not provide them
  // This complies with Apple's guidelines: never require information Apple already provides
  const isAppleAuth = user.authProvider === 'APPLE' || user.appleSub;
  if (isAppleAuth) {
    return true; // Apple users are always valid, even without names
  }

  const trimmedFirst = (user.firstName || '').trim();
  const trimmedLast = (user.lastName || '').trim();
  
  return trimmedFirst.length >= 3 || trimmedLast.length >= 3;
};

export const isProfileComplete = (user: User | null): boolean => {
  if (!user) return false;

  return !!user.currentCity && hasValidUsername(user) && user.genderIsSet === true;
};

