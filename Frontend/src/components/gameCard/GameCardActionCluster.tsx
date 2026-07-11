import { useTranslation } from 'react-i18next';
import { Bookmark, MessageCircle } from 'lucide-react';
import { UnreadBadge } from '@/components';
import { GameCardReactions } from '@/components/GameCardReactions';
import { GameCardWeatherTag } from '@/components/gameCard/GameCardWeatherTag';
import { GameCardBookedTag } from '@/components/gameCard/GameCardBookedTag';
import { getGameCardReactionTheme } from '@/utils/gameCardEntityTheme';
import type { Game, WeatherSummary } from '@/types';

type ReactionRow = { userId: string; emoji: string };

interface GameCardActionClusterProps {
  game: Game;
  reactions: ReactionRow[];
  onReactionsChange: (reactions: ReactionRow[]) => void;
  currentUserId?: string;
  weatherSummary: WeatherSummary | null;
  onWeatherClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  locale: string;
  showBookedTag: boolean;
  linkedExternalBooking: boolean;
  showNoteBookmark: boolean;
  onNoteClick: () => void;
  showChat: boolean;
  unreadCount: number;
  onChatClick: (event: React.MouseEvent) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Top-right vertical stack: reactions, weather, booking status, note + chat actions. */
export function GameCardActionCluster({
  game,
  reactions,
  onReactionsChange,
  currentUserId,
  weatherSummary,
  onWeatherClick,
  locale,
  showBookedTag,
  linkedExternalBooking,
  showNoteBookmark,
  onNoteClick,
  showChat,
  unreadCount,
  onChatClick,
}: GameCardActionClusterProps) {
  const { t } = useTranslation();
  const theme = getGameCardReactionTheme(game.entityType);

  return (
    <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
      <GameCardReactions
        entityType={game.entityType}
        gameId={game.id}
        reactions={reactions}
        currentUserId={currentUserId}
        onReactionsChange={onReactionsChange}
        pickerOpens="below"
      />
      {weatherSummary ? (
        <GameCardWeatherTag
          entityType={game.entityType}
          summary={weatherSummary}
          locale={locale}
          onClick={onWeatherClick}
        />
      ) : null}
      {showBookedTag ? <GameCardBookedTag linkedExternalBooking={linkedExternalBooking} /> : null}
      {(showNoteBookmark || showChat) && (
        <div
          className={`pointer-events-auto flex min-h-[28px] items-center rounded-lg ${theme.panel}`}
        >
          {showNoteBookmark && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onNoteClick();
              }}
              onPointerDown={stop}
              onMouseDown={stop}
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors dark:text-gray-400 ${theme.actionHover}`}
              title={t('userGameNotes.placeholder')}
              aria-label={t('userGameNotes.placeholder')}
            >
              <Bookmark size={14} />
            </button>
          )}
          {showNoteBookmark && showChat && (
            <span className={`h-4 w-px border-l ${theme.divider}`} aria-hidden />
          )}
          {showChat && (
            <button
              type="button"
              onClick={onChatClick}
              className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${theme.actionHover}`}
            >
              <MessageCircle size={15} className="text-gray-600 dark:text-gray-400" />
              <UnreadBadge count={unreadCount} className="absolute -top-1 -right-1" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
