import type { ReactNode } from 'react';
import type { GameChatProps } from './types';
import { ThreadViewContext } from './ThreadViewContext';
import { useThreadViewController } from './useThreadViewController';

export function ThreadViewProvider({ children, ...props }: GameChatProps & { children: ReactNode }) {
  const value = useThreadViewController(props);
  return <ThreadViewContext.Provider value={value}>{children}</ThreadViewContext.Provider>;
}
