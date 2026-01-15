import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Coins } from 'lucide-react';
import { Game, BetCondition, PredefinedCondition, Bet } from '@/types';
import { betsApi } from '@/api/bets';
import { transactionsApi } from '@/api/transactions';
import toast from 'react-hot-toast';
import { Select } from '@/components';

interface CreateBetModalProps {
  isOpen: boolean;
  game: Game;
  onClose: () => void;
  onBetCreated?: (bet: any) => void;
  onBetUpdated?: (bet: Bet) => void;
  bet?: Bet;
}

const PREDEFINED_CONDITIONS: { value: PredefinedCondition; label: string }[] = [
  { value: 'WIN_MATCH', label: 'Win a match' },
  { value: 'LOSE_MATCH', label: 'Lose a match' },
  { value: 'TIE_MATCH', label: 'Tie a match' },
  { value: 'WIN_GAME', label: 'Win the game' },
  { value: 'LOSE_GAME', label: 'Lose the game' },
  { value: 'WIN_SET', label: 'Win a set' },
  { value: 'LOSE_SET', label: 'Lose a set' },
  { value: 'STREAK_3_0', label: 'Win 3-0 in a match' },
  { value: 'STREAK_2_1', label: 'Win 2-1 in a match' },
];

export const CreateBetModal = ({ isOpen, game, onClose, onBetCreated, onBetUpdated, bet }: CreateBetModalProps) => {
  const { t } = useTranslation();
  const isEditMode = !!bet;
  const [activeTab, setActiveTab] = useState<'condition' | 'stake'>('condition');
  const [conditionType, setConditionType] = useState<BetCondition['type']>(bet?.condition.type || 'PREDEFINED');
  const [predefinedCondition, setPredefinedCondition] = useState<PredefinedCondition>(
    (bet?.condition.predefined as PredefinedCondition) || 'WIN_MATCH'
  );
  const [customCondition, setCustomCondition] = useState(bet?.condition.customText || '');
  const [entityId, setEntityId] = useState<string>(bet?.condition.entityId || '');
  const [stakeType, setStakeType] = useState<'COINS' | 'TEXT'>(bet?.stakeType || 'COINS');
  const [stakeCoins, setStakeCoins] = useState<number>(bet?.stakeCoins || 1);
  const [stakeText, setStakeText] = useState(bet?.stakeText || '');
  const [rewardType, setRewardType] = useState<'COINS' | 'TEXT'>(bet?.rewardType || 'COINS');
  const [rewardCoins, setRewardCoins] = useState<number>(bet?.rewardCoins || 1);
  const [rewardText, setRewardText] = useState(bet?.rewardText || '');
  const [wallet, setWallet] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const loadWallet = async () => {
        try {
          const response = await transactionsApi.getWallet();
          setWallet(response.data.wallet);
        } catch (error) {
          console.error('Failed to load wallet:', error);
        }
      };
      loadWallet();
      
      if (bet) {
        setConditionType(bet.condition.type);
        setPredefinedCondition((bet.condition.predefined as PredefinedCondition) || 'WIN_MATCH');
        setCustomCondition(bet.condition.customText || '');
        setEntityId(bet.condition.entityId ? String(bet.condition.entityId) : '');
        setStakeType(bet.stakeType);
        setStakeCoins(bet.stakeCoins || 1);
        setStakeText(bet.stakeText || '');
        setRewardType(bet.rewardType);
        setRewardCoins(bet.rewardCoins || 1);
        setRewardText(bet.rewardText || '');
      } else {
        setEntityId('');
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, bet]);


  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (conditionType === 'CUSTOM' && !customCondition.trim()) {
      toast.error(t('bets.fillAllFields', { defaultValue: 'Please fill all fields' }));
      return;
    }

    if (!entityId) {
      toast.error(t('bets.selectEntity', { defaultValue: 'Please select who this bet applies to' }));
      return;
    }

    if (stakeType === 'COINS' && (!stakeCoins || stakeCoins <= 0)) {
      toast.error(t('bets.invalidStakeCoins', { defaultValue: 'Stake coins must be greater than 0' }));
      return;
    }

    if (stakeType === 'TEXT' && !stakeText.trim()) {
      toast.error(t('bets.fillAllFields', { defaultValue: 'Please fill all fields' }));
      return;
    }

    if (rewardType === 'COINS' && (!rewardCoins || rewardCoins <= 0)) {
      toast.error(t('bets.invalidRewardCoins', { defaultValue: 'Reward coins must be greater than 0' }));
      return;
    }

    if (rewardType === 'TEXT' && !rewardText.trim()) {
      toast.error(t('bets.fillAllFields', { defaultValue: 'Please fill all fields' }));
      return;
    }

    if (stakeType === 'COINS' && stakeCoins > wallet) {
      toast.error(t('bets.insufficientCoins', { defaultValue: 'Insufficient coins in wallet' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const condition: BetCondition = {
        type: conditionType,
        predefined: conditionType === 'PREDEFINED' ? predefinedCondition : undefined,
        customText: conditionType === 'CUSTOM' ? customCondition : undefined,
        entityType: 'USER',
        entityId,
      };

      if (isEditMode && bet) {
        const response = await betsApi.update(bet.id, {
          condition,
          stakeType,
          stakeCoins: stakeType === 'COINS' ? stakeCoins : null,
          stakeText: stakeType === 'TEXT' ? stakeText.trim() : null,
          rewardType,
          rewardCoins: rewardType === 'COINS' ? rewardCoins : null,
          rewardText: rewardType === 'TEXT' ? rewardText.trim() : null,
        });

        onBetUpdated?.(response.data);
        toast.success(t('bets.updated', { defaultValue: 'Bet updated!' }));
      } else {
        const response = await betsApi.create({
          gameId: game.id,
          condition,
          stakeType,
          stakeCoins: stakeType === 'COINS' ? stakeCoins : null,
          stakeText: stakeType === 'TEXT' ? stakeText.trim() : null,
          rewardType,
          rewardCoins: rewardType === 'COINS' ? rewardCoins : null,
          rewardText: rewardType === 'TEXT' ? rewardText.trim() : null,
        });

        onBetCreated?.(response.data);
        toast.success(t('bets.created', { defaultValue: 'Bet created!' }));
        
        // Reset form
        setStakeCoins(1);
        setStakeText('');
        setRewardCoins(1);
        setRewardText('');
        setCustomCondition('');
        setEntityId('');
      }
      
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic', { defaultValue: 'An error occurred' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <div 
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEditMode ? t('bets.edit', { defaultValue: 'Edit Bet' }) : t('bets.create', { defaultValue: 'Create Bet' })}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('condition')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'condition'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t('bets.conditionLabel', { defaultValue: 'Condition' })}
            </button>
            <button
              onClick={() => setActiveTab('stake')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'stake'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t('bets.stake', { defaultValue: 'Stake' })}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {activeTab === 'condition' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('bets.conditionType', { defaultValue: 'Condition Type' })}
                </label>
                <Select
                  options={[
                    { value: 'PREDEFINED', label: t('bets.predefined', { defaultValue: 'Predefined' }) },
                    { value: 'CUSTOM', label: t('bets.custom', { defaultValue: 'Custom' }) },
                  ]}
                  value={conditionType}
                  onChange={(value) => setConditionType(value as BetCondition['type'])}
                />
              </div>

              {conditionType === 'PREDEFINED' ? (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('bets.conditionLabel', { defaultValue: 'Condition' })}
                  </label>
                  <Select
                    options={PREDEFINED_CONDITIONS.map(cond => ({
                      value: cond.value,
                      label: cond.label,
                    }))}
                    value={predefinedCondition}
                    onChange={(value) => setPredefinedCondition(value as PredefinedCondition)}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('bets.customCondition', { defaultValue: 'Custom Condition' })}
                  </label>
                  <textarea
                    value={customCondition}
                    onChange={(e) => setCustomCondition(e.target.value)}
                    placeholder={t('bets.customConditionPlaceholder', { defaultValue: 'Describe the condition...' })}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    rows={3}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('bets.selectUser', { defaultValue: 'Select User' })}
                </label>
                <Select
                  options={game.participants
                    .filter(p => p.isPlaying)
                    .map(p => ({
                      value: String(p.userId),
                      label: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
                    }))}
                  value={entityId ? String(entityId) : ''}
                  onChange={(value) => setEntityId(value)}
                  placeholder={t('bets.selectUser', { defaultValue: 'Select User' })}
                />
              </div>
            </>
          )}

          {activeTab === 'stake' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('bets.stake', { defaultValue: 'Stake' })}
                </label>
                <Select
                  options={[
                    { value: 'COINS', label: t('bets.coins', { defaultValue: 'Coins' }) },
                    { value: 'TEXT', label: t('bets.text', { defaultValue: 'Text' }) },
                  ]}
                  value={stakeType}
                  onChange={(value) => setStakeType(value as 'COINS' | 'TEXT')}
                  className="mb-2"
                />
                {stakeType === 'COINS' ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Coins size={16} className="text-primary-600" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t('bets.walletBalance', { defaultValue: 'Wallet' })}: {wallet} {t('bets.coins', { defaultValue: 'coins' })}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max={wallet}
                      value={stakeCoins}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setStakeCoins(Math.max(1, Math.min(val, wallet)));
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={stakeText}
                    onChange={(e) => setStakeText(e.target.value)}
                    placeholder={t('bets.stakePlaceholder', { defaultValue: 'What you are betting...' })}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('bets.reward', { defaultValue: 'Reward' })}
                </label>
                <Select
                  options={[
                    { value: 'COINS', label: t('bets.coins', { defaultValue: 'Coins' }) },
                    { value: 'TEXT', label: t('bets.text', { defaultValue: 'Text' }) },
                  ]}
                  value={rewardType}
                  onChange={(value) => setRewardType(value as 'COINS' | 'TEXT')}
                  className="mb-2"
                />
                {rewardType === 'COINS' ? (
                  <input
                    type="number"
                    min="1"
                    value={rewardCoins}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setRewardCoins(Math.max(1, val));
                    }}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                ) : (
                  <input
                    type="text"
                    value={rewardText}
                    onChange={(e) => setRewardText(e.target.value)}
                    placeholder={t('bets.rewardPlaceholder', { defaultValue: 'What you will receive...' })}
                    className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                )}
              </div>
            </>
          )}

          <div className="flex gap-2 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
            >
              {isSubmitting 
                ? (isEditMode ? t('common.updating', { defaultValue: 'Updating...' }) : t('common.creating', { defaultValue: 'Creating...' }))
                : (isEditMode ? t('common.update', { defaultValue: 'Update' }) : t('common.create', { defaultValue: 'Create' }))
              }
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
