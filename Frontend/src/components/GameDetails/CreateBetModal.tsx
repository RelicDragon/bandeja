import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { Game, BetCondition, PredefinedCondition, Bet } from '@/types';
import { betsApi } from '@/api/bets';
import { transactionsApi } from '@/api/transactions';
import toast from 'react-hot-toast';
import { Select } from '@/components';
import { BaseModal } from '@/components/BaseModal';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { AnimatePresence, motion } from 'framer-motion';

interface CreateBetModalProps {
  isOpen: boolean;
  game: Game;
  onClose: () => void;
  onBetCreated?: (bet: any) => void;
  onBetUpdated?: (bet: Bet) => void;
  bet?: Bet;
}

const getWinLoseEntityKey = (entityType: string, win: boolean) => {
  const entityKeys: Record<string, string> = {
    GAME: win ? 'winGame' : 'loseGame',
    TOURNAMENT: win ? 'winTournament' : 'loseTournament',
    LEAGUE: win ? 'winLeague' : 'loseLeague',
    LEAGUE_SEASON: win ? 'winLeagueSeason' : 'loseLeagueSeason',
  };
  return entityKeys[entityType || 'GAME'] || (win ? 'winGame' : 'loseGame');
};

const getPredefinedConditionOptions = (
  t: (key: string, options?: { defaultValue?: string; [k: string]: any }) => string,
  entityType: string | undefined,
  game: Game
): { value: string; label: string }[] => {
  const et = entityType || 'GAME';
  const maxPlace = game.fixedTeams?.length ?? game.participants?.filter(p => p.isPlaying).length ?? 0;
  const base: { value: string; label: string }[] = [
    { value: 'WIN_GAME', label: t(`bets.condition.${getWinLoseEntityKey(et, true)}`, { defaultValue: 'Win the game' }) },
    { value: 'LOSE_GAME', label: t(`bets.condition.${getWinLoseEntityKey(et, false)}`, { defaultValue: 'Lose the game' }) },
    { value: 'WIN_SET', label: t('bets.condition.winAtLeastOneSet', { defaultValue: 'Win at least one set' }) },
    { value: 'LOSE_SET', label: t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets' }) },
    { value: 'WIN_ALL_SETS', label: t('bets.condition.winAllSets', { defaultValue: 'Win all sets' }) },
    { value: 'LOSE_ALL_SETS', label: t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets' }) },
  ];
  const ordinal = (p: number) => (p === 2 ? 'nd' : p === 3 ? 'rd' : 'th');
  for (let place = 2; place <= maxPlace; place++) {
    base.push({
      value: `TAKE_PLACE_${place}`,
      label: t('bets.condition.takePlaceN', { n: place, ordinal: ordinal(place), defaultValue: `Take ${place}${ordinal(place)} place` }),
    });
  }
  return base;
};

export const CreateBetModal = ({ isOpen, game, onClose, onBetCreated, onBetUpdated, bet }: CreateBetModalProps) => {
  const { t } = useTranslation();
  const isEditMode = !!bet;
  const [activeTab, setActiveTab] = useState<'condition' | 'stake'>('condition');
  const [conditionType, setConditionType] = useState<BetCondition['type']>(bet?.condition.type || 'PREDEFINED');
  const [predefinedCondition, setPredefinedCondition] = useState<PredefinedCondition>(
    (bet?.condition.predefined as PredefinedCondition) || 'WIN_GAME'
  );
  const [takePlaceNumber, setTakePlaceNumber] = useState<number>(
    (bet?.condition.metadata?.place != null ? Number(bet.condition.metadata.place) : NaN) || 2
  );
  const [customCondition, setCustomCondition] = useState(bet?.condition.customText || '');
  const [entityId, setEntityId] = useState<string>(bet?.condition.entityId || '');
  const [stakeType, setStakeType] = useState<'COINS' | 'TEXT'>(bet?.stakeType || 'COINS');
  const [stakeCoins, setStakeCoins] = useState<number>(bet?.stakeCoins || 1);
  const [stakeCoinsInput, setStakeCoinsInput] = useState<string>(String(bet?.stakeCoins || 1));
  const [stakeText, setStakeText] = useState(bet?.stakeText || '');
  const [rewardType, setRewardType] = useState<'COINS' | 'TEXT'>(bet?.rewardType || 'COINS');
  const [rewardCoins, setRewardCoins] = useState<number>(bet?.rewardCoins || 1);
  const [rewardCoinsInput, setRewardCoinsInput] = useState<string>(String(bet?.rewardCoins || 1));
  const [rewardText, setRewardText] = useState(bet?.rewardText || '');
  const [wallet, setWallet] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
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
        setPredefinedCondition((bet.condition.predefined as PredefinedCondition) || 'WIN_GAME');
        setTakePlaceNumber(bet.condition.metadata?.place != null ? Number(bet.condition.metadata.place) : 2);
        setCustomCondition(bet.condition.customText || '');
        setEntityId(bet.condition.entityId ? String(bet.condition.entityId) : '');
        setStakeType(bet.stakeType);
        setStakeCoins(bet.stakeCoins || 1);
        setStakeCoinsInput(String(bet.stakeCoins || 1));
        setStakeText(bet.stakeText || '');
        setRewardType(bet.rewardType);
        setRewardCoins(bet.rewardCoins || 1);
        setRewardCoinsInput(String(bet.rewardCoins || 1));
        setRewardText(bet.rewardText || '');
      } else {
        setEntityId('');
        setTakePlaceNumber(2);
      }
    }
  }, [isOpen, bet]);

  const handleSubmit = async () => {
    if (conditionType === 'CUSTOM' && !customCondition.trim()) {
      toast.error(t('bets.fillAllFields', { defaultValue: 'Please fill all fields' }));
      return;
    }

    if (!entityId) {
      toast.error(t('bets.selectEntity', { defaultValue: 'Please select who this challenge applies to' }));
      return;
    }
    if (conditionType === 'PREDEFINED' && predefinedCondition === 'TAKE_PLACE' && (takePlaceNumber < 2 || !Number.isInteger(takePlaceNumber))) {
      toast.error(t('bets.selectPlace', { defaultValue: 'Please select place' }));
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
        metadata: conditionType === 'PREDEFINED' && predefinedCondition === 'TAKE_PLACE' ? { place: takePlaceNumber } : undefined,
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
        toast.success(t('bets.updated', { defaultValue: 'Challenge updated!' }));
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
        toast.success(t('bets.created', { defaultValue: 'Challenge created!' }));
        
        // Reset form
        setStakeCoins(1);
        setStakeCoinsInput('1');
        setStakeText('');
        setRewardCoins(1);
        setRewardCoinsInput('1');
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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="create-bet-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isEditMode ? t('bets.edit', { defaultValue: 'Edit Challenge' }) : t('bets.create', { defaultValue: 'Create Challenge' })}
          </h2>
        </div>

        <div className="px-6 pt-4">
          <AnimatedTabs
            tabs={[
              { id: 'condition', label: t('bets.conditionLabel', { defaultValue: 'Condition' }) },
              { id: 'stake', label: t('bets.stake', { defaultValue: 'Stake' }) },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as 'condition' | 'stake')}
            variant="pills"
          />
        </div>

        <div className="p-6 space-y-4">
          <AnimatePresence mode="wait">
            {activeTab === 'condition' && (
              <motion.div
                key="condition"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
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
                    options={getPredefinedConditionOptions(t, game.entityType, game)}
                    value={predefinedCondition === 'TAKE_PLACE' ? `TAKE_PLACE_${takePlaceNumber}` : predefinedCondition}
                    onChange={(value) => {
                      if (value.startsWith('TAKE_PLACE_')) {
                        const n = parseInt(value.replace('TAKE_PLACE_', ''), 10);
                        setPredefinedCondition('TAKE_PLACE');
                        setTakePlaceNumber(n);
                      } else {
                        setPredefinedCondition(value as PredefinedCondition);
                      }
                    }}
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
              </motion.div>
            )}

            {activeTab === 'stake' && (
              <motion.div
                key="stake"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
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
                      type="text"
                      inputMode="numeric"
                      value={stakeCoinsInput}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        if (inputValue === '' || /^\d*$/.test(inputValue)) {
                          setStakeCoinsInput(inputValue);
                          const val = parseInt(inputValue, 10);
                          if (!isNaN(val) && val > 0) {
                            setStakeCoins(Math.min(val, wallet));
                          }
                        }
                      }}
                      onBlur={() => {
                        const val = parseInt(stakeCoinsInput, 10);
                        if (isNaN(val) || val < 1) {
                          setStakeCoinsInput('1');
                          setStakeCoins(1);
                        } else {
                          const clamped = Math.min(val, wallet);
                          setStakeCoinsInput(String(clamped));
                          setStakeCoins(clamped);
                        }
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
                    type="text"
                    inputMode="numeric"
                    value={rewardCoinsInput}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      if (inputValue === '' || /^\d*$/.test(inputValue)) {
                        setRewardCoinsInput(inputValue);
                        const val = parseInt(inputValue, 10);
                        if (!isNaN(val) && val > 0) {
                          setRewardCoins(val);
                        }
                      }
                    }}
                    onBlur={() => {
                      const val = parseInt(rewardCoinsInput, 10);
                      if (isNaN(val) || val < 1) {
                        setRewardCoinsInput('1');
                        setRewardCoins(1);
                      } else {
                        setRewardCoinsInput(String(val));
                        setRewardCoins(val);
                      }
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
              </motion.div>
            )}
          </AnimatePresence>

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
    </BaseModal>
  );
};
