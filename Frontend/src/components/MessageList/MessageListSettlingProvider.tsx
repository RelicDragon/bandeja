import { MessageListSettlingContext, type MessageListSettlingRefs } from './messageListSettlingContext';

export function MessageListSettlingProvider({
  value,
  children,
}: {
  value: MessageListSettlingRefs;
  children: React.ReactNode;
}) {
  return <MessageListSettlingContext.Provider value={value}>{children}</MessageListSettlingContext.Provider>;
}
