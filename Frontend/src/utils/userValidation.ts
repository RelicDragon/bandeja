import { User } from '@/types';

export const hasValidUsername = (user: User | null): boolean => {
  if (!user) return false;

  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';
  const fullName = firstName + lastName;

  const alphabeticChars = fullName.replace(/[^a-zA-Z]/g, '');

  return alphabeticChars.length >= 3;
};

export const isProfileComplete = (user: User | null): boolean => {
  if (!user) return false;

  return !!user.currentCity && hasValidUsername(user);
};

