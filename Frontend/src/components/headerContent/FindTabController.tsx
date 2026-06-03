import { useNavigationStore } from '@/store/navigationStore';

export const FindTabController = () => {
  const findHeaderActions = useNavigationStore((s) => s.findHeaderActions);
  return findHeaderActions ?? null;
};
