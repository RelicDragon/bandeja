import { useState, useEffect } from 'react';
import { Card } from '@/components';
import { Bet, Game } from '@/types';
import { betsApi } from '@/api/bets';
import { transactionsApi } from '@/api/transactions';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CircleDollarSign } from 'lucide-react';
import { CreateBetModal } from './CreateBetModal';
import { BetParticipantCard } from './BetParticipantCard';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';

interface BetCardProps {
  bet: Bet;
  game: Game;
  onBetUpdate: (bet: Bet) => void;
}

export const BetCard = ({ bet, game, onBetUpdate }: BetCardProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { openPlayerCard } = usePlayerCardModal();
  const [wallet, setWallet] = useState<number>(0);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const betCreator = bet.creator;
  
  const betTargetUser = bet.condition.entityType === 'USER' && bet.condition.entityId
    ? game.participants?.find(p => p.userId === bet.condition.entityId)?.user
    : null;
  
  const betTargetTeam = bet.condition.entityType === 'TEAM' && bet.condition.entityId
    ? game.fixedTeams?.find(t => t.id === bet.condition.entityId)
    : null;
  
  const isPool = bet.type === 'POOL';
  const isCreator = bet.creatorId === user?.id;
  const myParticipant = isPool && bet.participants ? bet.participants.find(p => p.userId === user?.id) : null;
  const canAccept = !isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL' && !myParticipant;
  const canCancel = isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL';
  const canEdit = isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL' && !isPool;

  const requiredCoins = isPool
    ? (bet.stakeType === 'COINS' ? (bet.stakeCoins ?? 0) : 0)
    : (bet.rewardType === 'COINS' ? (bet.rewardCoins ?? 0) : 0);
  const hasEnoughCoins = requiredCoins > 0 ? wallet >= requiredCoins : true;

  useEffect(() => {
    if (canAccept && (isPool ? bet.stakeType === 'COINS' : bet.rewardType === 'COINS')) {
      const loadWallet = async () => {
        try {
          const response = await transactionsApi.getWallet();
          setWallet(response.data.wallet);
        } catch (error) {
          console.error('Failed to load wallet:', error);
        } finally {
          setIsLoadingWallet(false);
        }
      };
      loadWallet();
    } else {
      setIsLoadingWallet(false);
    }
  }, [canAccept, isPool, bet.stakeType, bet.stakeCoins, bet.rewardType]);

  const handleAccept = async (side?: 'WITH_CREATOR' | 'AGAINST_CREATOR') => {
    try {
      const response = await betsApi.accept(bet.id, side);
      onBetUpdate(response.data);
      toast.success(t('bets.accepted', { defaultValue: 'Bet accepted!' }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic', { defaultValue: 'An error occurred' }));
    }
  };
  
  const handleCancel = async () => {
    try {
      await betsApi.cancel(bet.id);
      onBetUpdate({ ...bet, status: 'CANCELLED' });
      toast.success(t('bets.cancelled', { defaultValue: 'Challenge cancelled' }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic', { defaultValue: 'An error occurred' }));
    }
  };
  
  const getWinLoseEntityKey = (win: boolean) => {
    const entityKeys: Record<string, string> = {
      GAME: win ? 'winGame' : 'loseGame',
      TOURNAMENT: win ? 'winTournament' : 'loseTournament',
      LEAGUE: win ? 'winLeague' : 'loseLeague',
      LEAGUE_SEASON: win ? 'winLeagueSeason' : 'loseLeagueSeason',
    };
    const key = entityKeys[game.entityType || 'GAME'] || (win ? 'winGame' : 'loseGame');
    return t(`bets.condition.${key}`, { defaultValue: win ? 'Win the game' : 'Lose the game' });
  };

  const getConditionText = () => {
    if (bet.condition.type === 'CUSTOM') {
      return bet.condition.customText || '';
    }
    const pre = bet.condition.predefined || '';
    if (pre === 'WIN_GAME') return getWinLoseEntityKey(true);
    if (pre === 'LOSE_GAME') return getWinLoseEntityKey(false);
    if (pre === 'TAKE_PLACE') {
      const place = bet.condition.metadata?.place != null ? Number(bet.condition.metadata.place) : 0;
      if (!Number.isInteger(place) || place < 2) {
        return t('bets.invalidBet', { defaultValue: 'Invalid bet' });
      }
      const ordinal = place === 2 ? 'nd' : place === 3 ? 'rd' : 'th';
      return t('bets.condition.takePlaceN', { n: place, ordinal, defaultValue: `Take ${place}${ordinal} place` } as Record<string, unknown>);
    }
    const conditionMap: Record<string, string> = {
      'WIN_SET': t('bets.condition.winAtLeastOneSet', { defaultValue: 'Win at least one set' }),
      'LOSE_SET': t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets' }),
      'WIN_ALL_SETS': t('bets.condition.winAllSets', { defaultValue: 'Win all sets' }),
      'LOSE_ALL_SETS': t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets' }),
    };
    return conditionMap[pre] || pre;
  };
  
  const getUserBetStatus = () => {
    if (bet.status !== 'RESOLVED') return null;
    if (isPool) {
      const meta = bet.metadata?.resolution;
      const winnerIds = meta?.winnerIds as string[] | undefined;
      if (!winnerIds) return null;
      const isParticipant = bet.participants?.some(p => p.userId === user?.id) ?? (bet.creatorId === user?.id);
      if (!isParticipant) return null;
      return winnerIds.includes(user?.id ?? '') ? 'won' : 'lost';
    }
    if (!bet.winnerId) return null;
    const isUserParticipant = bet.creatorId === user?.id || bet.acceptedBy === user?.id;
    if (!isUserParticipant) return null;
    return bet.winnerId === user?.id ? 'won' : 'lost';
  };

  const getStatusColor = () => {
    switch (bet.status) {
      case 'OPEN':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'ACCEPTED':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'RESOLVED': {
        const userStatus = getUserBetStatus();
        if (userStatus === 'won') {
          return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
        } else if (userStatus === 'lost') {
          return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
        }
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      }
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getCardBorderColor = () => {
    if (bet.status === 'CANCELLED') {
      return 'border-red-400 dark:border-red-600';
    }
    const userStatus = getUserBetStatus();
    if (userStatus === 'won') {
      return 'border-green-500 dark:border-green-400';
    } else if (userStatus === 'lost') {
      return 'border-red-500 dark:border-red-400';
    }
    return '';
  };

  const isCancelled = bet.status === 'CANCELLED';
  const cardBgClass = isCancelled ? 'bg-red-50 dark:bg-red-950/40' : '';

  return (
    <Card className={`relative overflow-hidden shadow-sm ${cardBgClass} ${getCardBorderColor()}`}>
      <div className={`absolute -top-0 -right-0 sm:top-2 sm:right-2 px-1.5 py-0.5 rounded-full text-xs font-semibold z-10 shadow-sm backdrop-blur-sm ${getStatusColor()}`}>
        {isPool && bet.status === 'OPEN' && t('bets.pool', { defaultValue: 'Pool' })}
        {bet.status === 'RESOLVED' && getUserBetStatus() === 'won' && 'W'}
        {bet.status === 'RESOLVED' && getUserBetStatus() === 'lost' && 'L'}
        {bet.status === 'RESOLVED' && getUserBetStatus() === null && !isPool && t('bets.resolved', { defaultValue: 'Resolved' })}
        {bet.status === 'RESOLVED' && getUserBetStatus() === null && isPool && t('bets.resolved', { defaultValue: 'Resolved' })}
        {bet.status === 'OPEN' && !isPool && t('bets.open', { defaultValue: 'Open' })}
        {bet.status === 'ACCEPTED' && t('bets.accepted', { defaultValue: 'Accepted' })}
        {bet.status === 'CANCELLED' && t('bets.cancelled', { defaultValue: 'Cancelled' })}
      </div>

      <div className="pt-0 sm:p-3 space-y-2">
        <div className={`rounded-2xl border shadow-sm px-2 pt-2 pb-2 ${
          isCancelled
            ? 'border-red-200 dark:border-red-900/60 bg-gradient-to-br from-red-50/80 to-red-100/50 dark:from-red-950/50 dark:to-red-900/30'
            : 'border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/60 dark:to-gray-900/30'
        }`}>
          <div className="flex flex-wrap items-baseline justify-start gap-x-2 gap-y-1 text-left">
            {betCreator && (
              <>
                <BetParticipantCard
                  player={betCreator}
                  isWinner={isPool ? (bet.status === 'RESOLVED' && bet.metadata?.resolution?.winnerIds?.includes(betCreator.id)) : (bet.winnerId === bet.creatorId)}
                  showBadge={bet.status === 'RESOLVED' && (isPool ? !!bet.metadata?.resolution?.winnerIds : !!bet.winnerId)}
                  onClick={() => openPlayerCard(betCreator.id)}
                />
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('bets.betsThat', { defaultValue: 'bets that' })}
                </span>
              </>
            )}
            {(betTargetUser || betTargetTeam) && (
              <>
                {betTargetUser && (
                  <BetParticipantCard
                    player={betTargetUser}
                    isWinner={false}
                    showBadge={false}
                    onClick={() => openPlayerCard(betTargetUser.id)}
                  />
                )}
                {betTargetTeam && (
                  <div className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-1 text-xs font-medium text-gray-900 dark:text-white shadow-sm">
                    {betTargetTeam.name
                      || (betTargetTeam.players?.length
                        ? betTargetTeam.players
                            .map((pl) => `${pl.user?.firstName || ''} ${pl.user?.lastName || ''}`.trim() || '?')
                            .join(' + ')
                        : `${t('bets.team', { defaultValue: 'Team' })} ${betTargetTeam.teamNumber}`)}
                  </div>
                )}
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('bets.mustDo', {
                    defaultValue: 'Must',
                    context: bet.condition.entityType === 'TEAM' ? 'plural' : betTargetUser?.gender === 'FEMALE' ? 'female' : undefined,
                  })}
                </span>
              </>
            )}
            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/90 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-100 dark:ring-gray-700/50">
              {getConditionText()}
            </span>
          </div>
        </div>

        <div className={`grid gap-2 ${isPool && bet.stakeType === 'COINS' ? 'grid-cols-2' : isPool ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className={`rounded-2xl border shadow-sm px-1.5 py-1.5 ${
            isCancelled
              ? 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/40 border-l-2 border-l-red-400/60 dark:border-l-red-500/50'
              : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 border-l-2 border-l-amber-400/50 dark:border-l-amber-500/40'
          }`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">
              <CircleDollarSign size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
              {t('bets.stake', { defaultValue: 'Stake' })}
            </div>
            <div className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white flex items-center gap-1">
              {bet.stakeType === 'COINS' ? (
                <>
                  {bet.stakeCoins} <CircleDollarSign size={12} className="text-amber-500 dark:text-amber-400" />
                </>
              ) : (
                bet.stakeText ?? '—'
              )}
            </div>
          </div>

          {isPool && bet.stakeType === 'COINS' && (
            <div className={`rounded-2xl border shadow-sm px-1.5 py-1.5 ${
              isCancelled
                ? 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/40 border-l-2 border-l-red-400/60 dark:border-l-red-500/50'
                : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 border-l-2 border-l-emerald-400/50 dark:border-l-emerald-500/40'
            }`}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">
                <CircleDollarSign size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
                {t('bets.bank', { defaultValue: 'Bank' })}
              </div>
              <div className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white flex items-center gap-1">
                {bet.poolTotalCoins ?? bet.stakeCoins} <CircleDollarSign size={12} className="text-amber-500 dark:text-amber-400" />
              </div>
            </div>
          )}

          {!isPool && (
          <div className={`rounded-2xl border shadow-sm px-1.5 py-1.5 ${
            isCancelled
              ? 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/40 border-l-2 border-l-red-400/60 dark:border-l-red-500/50'
              : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 border-l-2 border-l-amber-400/50 dark:border-l-amber-500/40'
          }`}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 font-medium">
              <CircleDollarSign size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
              {t('bets.reward', { defaultValue: 'Reward' })}
            </div>
            <div className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white flex items-center gap-1">
              {bet.rewardType === 'COINS' ? (
                <>
                  {bet.rewardCoins} <CircleDollarSign size={12} className="text-amber-500 dark:text-amber-400" />
                </>
              ) : (
                bet.rewardText
              )}
            </div>
          </div>
          )}
        </div>

        {isPool && bet.participants && bet.participants.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-2xl border shadow-sm px-1.5 py-1.5 ${
              isCancelled
                ? 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/40 border-l-2 border-l-red-400/60 dark:border-l-red-500/50'
                : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 border-l-2 border-l-green-400/40 dark:border-l-green-500/30'
            }`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1 font-medium">
                {t('bets.support', { defaultValue: 'Support' })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bet.participants.filter(p => p.side === 'WITH_CREATOR').map(p => (
                  <BetParticipantCard
                    key={p.id}
                    player={p.user}
                    isWinner={false}
                    showBadge={false}
                    onClick={() => openPlayerCard(p.user.id)}
                  />
                ))}
              </div>
            </div>
            <div className={`rounded-2xl border shadow-sm px-1.5 py-1.5 ${
              isCancelled
                ? 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/40 border-l-2 border-l-red-400/60 dark:border-l-red-500/50'
                : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 border-l-2 border-l-amber-400/40 dark:border-l-amber-500/30'
            }`}>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1 font-medium">
                {t('bets.against', { defaultValue: 'Against' })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {bet.participants.filter(p => p.side === 'AGAINST_CREATOR').map(p => (
                  <BetParticipantCard
                    key={p.id}
                    player={p.user}
                    isWinner={false}
                    showBadge={false}
                    onClick={() => openPlayerCard(p.user.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {isPool && myParticipant && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('bets.youJoined', { defaultValue: 'You joined' })}: {myParticipant.side === 'WITH_CREATOR' ? t('bets.support', { defaultValue: 'Support' }) : t('bets.against', { defaultValue: 'Against' })}
          </div>
        )}

        {bet.status === 'RESOLVED' && bet.resolutionReason && (
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/60 dark:to-gray-900/30 shadow-sm px-2 py-2">
            <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1 font-medium">
              {t('bets.resolution', { defaultValue: 'Resolution' })}
            </div>
            <div className="text-sm text-gray-900 dark:text-white">
              {bet.resolutionReason}
            </div>
          </div>
        )}

        {!isPool && betCreator && bet.acceptedByUser ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('bets.createdBy', { defaultValue: 'Created by' })}
              </span>
              <BetParticipantCard
                player={betCreator}
                isWinner={bet.winnerId === bet.creatorId}
                showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
                onClick={() => openPlayerCard(betCreator.id)}
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('bets.acceptedBy', { defaultValue: 'Accepted by' })}
              </span>
              <BetParticipantCard
                player={bet.acceptedByUser}
                isWinner={bet.winnerId === bet.acceptedBy}
                showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
                onClick={() => bet.acceptedByUser && openPlayerCard(bet.acceptedByUser.id)}
              />
            </div>
          </div>
        ) : (
          <>
            {bet.acceptedByUser && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('bets.acceptedBy', { defaultValue: 'Accepted by' })}
                </span>
                <BetParticipantCard
                  player={bet.acceptedByUser}
                  isWinner={bet.winnerId === bet.acceptedBy}
                  showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
                  onClick={() => bet.acceptedByUser && openPlayerCard(bet.acceptedByUser.id)}
                />
              </div>
            )}
          </>
        )}

        {(bet.status === 'OPEN' && canAccept) || canEdit || canCancel ? (
          <div className="flex flex-col gap-2">
            {bet.status === 'OPEN' && canAccept && (
              <>
                {requiredCoins > 0 && !hasEnoughCoins && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {t('bets.insufficientCoins', { defaultValue: 'Insufficient coins' })} ({wallet}/{requiredCoins})
                  </div>
                )}
                {isPool ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept('WITH_CREATOR')}
                      disabled={!hasEnoughCoins || isLoadingWallet}
                      className="flex-1 px-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-2xl shadow-sm hover:shadow transition-shadow active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {t('bets.withCreator', { defaultValue: 'With creator' })}
                    </button>
                    <button
                      onClick={() => handleAccept('AGAINST_CREATOR')}
                      disabled={!hasEnoughCoins || isLoadingWallet}
                      className="flex-1 px-2 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl shadow-sm hover:shadow transition-shadow active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {t('bets.againstCreator', { defaultValue: 'Against creator' })}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAccept()}
                    disabled={!hasEnoughCoins || isLoadingWallet}
                    className="w-full px-2 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl shadow-sm hover:shadow transition-shadow active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {t('bets.accept', { defaultValue: 'Accept Challenge' })}
                  </button>
                )}
              </>
            )}

            {canEdit && (
              <button
                onClick={() => setShowEditModal(true)}
                className="w-full px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-sm hover:shadow transition-shadow active:scale-[0.98]"
              >
                {t('bets.edit', { defaultValue: 'Edit' })}
              </button>
            )}

            {canCancel && (
              <button
                onClick={handleCancel}
                className="w-full px-2 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl shadow-sm hover:shadow transition-shadow active:scale-[0.98]"
              >
                {t('bets.cancel', { defaultValue: 'Cancel' })}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showEditModal && (
        <CreateBetModal
          isOpen={showEditModal}
          game={game}
          bet={bet}
          onClose={() => setShowEditModal(false)}
          onBetUpdated={(updatedBet) => {
            onBetUpdate(updatedBet);
            setShowEditModal(false);
          }}
        />
      )}
    </Card>
  );
};
