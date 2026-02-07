import { useEffect } from 'react';
import { useNavigationStore } from '@/store/navigationStore';
import { ChatsTab } from './ChatsTab';

export const BugsContent = () => {
  const setChatsFilter = useNavigationStore((s) => s.setChatsFilter);

  useEffect(() => {
    setChatsFilter('bugs');
  }, [setChatsFilter]);

  return <ChatsTab />;
};
