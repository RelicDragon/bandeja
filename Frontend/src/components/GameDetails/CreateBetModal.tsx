import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { CircleDollarSign, Target, Zap } from 'lucide-react';
import { FaPersonRunning } from 'react-icons/fa6';
import { Game, BetCondition, PredefinedCondition, Bet } from '@/types';
import { betsApi } from '@/api/bets';
import { transactionsApi } from '@/api/transactions';
import toast from 'react-hot-toast';
import { Select } from '@/components';
import { BaseModal } from '@/components/BaseModal';
import { AnimatedTabs } from '@/components/AnimatedTabs';

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400 dark:focus:ring-primary-500/40 dark:focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-600';
const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 tracking-tight';
const sectionClass = 'rounded-2xl bg-white/90 dark:bg-gray-800/60 p-3 border border-gray-100 dark:border-gray-700/70 shadow-sm dark:shadow-none';

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
  t: (key: string, options?: { defaultValue?: string; context?: string; [k: string]: any }) => string,
  entityType: string | undefined,
  game: Game,
  isFemale?: boolean
): { value: string; label: string }[] => {
  const ctx = isFemale ? { context: 'female' as const } : {};
  const et = entityType || 'GAME';
  const playingCount = game.participants?.filter(p => p.isPlaying).length ?? 0;
  const teamCount = game.fixedTeams?.length ?? 0;
  const maxPlace = teamCount > 0 ? teamCount : playingCount;
  const base: { value: string; label: string }[] = [
    { value: 'WIN_GAME', label: t(`bets.condition.${getWinLoseEntityKey(et, true)}`, { defaultValue: 'Win the game', ...ctx }) },
    { value: 'LOSE_GAME', label: t(`bets.condition.${getWinLoseEntityKey(et, false)}`, { defaultValue: 'Lose the game', ...ctx }) },
    { value: 'WIN_SET', label: t('bets.condition.winAtLeastOneSet', { defaultValue: 'Win at least one set', ...ctx }) },
    { value: 'LOSE_SET', label: t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets', ...ctx }) },
    { value: 'WIN_ALL_SETS', label: t('bets.condition.winAllSets', { defaultValue: 'Win all sets', ...ctx }) },
    { value: 'LOSE_ALL_SETS', label: t('bets.condition.loseAllSets', { defaultValue: 'Lose all sets', ...ctx }) },
  ];
  const ordinal = (p: number) => (p === 2 ? 'nd' : p === 3 ? 'rd' : 'th');
  for (let place = 2; place <= maxPlace; place++) {
    base.push({
      value: `TAKE_PLACE_${place}`,
      label: t('bets.condition.takePlaceN', { n: place, ordinal: ordinal(place), defaultValue: `Take ${place}${ordinal(place)} place`, ...ctx }),
    });
  }
  return base;
};

const CreateBetModalInner = ({ isOpen, game, onClose, onBetCreated, onBetUpdated, bet }: CreateBetModalProps) => {
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
  const [rewardText, setRewardText] = useState(bet?.rewardText || '');
  const [wallet, setWallet] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mainTabs = useMemo(
    () => [
      { id: 'condition', label: t('bets.conditionLabel', { defaultValue: 'Condition' }), icon: <Target size={16} /> },
      { id: 'stake', label: t('bets.stake', { defaultValue: 'Stake' }), icon: <CircleDollarSign size={16} className="text-amber-500 dark:text-amber-400" /> },
    ],
    [t]
  );
  const stakeRewardTabs = useMemo(
    () => [
      { id: 'COINS', label: t('bets.coins', { defaultValue: 'Coins' }), icon: <CircleDollarSign size={14} className="text-amber-500 dark:text-amber-400" /> },
      { id: 'TEXT', label: t('bets.text', { defaultValue: 'Action' }), icon: <FaPersonRunning size={14} /> },
    ],
    [t]
  );
  const onMainTabChange = useCallback((tab: string) => setActiveTab(tab as 'condition' | 'stake'), []);
  const onStakeTypeChange = useCallback((id: string) => setStakeType(id as 'COINS' | 'TEXT'), []);

  const hasFixedTeamsSet = Boolean(
    game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length >= 2
    && game.fixedTeams.every((t) => t.players?.length > 0)
  );
  const fixedTeamOptions = useMemo(
    () =>
      hasFixedTeamsSet && game.fixedTeams
        ? game.fixedTeams.map((team) => ({
            value: team.id,
            label: team.name || team.players
              .map((pl) => `${pl.user?.firstName || ''} ${pl.user?.lastName || ''}`.trim() || '?')
              .join(' + ') || `Team ${team.teamNumber}`,
            entityType: 'TEAM' as const,
          }))
        : [],
    [hasFixedTeamsSet, game.fixedTeams]
  );
  const participantOptions = useMemo(
    () =>
      game.participants
        .filter((p) => p.isPlaying)
        .map((p) => ({
          value: String(p.userId),
          label: `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim() || 'Unknown',
          gender: p.user.gender,
          entityType: 'USER' as const,
        })),
    [game.participants]
  );
  const entityOptions = useMemo(() => {
    const base = [...fixedTeamOptions, ...participantOptions.map((p) => ({ value: p.value, label: p.label, entityType: p.entityType }))];
    if (bet?.condition?.entityType === 'TEAM' && entityId && !base.some((o) => o.value === entityId)) {
      base.unshift({
        value: entityId,
        label: t('bets.teamNoLongerAvailable', { defaultValue: 'Team (no longer available)' }),
        entityType: 'TEAM' as const,
      });
    }
    return base;
  }, [fixedTeamOptions, participantOptions, bet?.condition?.entityType, entityId, t]);
  const isFemale = useMemo(
    () => participantOptions.find((o) => o.value === entityId)?.gender === 'FEMALE',
    [participantOptions, entityId]
  );
  const selectedEntityType = useMemo(
    () =>
      (bet?.condition?.entityType === 'TEAM' && entityId) ? 'TEAM'
        : (entityId && fixedTeamOptions.some((o) => o.value === entityId) ? 'TEAM' : 'USER'),
    [entityId, fixedTeamOptions, bet?.condition?.entityType]
  );
  const predefinedOptions = useMemo(
    () => getPredefinedConditionOptions(t, game.entityType, game, isFemale),
    [t, game, isFemale]
  );
  const conditionOptions = useMemo(
    () => [...predefinedOptions, { value: 'CUSTOM', label: t('bets.custom', { defaultValue: 'Custom' }) }],
    [predefinedOptions, t]
  );
  const onConditionChange = useCallback((value: string) => {
    if (value === 'CUSTOM') {
      setConditionType('CUSTOM');
    } else {
      setConditionType('PREDEFINED');
      if (value.startsWith('TAKE_PLACE_')) {
        const n = parseInt(value.replace('TAKE_PLACE_', ''), 10);
        setPredefinedCondition('TAKE_PLACE');
        setTakePlaceNumber(n);
      } else {
        setPredefinedCondition(value as PredefinedCondition);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const enterMs = 320;
    const loadWallet = async () => {
      try {
        const response = await transactionsApi.getWallet();
        setWallet(response.data.wallet);
      } catch (error) {
        console.error('Failed to load wallet:', error);
      }
    };
    const t = setTimeout(loadWallet, enterMs);

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
      setRewardText(bet.rewardText || '');
    } else {
      setEntityId('');
      setTakePlaceNumber(2);
    }
    return () => clearTimeout(t);
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
        entityType: selectedEntityType,
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
          type: 'POOL',
          stakeType,
          stakeCoins: stakeType === 'COINS' ? stakeCoins : null,
          stakeText: stakeType === 'TEXT' ? stakeText.trim() : null,
        });

        onBetCreated?.(response.data);
        toast.success(t('bets.created', { defaultValue: 'Challenge created!' }));
        
        setStakeCoins(1);
        setStakeCoinsInput('1');
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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="create-bet-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
      contentClassName="p-0"
    >
        <div className="flex-shrink-0 px-3 pt-4 pb-3 bg-gradient-to-br from-primary-50 via-white to-primary-50/50 dark:from-primary-900/30 dark:via-gray-900 dark:to-primary-900/20 rounded-t-2xl border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 dark:from-primary-500 dark:to-primary-700 text-white shadow-lg shadow-primary-500/25">
              <Zap size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                {isEditMode ? t('bets.edit', { defaultValue: 'Edit Challenge' }) : t('bets.create', { defaultValue: 'Create Challenge' })}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 min-h-[1.25rem]">
                {activeTab === 'condition' ? t('bets.conditionLabel', { defaultValue: 'Condition' }) : t('bets.stake', { defaultValue: 'Stake' })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-3 pt-1 pb-1">
          <div className="relative flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {mainTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  onClick={() => onMainTabChange(tab.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium relative z-0 transition-colors"
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-md bg-white dark:bg-gray-700 shadow-sm"
                      layoutId="createBetActiveTab"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <motion.div
                    className="relative flex items-center gap-2"
                    animate={{
                      scale: isActive ? 1.05 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  >
                    <span className={isActive ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}>
                      {tab.icon}
                    </span>
                    <span className={isActive ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}>
                      {tab.label}
                    </span>
                  </motion.div>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 overflow-hidden min-h-0">
          <div className="overflow-y-auto px-3 pt-2 pb-3 max-h-[min(60vh,28rem)]">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === 'condition' && (
                <motion.div
                  key="condition"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="space-y-3"
                >
                  <div className={sectionClass}>
                    <Select
                      options={entityOptions.map((o) => ({ value: o.value, label: o.label }))}
                      value={entityId ? String(entityId) : ''}
                      onChange={(value) => setEntityId(value)}
                      placeholder={hasFixedTeamsSet ? t('bets.userOrTeam', { defaultValue: 'User or Team' }) : t('bets.user', { defaultValue: 'User' })}
                    />
                    <label className={`${labelClass} mt-4`}>{t('bets.mustDo', { defaultValue: 'Must', context: selectedEntityType === 'TEAM' ? 'plural' : isFemale ? 'female' : undefined })}</label>
                    <ul className="space-y-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 p-1">
                      {conditionOptions.map((opt) => {
                        const value = opt.value;
                        const isActive = conditionType === 'CUSTOM' ? value === 'CUSTOM' : (predefinedCondition === 'TAKE_PLACE' ? value === `TAKE_PLACE_${takePlaceNumber}` : value === predefinedCondition);
                        return (
                          <li key={value}>
                            <button
                              type="button"
                              onClick={() => onConditionChange(value)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary-100 dark:bg-primary-500/25 text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
                            >
                              {opt.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {conditionType === 'CUSTOM' && (
                      <textarea
                        value={customCondition}
                        onChange={(e) => setCustomCondition(e.target.value)}
                        placeholder={t('bets.customConditionPlaceholder', { defaultValue: 'Describe the condition...' })}
                        className={`${inputClass} resize-none mt-2`}
                        rows={2}
                      />
                    )}
                  </div>
                </motion.div>
              )}
              {activeTab === 'stake' && (
                <motion.div
                  key="stake"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="space-y-3"
                >
                  <div className={sectionClass}>
                    <AnimatedTabs
                      tabs={stakeRewardTabs}
                      activeTab={stakeType}
                      onTabChange={onStakeTypeChange}
                      variant="pills"
                      className="mb-3"
                    />
                    {stakeType === 'COINS' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('bets.walletBalance', { defaultValue: 'Wallet' })}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 text-sm font-semibold border border-primary-200/50 dark:border-primary-500/30">
                            <CircleDollarSign size={14} className="text-amber-500 dark:text-amber-400" />
                            {t('bets.coinsCount', { count: wallet, defaultValue: '{{count}} coins' })}
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
                          className={inputClass}
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={stakeText}
                        onChange={(e) => setStakeText(e.target.value)}
                        placeholder={t('bets.stakePlaceholder', { defaultValue: 'What you are betting...' })}
                        className={inputClass}
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-shrink-0 px-3 py-3 border-t border-gray-200 dark:border-gray-700/80 bg-gradient-to-t from-gray-50 to-white dark:from-gray-800/80 dark:to-gray-900 flex gap-2 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-700/80 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-lg shadow-primary-500/30 hover:from-primary-600 hover:to-primary-700 hover:shadow-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-primary-500/25 transition-all duration-200"
          >
            {isSubmitting
              ? (isEditMode ? t('common.updating', { defaultValue: 'Updating...' }) : t('common.creating', { defaultValue: 'Creating...' }))
              : (isEditMode ? t('common.update', { defaultValue: 'Update' }) : t('common.create', { defaultValue: 'Create' }))
            }
          </button>
        </div>
    </BaseModal>
  );
};

export const CreateBetModal = memo(CreateBetModalInner);
