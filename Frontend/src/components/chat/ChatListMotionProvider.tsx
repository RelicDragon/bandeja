import { useMemo, type ReactNode } from 'react';
import { ChatListMotionContext } from './chatListMotionContext';

export function ChatListMotionProvider({
  listLoading,
  networkSettled,
  children,
}: {
  listLoading: boolean;
  networkSettled: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      listLoading,
      networkSettled,
      motionEnabled: networkSettled,
    }),
    [listLoading, networkSettled]
  );
  return <ChatListMotionContext.Provider value={value}>{children}</ChatListMotionContext.Provider>;
}
