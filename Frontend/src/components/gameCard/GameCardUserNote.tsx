import { useTranslation } from 'react-i18next';
import { Bookmark, Users } from 'lucide-react';

interface GameCardUserNoteProps {
  note: string | null;
  showQueueHint: boolean;
  onOpenNote: () => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Personal note (tap to edit) and owner-facing join-queue hint. */
export function GameCardUserNote({ note, showQueueHint, onOpenNote }: GameCardUserNoteProps) {
  const { t } = useTranslation();
  if (!note && !showQueueHint) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {showQueueHint && (
        <div className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50/50 p-2 dark:border-sky-800/30 dark:bg-sky-900/10">
          <Users size={12} className="mt-0.5 flex-shrink-0 text-sky-500 dark:text-sky-500/80" />
          <p className="flex-1 whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-300">
            {t('games.youHaveUserWaitingInJoinQueue')}
          </p>
        </div>
      )}
      {note && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenNote();
          }}
          onPointerDown={stop}
          onMouseDown={stop}
          className="flex cursor-pointer items-start gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50/50 p-2 transition-colors hover:bg-yellow-50 dark:border-yellow-800/30 dark:bg-yellow-900/10 dark:hover:bg-yellow-900/20"
        >
          <Bookmark
            size={12}
            className="mt-0.5 flex-shrink-0 text-yellow-500 dark:text-yellow-500/80"
            fill="currentColor"
          />
          <p className="flex-1 whitespace-pre-wrap break-words text-xs text-gray-700 dark:text-gray-300">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
