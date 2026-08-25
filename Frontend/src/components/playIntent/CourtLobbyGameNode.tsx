import { Beer, Clock, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MatchingLobbyGame } from '@/api/playIntents';
import { CourtLobbyGameComposite } from '@/components/playIntent/CourtLobbyGameComposite';
import { CourtLobbyGamePips } from '@/components/playIntent/CourtLobbyGamePips';

type ArenaSize = { width: number; height: number };

type Props = {
  game: MatchingLobbyGame;
  busy: boolean;
  frozen: boolean;
  pinned: boolean;
  x: number;
  y: number;
  size: number;
  arenaSize: ArenaSize;
  positionTransform: (x: number, y: number, arena: ArenaSize) => string;
  onNodeRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
};

export function CourtLobbyGameNode({
  game,
  busy,
  frozen,
  pinned,
  x,
  y,
  size,
  arenaSize,
  positionTransform,
  onNodeRef,
  onClick,
}: Props) {
  const { t } = useTranslation();
  const direct = game.allowDirectJoin;
  const openSlots = Math.max(0, game.maxParticipants - game.playingCount);
  const entityLabel = t(`games.entityTypes.${game.entityType}`, {
    defaultValue: game.entityType,
  });
  const joinLabel = direct
    ? t('playIntent.matchingGameJoin', { defaultValue: 'Join' })
    : t('playIntent.matchingGameAskCta', { defaultValue: 'Ask to join' });
  const place = game.club?.name
    ? `${game.timeLabel} · ${game.club.name}`
    : game.timeLabel;
  const EntityIcon =
    game.entityType === 'TOURNAMENT'
      ? Swords
      : game.entityType === 'BAR'
        ? Beer
        : null;

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`${entityLabel} · ${place} · ${openSlots}/${game.maxParticipants} · ${joinLabel}`}
      title={`${entityLabel} · ${place}`}
      data-testid="matching-lobby-game"
      data-game-id={game.id}
      data-join={direct ? 'direct' : 'queue'}
      data-entity={game.entityType}
      data-pinned={frozen ? 'true' : 'false'}
      data-pinned-active={pinned ? 'true' : 'false'}
      ref={onNodeRef}
      className="court-lobby-arena__avatar court-lobby-arena__game absolute"
      style={{
        left: '0px',
        top: '0px',
        transform: positionTransform(x, y, arenaSize),
        width: size,
        height: size,
      }}
      onClick={onClick}
    >
      <span
        className="court-lobby-arena__avatar-visual"
        style={{
          transform: `translate(-50%, -50%) scale(${pinned ? 1.42 : 1})`,
        }}
      >
        <span className="court-lobby-arena__avatar-halo" aria-hidden />
        <span className="court-lobby-arena__avatar-image">
          <CourtLobbyGameComposite game={game} />
        </span>
      </span>
      {direct ? (
        <CourtLobbyGamePips
          playing={game.playingCount}
          max={game.maxParticipants}
        />
      ) : (
        <span className="court-lobby-arena__game-queue" aria-hidden>
          <Clock size={9} strokeWidth={3} />
        </span>
      )}
      {EntityIcon && (
        <span className="court-lobby-arena__game-mark" aria-hidden>
          <EntityIcon size={9} strokeWidth={2.6} />
        </span>
      )}
    </button>
  );
}
