import { useContext } from 'react';
import { PlayerCardModalContext } from '@/contexts/PlayerCardModalContext';

export const usePlayerCardModal = () => {
  const context = useContext(PlayerCardModalContext);
  if (!context) {
    throw new Error('usePlayerCardModal must be used within PlayerCardModalProvider');
  }
  return context;
};

