import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, MessageCircle } from 'lucide-react';
import { UnreadBadge } from '@/components';
import { GameCardReactions } from '@/components/GameCardReactions';
import { GameCardWeatherTag } from '@/components/gameCard/GameCardWeatherTag';
import { GameCardBookedTag } from '@/components/gameCard/GameCardBookedTag';
import { getGameCardReactionTheme } from '@/utils/gameCardEntityTheme';
import { gameCardReactionsEqual } from '@/utils/gameCardReactionsEqual';
import type { EntityType, WeatherSummary } from '@/types';

type ReactionRow = { userId: string; emoji: string };

interface GameCardRightRailProps {
  entityType: EntityType;
  gameId: string;
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

function GameCardRightRailInner({
  entityType,
  gameId,
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
}: GameCardRightRailProps) {
  const { t } = useTranslation();
  const theme = getGameCardReactionTheme(entityType);

  const handleNoteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onNoteClick();
    },
    [onNoteClick]
  );

  const showReactions = Boolean(currentUserId) || reactions.length > 0;
  const showNoteChat = showNoteBookmark || showChat;
  const hasContent =
    showReactions || Boolean(weatherSummary) || showBookedTag || showNoteChat;
  if (!hasContent) return null;

  return (
    <div className="relative z-20 flex shrink-0 flex-col items-end gap-1.5 self-stretch">
      {showReactions && (
        <GameCardReactions
          entityType={entityType}
          gameId={gameId}
          reactions={reactions}
          currentUserId={currentUserId}
          onReactionsChange={onReactionsChange}
          pickerOpens="below"
        />
      )}
      {weatherSummary ? (
        <GameCardWeatherTag
          entityType={entityType}
          summary={weatherSummary}
          locale={locale}
          onClick={onWeatherClick}
        />
      ) : null}
      {showBookedTag ? <GameCardBookedTag linkedExternalBooking={linkedExternalBooking} /> : null}
      {showNoteChat && (
        <div className={`pointer-events-auto flex min-h-[28px] items-center rounded-lg ${theme.panel}`}>
          {showNoteBookmark && (
            <button
              type="button"
              onClick={handleNoteClick}
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

function rightRailPropsEqual(a: GameCardRightRailProps, b: GameCardRightRailProps): boolean {
  if (a.entityType !== b.entityType) return false;
  if (a.gameId !== b.gameId) return false;
  if (a.currentUserId !== b.currentUserId) return false;
  if (a.locale !== b.locale) return false;
  if (a.showBookedTag !== b.showBookedTag) return false;
  if (a.linkedExternalBooking !== b.linkedExternalBooking) return false;
  if (a.showNoteBookmark !== b.showNoteBookmark) return false;
  if (a.showChat !== b.showChat) return false;
  if (a.unreadCount !== b.unreadCount) return false;
  if (a.onReactionsChange !== b.onReactionsChange) return false;
  if (a.onWeatherClick !== b.onWeatherClick) return false;
  if (a.onNoteClick !== b.onNoteClick) return false;
  if (a.onChatClick !== b.onChatClick) return false;
  if (!gameCardReactionsEqual(a.reactions, b.reactions)) return false;
  const aw = a.weatherSummary;
  const bw = b.weatherSummary;
  if (aw === bw) return true;
  if (!aw || !bw) return false;
  return (
    aw.temperatureC === bw.temperatureC &&
    aw.conditionKey === bw.conditionKey &&
    aw.isDay === bw.isDay &&
    aw.stale === bw.stale
  );
}

export const GameCardRightRail = memo(GameCardRightRailInner, rightRailPropsEqual);
