import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ChevronDown } from 'lucide-react';
import { Card } from '@/components';
import { LinkedBookingsList } from '@/components/gameLocationTime/LinkedBookingsList';
import { LinkedBookingCoverageBadge } from '@/components/GameDetails/LinkedBookingCoverageBadge';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { evaluateLinkedBookingCoverage } from '@shared/gameBooking/evaluateLinkedBookingCoverage';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { gamesApi } from '@/api';
import type { Club, Court, Game } from '@/types';

type GameLinkedBookingsSectionProps = {
  game: Game;
  courts: Court[];
  clubs?: Club[];
  onGameUpdate?: (game: Game) => void;
};

function resolveGameClub(game: Game, clubs?: Club[]): Club | undefined {
  return game.court?.club ?? game.club ?? (game.clubId ? clubs?.find((c) => c.id === game.clubId) : undefined);
}

export function GameLinkedBookingsSection({ game, courts, clubs, onGameUpdate }: GameLinkedBookingsSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasClub = Boolean(game.clubId || game.club || game.court?.club);
  const club = resolveGameClub(game, clubs);
  const links = game.linkedBookings ?? [];
  const linkCount = links.length;

  const coverage = useMemo(
    () =>
      evaluateLinkedBookingCoverage(
        game.linkedBookings ?? [],
        {
          startTime: game.startTime,
          endTime: game.endTime,
          maxParticipants: game.maxParticipants,
          playersPerMatch: playersPerMatchOf(game),
        },
        { timeZone: club?.city?.timezone ?? undefined },
      ),
    [game, club?.city?.timezone],
  );

  if (!hasClub || !club || !clubHasBookingIntegration(club)) return null;
  if (linkCount === 0) return null;

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <CalendarCheck size={20} className="text-primary-600 dark:text-primary-400 shrink-0" />
            <h2 className="section-title truncate">
              {t('createGame.locationTime.linkedOnlyLabel')}
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                {' '}
                ({linkCount})
              </span>
            </h2>
          </span>
          <LinkedBookingCoverageBadge fullyCovered={coverage.fullyCovered} />
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            <LinkedBookingsList
              game={game}
              club={club}
              courts={courts}
              readOnly
              verifyOwnership
              onBookingUnlinked={async () => {
                if (!onGameUpdate) return;
                const response = await gamesApi.getById(game.id);
                onGameUpdate(response.data);
              }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
