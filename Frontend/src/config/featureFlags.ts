import { multisportFlags } from '@/config/multisportFlags';

const envFlag = (key: string): boolean =>
  import.meta.env[key] === '1' || import.meta.env[key] === 'true';

export const featureFlags = {
  stories: import.meta.env.DEV || envFlag('VITE_FEATURE_STORIES'),
  multisport6Sports: multisportFlags.sixSports,
  multisportPolish: multisportFlags.polish,
  casualCreateFlow: multisportFlags.polish,
} as const;
