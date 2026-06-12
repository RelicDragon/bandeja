import { multisportFlags } from '@/config/multisportFlags';

export const featureFlags = {
  multisport6Sports: multisportFlags.sixSports,
  multisportPolish: multisportFlags.polish,
  casualCreateFlow: multisportFlags.polish,
} as const;
