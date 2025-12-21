import { TFunction } from 'i18next';
import { Divider } from '@/components/Divider';
import { ChevronDown, Gamepad2, Loader2, Trash2, Send } from 'lucide-react';
import { LeagueRound, LeagueGroup } from '@/api/leagues';
import { Game } from '@/types';
import { LeagueGameCard } from './LeagueGameCard';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';

interface LeagueRoundAccordionProps {
  round: LeagueRound;
  groups: LeagueGroup[];
  canEdit: boolean;
  canEditGames: boolean;
  canDeleteRound: boolean;
  showAddGameButton: boolean;
  isExpanded: boolean;
  isCreatingGame: boolean;
  roundIdBeingDeleted: string | null;
  roundIdSendingMessage: string | null;
  selectedGroupId?: string | null;
  shouldRenderContent?: boolean;
  onToggle: () => void;
  onRequestDelete: () => void;
  onAddGame: (leagueGroupId?: string) => void;
  onEditGame: (game: Game) => void;
  onOpenGame: (game: Game) => void;
  onSendStartMessage: () => void;
  t: TFunction;
}

export const LeagueRoundAccordion = ({
  round,
  groups,
  canEdit,
  canEditGames,
  canDeleteRound,
  showAddGameButton,
  isExpanded,
  isCreatingGame,
  roundIdBeingDeleted,
  roundIdSendingMessage,
  selectedGroupId = null,
  shouldRenderContent = true,
  onToggle,
  onRequestDelete,
  onAddGame,
  onEditGame,
  onOpenGame,
  onSendStartMessage,
  t,
}: LeagueRoundAccordionProps) => {
  const hasGroups = groups.length > 0;
  const showRoundLevelAddButton = showAddGameButton && !hasGroups;
  const filteredGameCount = selectedGroupId
    ? round.games.filter((game) => game.leagueGroupId === selectedGroupId).length
    : round.games.length;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 gap-4"
      >
        <div className="flex items-center gap-3 text-left">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.round')} {round.orderIndex + 1}
          </p>
          <span className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
              {t('gameDetails.totalGames', { count: filteredGameCount })}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          {shouldRenderContent && (
          <div className="px-4 pb-4 space-y-4">
            {canEdit && (canDeleteRound || showRoundLevelAddButton || !round.sentStartMessage) && (
              <div className="flex flex-wrap gap-2">
                {!round.sentStartMessage && (
                  <button
                    onClick={onSendStartMessage}
                    disabled={roundIdSendingMessage === round.id}
                    className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium py-2 px-4 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    {roundIdSendingMessage === round.id ? (
                      <>
                        <Loader2 size={16} className="animate-spin relative z-10" />
                        <span className="relative z-10">{t('common.loading')}</span>
                      </>
                    ) : (
                      <>
                        <Send size={16} className="relative z-10" />
                        <span className="relative z-10">{t('gameDetails.sendStartMessage')}</span>
                      </>
                    )}
                  </button>
                )}
                {canDeleteRound && (
                  <button
                    onClick={onRequestDelete}
                    disabled={roundIdBeingDeleted === round.id}
                    className="group relative overflow-hidden rounded-lg border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium py-2 px-4 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    <Trash2 size={16} className="relative z-10" />
                    <span className="relative z-10">
                      {roundIdBeingDeleted === round.id ? t('common.deleting') : t('gameDetails.deleteRound')}
                    </span>
                  </button>
                )}
                {showRoundLevelAddButton && (
                  <button
                    onClick={() => onAddGame()}
                    disabled={isCreatingGame}
                    className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium py-2 px-4 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    {isCreatingGame ? (
                      <>
                        <Loader2 size={16} className="animate-spin relative z-10" />
                        <span className="relative z-10">{t('common.loading')}</span>
                      </>
                    ) : (
                      <>
                        <Gamepad2 size={16} className="relative z-10" />
                        <span className="relative z-10">{t('gameDetails.addGame')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {round.games.length === 0 && !hasGroups ? (
              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 py-8 text-center text-gray-500 dark:text-gray-400">
                {t('gameDetails.noGamesInRound')}
              </div>
            ) : (
              <>
                {hasGroups ? (
                  <div className="space-y-4">
                    {groups.map((group, groupIndex) => {
                      const groupGames = round.games.filter((game) => game.leagueGroupId === group.id);
                      const color = getLeagueGroupColor(group.color);
                      const isLastGroup = groupIndex === groups.length - 1;

                      return (
                        <div key={group.id} className="space-y-3">
                          {!selectedGroupId && (
                            <div 
                              className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 font-semibold text-sm text-center shadow-sm"
                              style={{ 
                                backgroundColor: `${color}15`,
                                borderColor: color,
                                color: color
                              }}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                              {group.name}
                            </div>
                          )}
                          <div className="space-y-3">
                            {groupGames.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 py-6 text-center text-gray-500 dark:text-gray-400">
                                {t('gameDetails.noGamesInRound')}
                              </div>
                            ) : (
                              groupGames.map((game) => (
                                <LeagueGameCard
                                  key={game.id}
                                  game={game}
                                  onEdit={
                                    game.resultsStatus === 'NONE' && canEditGames
                                      ? () => onEditGame(game)
                                      : undefined
                                  }
                                  onOpen={() => onOpenGame(game)}
                                  showGroupTag={false}
                                />
                              ))
                            )}
                            {canEdit && showAddGameButton && (
                              <div className="flex justify-end">
                                <button
                                  onClick={() => onAddGame(group.id)}
                                  disabled={isCreatingGame}
                                  className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-medium py-2 px-4 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                  {isCreatingGame ? (
                                    <>
                                      <Loader2 size={16} className="animate-spin relative z-10" />
                                      <span className="relative z-10">{t('common.loading')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Gamepad2 size={16} className="relative z-10" />
                                      <span className="relative z-10">{t('gameDetails.addGame')}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          {!isLastGroup && <Divider className="py-1" />}
                        </div>
                      );
                    })}
                    {!selectedGroupId && round.games.filter((game) => !game.leagueGroupId).length > 0 && (
                      <div className="space-y-3">
                        <div className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100/50 dark:bg-gray-800/50 font-semibold text-sm text-center text-gray-700 dark:text-gray-300 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                          {t('gameDetails.noGroup')}
                        </div>
                        <div className="space-y-3 pl-2 border-l-2 border-gray-300/40 dark:border-gray-600/40">
                          {round.games
                            .filter((game) => !game.leagueGroupId)
                            .map((game) => (
                              <LeagueGameCard
                                key={game.id}
                                game={game}
                                onEdit={
                                  game.resultsStatus === 'NONE' && canEditGames
                                    ? () => onEditGame(game)
                                    : undefined
                                }
                                onOpen={() => onOpenGame(game)}
                                showGroupTag={false}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {round.games.map((game) => (
                      <LeagueGameCard
                        key={game.id}
                        game={game}
                        onEdit={
                          game.resultsStatus === 'NONE' && canEditGames
                            ? () => onEditGame(game)
                            : undefined
                        }
                        onOpen={() => onOpenGame(game)}
                        showGroupTag={false}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

