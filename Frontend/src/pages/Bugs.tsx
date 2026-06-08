import { useEffect } from 'react';
import { useShellNavStore } from '@/store/shellNavStore';
import { ChatsTab } from './ChatsTab';

export const BugsContent = () => {
  const setChatsFilter = useShellNavStore((s) => s.setChatsFilter);

  useEffect(() => {
    setChatsFilter('bugs');
  }, [setChatsFilter]);

  return <ChatsTab />;
};
