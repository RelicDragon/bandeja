import { useShellNavStore } from '@/store/shellNavStore';

export const FindTabController = () => {
  const findHeaderActions = useShellNavStore((s) => s.findHeaderActions);
  return findHeaderActions ?? null;
};
