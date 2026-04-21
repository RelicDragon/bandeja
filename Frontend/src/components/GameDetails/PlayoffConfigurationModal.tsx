import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BasicUser, GameSetupParams } from '@/types';
import { leaguesApi, LeagueStanding, LeagueGroup } from '@/api/leagues';
import { Loader2, Check } from 'lucide-react';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { PlayoffGameSetupStep } from './PlayoffGameSetupStep';

const ALL_GROUP_ID = 'ALL';
const MIN_PARTICIPANTS = 4;

type PlayoffGameType = 'WINNER_COURT' | 'AMERICANO';

interface PlayoffConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueSeasonId: string;
  hasFixedTeams: boolean;
  onCreated: () => void;
}

function compareStandings(a: LeagueStanding, b: LeagueStanding) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
  return 0;
}

function getStandingDisplayName(standing: LeagueStanding): string {
  if (standing.user) {
    return [standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ');
  }
  if (standing.leagueTeam?.players?.length) {
    return standing.leagueTeam.players
      .map((p: { user?: { firstName?: string; lastName?: string } }) =>
        [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')
      )
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

export const PlayoffConfigurationModal = ({
  isOpen,
  onClose,
  leagueSeasonId,
  hasFixedTeams,
  onCreated,
}: PlayoffConfigurationModalProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'config' | 'summary' | 'gameSetup'>('config');
  const [gameType, setGameType] = useState<PlayoffGameType>('WINNER_COURT');
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_GROUP_ID);
  const [selectedIdsByGroup, setSelectedIdsByGroup] = useState<Record<string, Set<string>>>({});
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!leagueSeasonId) return;
    setLoading(true);
    try {
      const [standingsRes, groupsRes] = await Promise.all([
        leaguesApi.getStandings(leagueSeasonId),
        leaguesApi.getGroups(leagueSeasonId).catch(() => ({ data: { groups: [], unassignedParticipants: [] } })),
      ]);
      setStandings(standingsRes.data ?? []);
      setGroups(groupsRes.data?.groups ?? []);
    } catch (e) {
      toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId, t]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setStep('config');
      setSelectedIdsByGroup({});
    }
  }, [isOpen, fetchData]);

  useEffect(() => {
    if (isOpen && groups.length > 0 && selectedGroupId === ALL_GROUP_ID) {
      setSelectedGroupId(groups[0].id);
    }
  }, [isOpen, groups, selectedGroupId]);

  const getStandingsForGroup = useCallback(
    (groupId: string) =>
      standings
        .filter((s) => (s.currentGroupId ?? s.currentGroup?.id) === groupId)
        .sort(compareStandings),
    [standings]
  );

  const filteredStandings = selectedGroupId === ALL_GROUP_ID
    ? [...standings].sort(compareStandings)
    : getStandingsForGroup(selectedGroupId);

  const currentGroupSelected = selectedIdsByGroup[selectedGroupId];
  const selectedIds = currentGroupSelected ?? new Set<string>();
  const selectedStandings = filteredStandings.filter((s) => selectedIds.has(s.id));
  const selectedCount = selectedStandings.length;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const canCreate =
    groups.length > 0 &&
    groups.every((g) => (selectedIdsByGroup[g.id]?.size ?? 0) >= MIN_PARTICIPANTS);

  const handleToggle = (id: string) => {
    setSelectedIdsByGroup((prev) => {
      const next = new Set(prev[selectedGroupId] ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [selectedGroupId]: next };
    });
  };

  const handleSelectAll = () => {
    setSelectedIdsByGroup((prev) => {
      const current = prev[selectedGroupId] ?? new Set();
      const allIds = new Set(filteredStandings.map((s) => s.id));
      const next =
        current.size === filteredStandings.length ? new Set<string>() : allIds;
      return { ...prev, [selectedGroupId]: next };
    });
  };

  const minPlayersInGroups =
    groups.length > 0
      ? Math.min(...groups.map((g) => getStandingsForGroup(g.id).length))
      : 0;
  const quickSelectOptions =
    minPlayersInGroups >= MIN_PARTICIPANTS
      ? Array.from(
          { length: minPlayersInGroups - MIN_PARTICIPANTS + 1 },
          (_, i) => MIN_PARTICIPANTS + i
        )
      : [];

  const isQuickSelectActive = (n: number) =>
    groups.every((g) => {
      const ids = selectedIdsByGroup[g.id];
      const topN = getStandingsForGroup(g.id)
        .slice(0, n)
        .map((s) => s.id);
      return (
        ids &&
        ids.size === n &&
        topN.length === n &&
        topN.every((id) => ids.has(id))
      );
    });

  const handleQuickSelectCount = (n: number) => {
    setSelectedIdsByGroup(() => {
      const next: Record<string, Set<string>> = {};
      for (const g of groups) {
        const sorted = getStandingsForGroup(g.id);
        next[g.id] = new Set(sorted.slice(0, n).map((s) => s.id));
      }
      return next;
    });
  };

  const handleCreateClick = () => {
    if (!canCreate) return;
    setStep('summary');
  };

  const handleGameSetupConfirm = async (gameSetup: GameSetupParams) => {
    if (!canCreate) return;
    setSubmitting(true);
    try {
      const groupsPayload = groups
        .map((g) => {
          const ids = selectedIdsByGroup[g.id];
          if (!ids || ids.size < MIN_PARTICIPANTS) return null;
          return { leagueGroupId: g.id, participantIds: [...ids] };
        })
        .filter((x): x is { leagueGroupId: string; participantIds: string[] } => x !== null);
      const result = await leaguesApi.createPlayoff(leagueSeasonId, {
        ...resultsRoundGenV2Payload,
        gameType,
        groups: groupsPayload,
        gameSetup,
      });
      const createdCount =
        (result.data as { games?: unknown[] })?.games?.length ??
        ((result.data as { game?: unknown })?.game ? 1 : 0);
      if (createdCount > 0) {
        toast.success(t('gameDetails.playoffCreated', { defaultValue: 'Playoff created' }));
        onCreated();
        onClose();
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const groupTitle = selectedGroup?.name ?? t('gameDetails.group', { defaultValue: 'Group' });

  const gameTypeLabel =
    gameType === 'WINNER_COURT'
      ? t('games.gameTypes.WINNER_COURT', { defaultValue: "Winner's Court" })
      : t('games.gameTypes.AMERICANO', { defaultValue: 'Americano' });

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="playoff-configuration-modal">
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-col items-center gap-1">
          <DialogTitle className="text-center">
            {step === 'config' && t('gameDetails.playoffConfiguration', { defaultValue: 'Playoff configuration' })}
            {step === 'summary' && t('gameDetails.confirmPlayoff', { defaultValue: 'Confirm playoff' })}
            {step === 'gameSetup' && t('gameResults.setupGame')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-auto px-4 py-2">
          {step === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                  {t('gameDetails.playoffFormat', { defaultValue: 'Format' })}
                </label>
                <SegmentedSwitch
                  tabs={[
                    {
                      id: 'WINNER_COURT',
                      label: t('games.gameTypes.WINNER_COURT', { defaultValue: "Winner's Court" }),
                    },
                    {
                      id: 'AMERICANO',
                      label: t('games.gameTypes.AMERICANO', { defaultValue: 'Americano' }),
                    },
                  ]}
                  activeId={gameType}
                  onChange={(id) => setGameType(id as PlayoffGameType)}
                  titleInActiveOnly={false}
                  layoutId="playoff-format"
                />
              </div>

              {groups.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                    {t('gameDetails.group', { defaultValue: 'Group' })}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => {
                      const isSelected = selectedGroupId === g.id;
                      const accent = g.color ? getLeagueGroupColor(g.color) : undefined;
                      const soft = g.color ? getLeagueGroupSoftColor(g.color, '20') : undefined;
                      const groupTotal = getStandingsForGroup(g.id).length;
                      const groupCount = selectedIdsByGroup[g.id]?.size ?? 0;
                      const groupOk = groupCount >= MIN_PARTICIPANTS;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGroupId(g.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all duration-200 ${
                            isSelected
                              ? 'border-primary-500 bg-primary-500/15 dark:bg-primary-400/15 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/30 dark:ring-primary-400/30'
                              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                          style={isSelected && soft ? { backgroundColor: soft, borderColor: accent } : undefined}
                        >
                          {g.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-current/20"
                              style={{ backgroundColor: accent }}
                            />
                          )}
                          <span>{g.name}</span>
                          <span
                            className={
                              groupOk
                                ? 'text-gray-500 dark:text-gray-400'
                                : 'text-amber-600 dark:text-amber-400 font-semibold'
                            }
                          >
                            ({groupCount}/{groupTotal})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {quickSelectOptions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                    {t('gameDetails.participants', { defaultValue: 'Participants' })}
                  </label>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 sm:gap-1.5 w-full max-w-xs sm:max-w-sm mx-auto">
                    {quickSelectOptions.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleQuickSelectCount(n)}
                        className={`aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                          isQuickSelectActive(n)
                            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/40 scale-105 ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900'
                            : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-105 active:scale-95 shadow border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {groupTitle} ({selectedCount}/{filteredStandings.length})
                  </span>
                  {filteredStandings.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {selectedIds.size === filteredStandings.length
                        ? t('common.deselectAll', { defaultValue: 'Deselect all' })
                        : t('common.selectAll', { defaultValue: 'Select all' })}
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  </div>
                ) : filteredStandings.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                    {t('gameDetails.noParticipantsInGroup', { defaultValue: 'No participants in this group.' })}
                  </p>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <th className="w-10 px-2 py-2" />
                          <th className="w-10 px-1 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
                            #
                          </th>
                          <th className="text-left py-2 pr-2 font-semibold text-gray-700 dark:text-gray-300">
                            {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
                          </th>
                          <th className="text-center py-2 font-semibold text-gray-700 dark:text-gray-300">
                            {t('gameResults.winsTiesLosses')}
                          </th>
                          <th className="text-center py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStandings.map((standing, index) => {
                          const isSelected = selectedIds.has(standing.id);
                          const accent = selectedGroup?.color
                            ? getLeagueGroupSoftColor(selectedGroup.color, '20')
                            : undefined;
                          return (
                            <tr
                              key={standing.id}
                              className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                                isSelected ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                              style={isSelected && accent ? { backgroundColor: accent } : undefined}
                            >
                              <td className="px-2 py-2">
                                <label
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleToggle(standing.id);
                                    }
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleToggle(standing.id);
                                  }}
                                  className={`cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded border transition-all duration-200 hover:border-primary-400 dark:hover:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1 dark:focus-within:ring-offset-gray-900 select-none shrink-0 outline-none ${
                                    isSelected
                                      ? 'bg-primary-500 border-primary-500 dark:bg-primary-500 dark:border-primary-500 text-white'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent'
                                  }`}
                                  aria-label={t('common.select', { defaultValue: 'Select' })}
                                  aria-pressed={isSelected}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    tabIndex={-1}
                                    className="sr-only pointer-events-none"
                                    aria-hidden
                                  />
                                  <Check size={12} strokeWidth={2.5} className={isSelected ? '' : 'opacity-0'} />
                                </label>
                              </td>
                              <td className="px-1 py-2 text-gray-600 dark:text-gray-400">{index + 1}</td>
                              <td className="py-2 pr-2">
                                {hasFixedTeams && standing.leagueTeam ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                      {standing.leagueTeam.players?.slice(0, 3).map((player: { id: string; user?: BasicUser }) => (
                                        <PlayerAvatar
                                          key={player.id}
                                          player={player.user}
                                          extrasmall
                                          showName={false}
                                          fullHideName
                                        />
                                      ))}
                                    </div>
                                    <span className="text-gray-900 dark:text-white">
                                      {standing.leagueTeam.players
                                        ?.map(
                                          (p: { user?: { firstName?: string; lastName?: string } }) =>
                                            [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')
                                        )
                                        .filter(Boolean)
                                        .join(', ')}
                                    </span>
                                  </div>
                                ) : standing.user ? (
                                  <div className="flex items-center gap-2">
                                    <PlayerAvatar
                                      player={standing.user}
                                      extrasmall
                                      showName={false}
                                      fullHideName
                                    />
                                    <span className="text-gray-900 dark:text-white">
                                      {[standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ')}
                                    </span>
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-2 text-center text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {standing.wins}-{standing.ties}-{standing.losses}
                              </td>
                              <td className="py-2 px-2 text-center text-gray-700 dark:text-gray-300">
                                {standing.scoreDelta > 0 ? '+' : ''}
                                {standing.scoreDelta}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && filteredStandings.length > 0 && selectedCount < MIN_PARTICIPANTS && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    {t('gameDetails.playoffMinParticipants', {
                      defaultValue: 'Select at least 4 participants.',
                      count: MIN_PARTICIPANTS,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t('gameDetails.playoffFormat')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{gameTypeLabel}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t('gameDetails.groupsWithPlayoff', { defaultValue: 'Groups' })}</dt>
                  <dd className="text-gray-900 dark:text-white mt-1 space-y-2">
                    {groups.map((g) => {
                      const ids = selectedIdsByGroup[g.id];
                      const count = ids?.size ?? 0;
                      if (count < MIN_PARTICIPANTS) return null;
                      const groupStandings = getStandingsForGroup(g.id).filter((s) => ids.has(s.id));
                      return (
                        <div key={g.id}>
                          <p className="font-medium flex items-center gap-2">
                            {g.color && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: getLeagueGroupColor(g.color) }}
                              />
                            )}
                            {g.name} ({count})
                          </p>
                          <ul className="list-disc list-inside space-y-0.5 mt-0.5 text-gray-600 dark:text-gray-400 ml-1">
                            {groupStandings.map((s, idx) => (
                              <li key={s.id}>{getStandingDisplayName(s)} ({idx + 1})</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {step === 'gameSetup' && (
            <PlayoffGameSetupStep
              gameType={gameType}
              onBack={() => setStep('summary')}
              onConfirm={handleGameSetupConfirm}
              submitting={submitting}
            />
          )}
        </div>

        {step !== 'gameSetup' && (
          <DialogFooter className="flex gap-1 border-t border-gray-200 dark:border-gray-700">
            {step === 'summary' ? (
              <>
                <Button variant="outline" onClick={() => setStep('config')} className="flex-1">
                  {t('common.back', { defaultValue: 'Back' })}
                </Button>
                <Button onClick={() => setStep('gameSetup')} className="flex-1">
                  {t('common.confirm')}
                </Button>
              </>
            ) : (
            <>
              <Button variant="outline" onClick={onClose} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreateClick} disabled={!canCreate} className="flex-1">
                {t('gameDetails.createPlayoff', { defaultValue: 'Create playoff' })}
              </Button>
            </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
