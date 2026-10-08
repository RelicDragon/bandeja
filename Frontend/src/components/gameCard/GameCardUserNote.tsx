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
    <div className="mt-2 space-y-1">
      {showQueueHint && (
        <div className="flex items-start gap-1.5 rounded-lg bg-sky-500/10 px-2 py-1.5" data-member-accent="sky">
          <Users size={12} className="mt-0.5 flex-shrink-0 text-sky-500 dark:text-sky-500/80" />
          <p className="flex-1 text-xs leading-snug text-sky-900 dark:text-sky-200">
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
          className="flex cursor-pointer items-start gap-1.5 rounded-lg bg-amber-400/10 px-2 py-1.5 transition-colors hover:bg-amber-400/15"
        >
          <Bookmark
            size={12}
            className="mt-0.5 flex-shrink-0 text-yellow-500 dark:text-yellow-500/80"
            fill="currentColor"
          />
          <p className="line-clamp-2 flex-1 whitespace-pre-wrap break-words text-xs leading-snug text-amber-900 dark:text-amber-200">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
