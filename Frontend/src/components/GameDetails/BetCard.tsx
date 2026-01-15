import { useState, useEffect } from 'react';
import { Card } from '@/components';
import { Bet, Game } from '@/types';
import { betsApi } from '@/api/bets';
import { transactionsApi } from '@/api/transactions';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Coins } from 'lucide-react';
import { CreateBetModal } from './CreateBetModal';
import { BetParticipantCard } from './BetParticipantCard';

interface BetCardProps {
  bet: Bet;
  game: Game;
  onBetUpdate: (bet: Bet) => void;
}

export const BetCard = ({ bet, game, onBetUpdate }: BetCardProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
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
  
  const isCreator = bet.creatorId === user?.id;
  const canAccept = !isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL';
  const canCancel = isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL';
  const canEdit = isCreator && bet.status === 'OPEN' && game.resultsStatus !== 'FINAL';
  
  const hasEnoughCoins = bet.rewardType === 'COINS' && bet.rewardCoins 
    ? wallet >= bet.rewardCoins 
    : true;

  useEffect(() => {
    if (canAccept && bet.rewardType === 'COINS') {
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
  }, [canAccept, bet.rewardType]);
  
  const handleAccept = async () => {
    try {
      const response = await betsApi.accept(bet.id);
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
      toast.success(t('bets.cancelled', { defaultValue: 'Bet cancelled' }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic', { defaultValue: 'An error occurred' }));
    }
  };
  
  const getConditionText = () => {
    if (bet.condition.type === 'CUSTOM') {
      return bet.condition.customText || '';
    }
    const conditionMap: Record<string, string> = {
      'WIN_GAME': t('bets.condition.winGame', { defaultValue: 'Win the game' }),
      'LOSE_GAME': t('bets.condition.loseGame', { defaultValue: 'Lose the game' }),
      'WIN_MATCH': t('bets.condition.winMatch', { defaultValue: 'Win a match' }),
      'LOSE_MATCH': t('bets.condition.loseMatch', { defaultValue: 'Lose a match' }),
      'TIE_MATCH': t('bets.condition.tieMatch', { defaultValue: 'Tie a match' }),
      'WIN_SET': t('bets.condition.winSet', { defaultValue: 'Win a set' }),
      'LOSE_SET': t('bets.condition.loseSet', { defaultValue: 'Lose a set' }),
      'STREAK_3_0': t('bets.condition.streak30', { defaultValue: 'Win 3-0 in a match' }),
      'STREAK_2_1': t('bets.condition.streak21', { defaultValue: 'Win 2-1 in a match' }),
    };
    return conditionMap[bet.condition.predefined || ''] || bet.condition.predefined;
  };
  
  const getUserBetStatus = () => {
    if (bet.status !== 'RESOLVED' || !bet.winnerId) return null;
    
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
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getCardBorderColor = () => {
    const userStatus = getUserBetStatus();
    if (userStatus === 'won') {
      return 'border-green-500 dark:border-green-400';
    } else if (userStatus === 'lost') {
      return 'border-red-500 dark:border-red-400';
    }
    return '';
  };
  
  return (
    <Card className={`relative ${getCardBorderColor()}`}>
      <div className={`absolute -top-0 -right-0 sm:top-3 sm:right-3 px-3 py-1 rounded-full text-xs font-semibold z-10 ${getStatusColor()}`}>
        {bet.status === 'RESOLVED' && getUserBetStatus() === 'won' && 'W'}
        {bet.status === 'RESOLVED' && getUserBetStatus() === 'lost' && 'L'}
        {bet.status === 'RESOLVED' && getUserBetStatus() === null && t('bets.resolved', { defaultValue: 'Resolved' })}
        {bet.status === 'OPEN' && t('bets.open', { defaultValue: 'Open' })}
        {bet.status === 'ACCEPTED' && t('bets.accepted', { defaultValue: 'Accepted' })}
        {bet.status === 'CANCELLED' && t('bets.cancelled', { defaultValue: 'Cancelled' })}
      </div>

      <div className="pt-0 sm:p-5 space-y-2">
        <div className={`rounded-2xl border border-gray-100 dark:border-gray-800 
          bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/60 dark:to-gray-900/30 
          px-4 pt-3 pb-3 space-y-3`}>
          {(betTargetUser || betTargetTeam) && (
            <div className="flex items-center justify-center gap-2">
              {betTargetUser && (
                <BetParticipantCard
                  player={betTargetUser}
                  isWinner={false}
                  showBadge={false}
                />
              )}
              {betTargetTeam && (
                <div className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-white">
                  {betTargetTeam.name || `${t('bets.team', { defaultValue: 'Team' })} ${betTargetTeam.teamNumber}`}
                </div>
              )}
            </div>
          )}
          
          <div className="text-base font-semibold text-gray-900 dark:text-white text-center">
            {getConditionText()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <Coins size={14} className="text-primary-600" />
              {t('bets.stake', { defaultValue: 'Stake' })}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1">
              {bet.stakeType === 'COINS' ? (
                <>
                  {bet.stakeCoins} <Coins size={12} />
                </>
              ) : (
                bet.stakeText
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <Coins size={14} className="text-green-600" />
              {t('bets.reward', { defaultValue: 'Reward' })}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1">
              {bet.rewardType === 'COINS' ? (
                <>
                  {bet.rewardCoins} <Coins size={12} />
                </>
              ) : (
                bet.rewardText
              )}
            </div>
          </div>
        </div>

        {bet.status === 'RESOLVED' && bet.resolutionReason && (
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/60 dark:to-gray-900/30 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
              {t('bets.resolution', { defaultValue: 'Resolution' })}
            </div>
            <div className="text-sm text-gray-900 dark:text-white">
              {bet.resolutionReason}
            </div>
          </div>
        )}

        {betCreator && bet.acceptedByUser ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('bets.createdBy', { defaultValue: 'Created by' })}
              </span>
              <BetParticipantCard
                player={betCreator}
                isWinner={bet.winnerId === bet.creatorId}
                showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
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
              />
            </div>
          </div>
        ) : (
          <>
            {betCreator && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('bets.createdBy', { defaultValue: 'Created by' })}
                </span>
                <BetParticipantCard
                  player={betCreator}
                  isWinner={bet.winnerId === bet.creatorId}
                  showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
                />
              </div>
            )}
            {bet.acceptedByUser && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {t('bets.acceptedBy', { defaultValue: 'Accepted by' })}
                </span>
                <BetParticipantCard
                  player={bet.acceptedByUser}
                  isWinner={bet.winnerId === bet.acceptedBy}
                  showBadge={bet.status === 'RESOLVED' && !!bet.winnerId}
                />
              </div>
            )}
          </>
        )}

        {(bet.status === 'OPEN' && canAccept) || canEdit || canCancel ? (
          <div className="flex flex-col gap-2">
            {bet.status === 'OPEN' && canAccept && (
              <>
                {bet.rewardType === 'COINS' && bet.rewardCoins && !hasEnoughCoins && (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    {t('bets.insufficientCoins', { defaultValue: 'Insufficient coins' })} ({wallet}/{bet.rewardCoins})
                  </div>
                )}
                <button
                  onClick={handleAccept}
                  disabled={!hasEnoughCoins || isLoadingWallet}
                  className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('bets.accept', { defaultValue: 'Accept Bet' })}
                </button>
              </>
            )}

            {canEdit && (
              <button
                onClick={() => setShowEditModal(true)}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-colors"
              >
                {t('bets.edit', { defaultValue: 'Edit' })}
              </button>
            )}

            {canCancel && (
              <button
                onClick={handleCancel}
                className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl transition-colors"
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
