import { PremiumName } from '@/components/PremiumName';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Users, X } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { BasicUser, GameParticipant } from '@/types';
import type { Sport } from '@shared/sport';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { matchesSearch } from '@/utils/transliteration';
import { useAuthStore } from '@/store/authStore';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { formatInviteStatsRows } from '@/components/playerInvite/formatInviteStatsLine';
import { formatSportLevelBadgeDisplay, getReliabilityForSport, getUserPrimarySport } from '@/utils/profileSports';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

/** Above this many candidates the list gets a search field; below it, search is noise. */
const SEARCH_THRESHOLD = 6;
const MAX_ROWS = 50;

interface TeamPlayerSelectorProps {
  gameParticipants: GameParticipant[];
  onClose: () => void;
  onConfirm: (playerId: string) => void;
  /** Players that cannot be picked — rendered dimmed with a reason instead of hidden. */
  selectedPlayerIds?: string[];
  /** Short reason per unavailable player, e.g. `{ [userId]: 'Team 2' }`. */
  unavailableLabelById?: Record<string, string>;
  title?: string;
  /** Context badge next to the title, e.g. the target team. */
  contextLabel?: string;
  /** Players already sitting in the target team — shown so the pairing is obvious. */
  teammates?: BasicUser[];
  /** Sport driving the level badges; defaults to each player's primary sport. */
  sport?: Sport;
}

interface SelectorRow {
  participant: GameParticipant;
  unavailable: boolean;
  reason?: string;
}

function playerFullName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

export const TeamPlayerSelector = ({
  gameParticipants,
  onClose,
  onConfirm,
  selectedPlayerIds = [],
  unavailableLabelById,
  title,
  contextLabel,
  teammates = [],
  sport,
}: TeamPlayerSelectorProps) => {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const playingParticipants = useMemo(
    () => gameParticipants.filter(isParticipantPlaying),
    [gameParticipants],
  );

  const rows = useMemo<SelectorRow[]>(() => {
    const taken = new Set(selectedPlayerIds);
    const query = searchQuery.trim();
    const matched = query
      ? playingParticipants.filter((p) => matchesSearch(query, playerFullName(p.user)))
      : playingParticipants;

    return matched
      .map((participant) => {
        const unavailable = taken.has(participant.userId);
        return {
          participant,
          unavailable,
          reason: unavailable
            ? (unavailableLabelById?.[participant.userId] ?? t('games.alreadyPicked'))
            : undefined,
        };
      })
      .sort((a, b) => Number(a.unavailable) - Number(b.unavailable))
      .slice(0, MAX_ROWS);
  }, [playingParticipants, searchQuery, selectedPlayerIds, unavailableLabelById, t]);

  const availableCount = useMemo(
    () => playingParticipants.filter((p) => !selectedPlayerIds.includes(p.userId)).length,
    [playingParticipants, selectedPlayerIds],
  );

  const showSearch = playingParticipants.length > SEARCH_THRESHOLD;
  const isSearching = searchQuery.trim().length > 0;

  const handlePlayerClick = (row: SelectorRow) => {
    if (row.unavailable) return;
    onConfirm(row.participant.userId);
    handleClose();
  };

  return (
    <SportLevelProvider sport={sport}>
      <Dialog open={isOpen} onClose={handleClose} modalId="team-player-selector">
        <DialogContent
          className="gap-0 p-0"
          onOpenAutoFocus={(event) => {
            // Keep the software keyboard down — the list is the point, not the search box.
            event.preventDefault();
          }}
        >
          <DialogHeader className="flex-col items-stretch gap-2.5 px-4 pb-3 pt-4">
            <DialogTitle>{title ?? t('games.addPlayer')}</DialogTitle>
            {(contextLabel || teammates.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {contextLabel && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    {contextLabel}
                  </span>
                )}
                {teammates.length > 0 && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-gray-100 py-1 pe-3 ps-1 dark:bg-gray-800">
                    <PlayerAvatar
                      player={teammates[0]}
                      showName={false}
                      fullHideName
                      inlineFace
                      inlineFacePlain
                      subscribePresence={false}
                      asDiv
                    />
                    <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
                      {t('games.pairingWith', { name: playerFullName(teammates[0]) })}
                    </span>
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          {showSearch && (
            <div className="shrink-0 px-4 pb-1 pt-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400 dark:text-gray-500"
                  aria-hidden
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full rounded-2xl border border-gray-200/90 bg-gray-50/80 py-3 pe-10 ps-11 text-sm text-gray-900 shadow-inner shadow-gray-900/[0.03] transition placeholder:text-gray-400 focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-500 dark:focus:bg-gray-900 dark:focus:ring-primary-400/20"
                />
                {isSearching && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('common.close')}
                    className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200/70 hover:text-gray-600 dark:hover:bg-gray-700/70 dark:hover:text-gray-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner dark:from-gray-800 dark:to-gray-900">
                <Users className="h-8 w-8 text-gray-400 dark:text-gray-500" aria-hidden />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isSearching ? t('common.noResults') : t('invites.noPlayersAvailable')}
              </p>
              {isSearching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400"
                >
                  {t('playerInvite.reset')}
                </button>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-auto px-2 pb-3 pt-1">
              {availableCount === 0 && !isSearching && (
                <p className="px-2 pb-2 pt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('games.everyoneAssigned')}
                </p>
              )}
              {rows.map(({ participant, unavailable, reason }) => {
                const player = participant.user;
                const levelSport = sport ?? getUserPrimarySport(player);
                const { levelRow } = formatInviteStatsRows(
                  t,
                  formatSportLevelBadgeDisplay(player, levelSport),
                  player.socialLevel,
                  getReliabilityForSport(player, levelSport),
                );

                return (
                  <div
                    key={participant.userId}
                    role="button"
                    aria-disabled={unavailable}
                    tabIndex={unavailable ? -1 : 0}
                    onClick={() => handlePlayerClick({ participant, unavailable, reason })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePlayerClick({ participant, unavailable, reason });
                      }
                    }}
                    className={`flex select-none items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 ${
                      unavailable
                        ? 'cursor-not-allowed opacity-55'
                        : 'cursor-pointer hover:bg-gray-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-white/5'
                    }`}
                  >
                    <PlayerAvatar
                      player={player}
                      showName={false}
                      fullHideName
                      extrasmall
                      levelSport={levelSport}
                      asDiv
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        <PremiumName user={player}>
                          {player.firstName} {player.lastName}
                        </PremiumName>
                        {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
                          <i
                            className={`bi ms-1.5 text-[11px] ${
                              player.gender === 'MALE'
                                ? 'bi-gender-male text-sky-500'
                                : 'bi-gender-female text-rose-400'
                            }`}
                          />
                        )}
                        {player.id === currentUserId && (
                          <span className="ms-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                            {t('createGame.you')}
                          </span>
                        )}
                      </p>
                      {player.verbalStatus && <p className="verbal-status mt-0.5">{player.verbalStatus}</p>}
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{levelRow}</p>
                    </div>

                    {unavailable ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {reason}
                      </span>
                    ) : (
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300"
                        aria-hidden
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SportLevelProvider>
  );
};
