import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Users, Plane, Check } from 'lucide-react';
import type { Game, GameParticipant } from '@/types';

interface GameCardInfoRowsProps {
  game: Game;
  participants: GameParticipant[];
  dateText: string;
  hintText?: string | null;
  className?: string;
}

const InfoIcon = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 transition-colors duration-300 group-hover:bg-primary-50 group-hover:text-primary-600 dark:group-hover:bg-primary-900/30 dark:group-hover:text-primary-400">
    {children}
  </span>
);

const LevelRange = ({ min, max }: { min: number; max: number }) => {
  const { t } = useTranslation();
  return (
    <>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {t('games.level')}:
      </span>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
        {min.toFixed(1)}-{max.toFixed(1)}
      </span>
    </>
  );
};

export const GameCardInfoRows = ({
  game,
  participants,
  dateText,
  hintText,
  className = '',
}: GameCardInfoRowsProps) => {
  const { t } = useTranslation();
  const playingCount = participants.filter((p) => p.status === 'PLAYING').length;
  const hasLevels = typeof game.minLevel === 'number' && typeof game.maxLevel === 'number';
  const fillRatio = game.maxParticipants
    ? Math.min(playingCount / game.maxParticipants, 1)
    : 0;
  const isFull = fillRatio >= 1;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <InfoIcon><Calendar size={14} /></InfoIcon>
        {game.timeIsSet === false ? (
          <span className="text-gray-500 dark:text-gray-400 italic text-xs">
            {t('gameDetails.datetimeNotSet')}
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>{dateText}</span>
          </span>
        )}
      </div>
      {hintText && (
        <div className="flex items-center gap-2 opacity-75">
          <InfoIcon><Plane size={14} /></InfoIcon>
          <span className="text-xs text-gray-500 dark:text-gray-400">{hintText}</span>
        </div>
      )}
      {(game.court?.club || game.club) && (
        <div className="flex items-center gap-2">
          <InfoIcon><MapPin size={14} /></InfoIcon>
          <span className="min-w-0 truncate">
            {game.court?.club?.name || game.club?.name}
            {game.court?.name && ` • ${game.court.name}`}
          </span>
          {game.entityType === 'BAR' && (
            <>
              <span className="text-gray-400 dark:text-gray-500">•</span>
              <Users size={16} className="shrink-0" />
              <span>{playingCount}</span>
            </>
          )}
        </div>
      )}
      {game.entityType !== 'BAR' && (
        <>
          <div className="flex items-center gap-2">
            <InfoIcon><Users size={14} /></InfoIcon>
            <span className="tabular-nums">
              {`${playingCount} / ${game.maxParticipants}`}
            </span>
            {Boolean(game.maxParticipants) &&
              (isFull ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_6px_rgba(16,185,129,0.45)]">
                  <Check size={11} strokeWidth={3} />
                </span>
              ) : (
                <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200/90 dark:bg-gray-700/90">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-[width] duration-500 ease-out"
                    style={{ width: `${fillRatio * 100}%` }}
                  />
                </span>
              ))}
            {!game.trainerId && hasLevels && (
              <>
                <span className="text-gray-400 dark:text-gray-500">•</span>
                <LevelRange min={game.minLevel as number} max={game.maxLevel as number} />
              </>
            )}
          </div>
          {game.trainerId && hasLevels && (
            <div className="flex items-center gap-2">
              <LevelRange min={game.minLevel as number} max={game.maxLevel as number} />
            </div>
          )}
        </>
      )}
    </div>
  );
};
