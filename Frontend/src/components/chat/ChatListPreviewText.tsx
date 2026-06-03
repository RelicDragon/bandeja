import { parseMentions } from '@/utils/parseMentions';

const MENTION_CLASS = 'italic text-blue-600 dark:text-blue-400';

type Props = { text: string };

export function ChatListPreviewText({ text }: Props) {
  const parts = parseMentions(text);
  if (parts.length === 1 && parts[0].type === 'text') {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'mention' ? (
          <span key={index} className={MENTION_CLASS}>
            @{part.display}
          </span>
        ) : (
          <span key={index}>{part.content}</span>
        )
      )}
    </>
  );
}
