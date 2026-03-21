import { User } from '@/types';

export const hasValidUsername = (user: User | null): boolean => {
  if (!user) return false;

  const trimmedFirst = (user.firstName || '').trim();
  const trimmedLast = (user.lastName || '').trim();
  
  return trimmedFirst.length >= 1 || trimmedLast.length >= 1;
};
