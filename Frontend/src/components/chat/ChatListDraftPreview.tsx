import { useTranslation } from 'react-i18next';
import { ChatListPreviewText } from './ChatListPreviewText';

type Props = { content: string };

export function ChatListDraftPreview({ content }: Props) {
  const { t } = useTranslation();
  const draftContent = content || '';
  const displayContent = draftContent.trim()
    ? draftContent.length > 50
      ? `${draftContent.substring(0, 50)}...`
      : draftContent
    : '';
  return (
    <>
      <span className="text-red-500 dark:text-red-400">{t('chat.list.draft', { defaultValue: 'Draft:' })}</span>
      {displayContent && (
        <span className="text-gray-500 dark:text-gray-400 italic ms-1">
          <ChatListPreviewText text={displayContent} />
        </span>
      )}
    </>
  );
}
