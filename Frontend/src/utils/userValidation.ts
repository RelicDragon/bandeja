import { User } from '@/types';

export const hasValidUsername = (user: User | null): boolean => {
  if (!user) return false;

  const trimmedFirst = (user.firstName || '').trim();
  const trimmedLast = (user.lastName || '').trim();
  
  return trimmedFirst.length >= 3 || trimmedLast.length >= 3;
};

export const isProfileComplete = (user: User | null): boolean => {
  if (!user) return false;

  return !!user.currentCity && hasValidUsername(user);
};

