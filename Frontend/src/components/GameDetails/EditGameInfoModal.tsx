import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Edit3, Clock, MapPin, Banknote } from 'lucide-react';
import { Game, Club, Court, PriceType, PriceCurrency } from '@/types';
import { addHours } from 'date-fns';
import { createDateFromClubTime } from '@/hooks/useGameTimeDuration';
import { gamesApi, courtsApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { GeneralTab, type GeneralTabState } from './editGameInfo/GeneralTab';
import { WhenTab } from './editGameInfo/WhenTab';
import { WhereTab, type WhereTabState } from './editGameInfo/WhereTab';
import { PriceTab, type PriceTabState } from './editGameInfo/PriceTab';
import { useGameTimeDuration } from '@/hooks/useGameTimeDuration';
export type EditGameInfoTabId = 'general' | 'when' | 'where' | 'price';

interface EditGameInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  clubs: Club[];
  courts: Court[];
  initialTab?: EditGameInfoTabId;
  onGameUpdate?: (game: Game) => void;
  onCourtsChange?: (courts: Court[]) => void;
}

const TABS = [
  { id: 'general' as const, label: 'General', icon: Edit3 },
  { id: 'where' as const, label: 'Where', icon: MapPin },
  { id: 'when' as const, label: 'When', icon: Clock },
  { id: 'price' as const, label: 'Price', icon: Banknote },
];

function getInitialGeneralState(game: Game): GeneralTabState {
  return {
    name: game.name || '',
    description: game.description || '',
    pendingAvatar: null,
    removeAvatar: false,
  };
}

function getInitialWhereState(game: Game): WhereTabState {
  return {
    clubId: game.clubId || '',
    courtId: game.courtId || '',
    hasBookedCourt: game.hasBookedCourt ?? false,
  };
}

function getInitialPriceState(game: Game, userCurrency: PriceCurrency): PriceTabState {
  return {
    priceType: (game.priceType as PriceType) || 'NOT_KNOWN',
    priceTotal: game.priceTotal,
    priceCurrency: game.priceCurrency ?? userCurrency,
    inputValue: game.priceTotal != null ? String(game.priceTotal) : '',
  };
}

export const EditGameInfoModal = ({
  isOpen,
  onClose,
  game,
  clubs,
  courts,
  initialTab = 'general',
  onGameUpdate,
  onCourtsChange,
}: EditGameInfoModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userCurrency = resolveUserCurrency(user?.defaultCurrency);

  const [activeTab, setActiveTab] = useState<EditGameInfoTabId>(initialTab);
  const [general, setGeneral] = useState<GeneralTabState>(() => getInitialGeneralState(game));
  const [where, setWhere] = useState<WhereTabState>(() => getInitialWhereState(game));
  const [price, setPrice] = useState<PriceTabState>(() => getInitialPriceState(game, userCurrency));
  const [whenSelectedDate, setWhenSelectedDate] = useState<Date>(() =>
    game.startTime ? new Date(game.startTime) : new Date()
  );
  const [whenSelectedTime, setWhenSelectedTime] = useState<string>(() =>
    game.startTime ? new Date(game.startTime).toTimeString().slice(0, 5) : ''
  );
  const [whenDuration, setWhenDuration] = useState<number>(() =>
    game.startTime && game.endTime
      ? (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60)
      : 2
  );
  const [whenShowPastTimes, setWhenShowPastTimes] = useState(false);
  const [whenShowDatePicker, setWhenShowDatePicker] = useState(false);
  const [disableWhenAutoAdjust, setDisableWhenAutoAdjust] = useState(true);
  const [modalCourts, setModalCourts] = useState<Court[]>(courts);
  const [isLoadingCourts, setIsLoadingCourts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const whenInitialValues = useMemo(
    () => ({
      initialDate: game.startTime ? new Date(game.startTime) : new Date(),
      initialTime: game.startTime ? new Date(game.startTime).toTimeString().slice(0, 5) : '',
      initialDuration:
        game.startTime && game.endTime
          ? (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60)
          : 2,
    }),
    [game.startTime, game.endTime]
  );

  const {
    selectedDate: hookDate,
    setSelectedDate: setHookDate,
    selectedTime: hookTime,
    setSelectedTime: setHookTime,
    duration: hookDuration,
    setDuration: setHookDuration,
    showPastTimes: hookShowPastTimes,
    setShowPastTimes: setHookShowPastTimes,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  } = useGameTimeDuration({
    clubs,
    selectedClub: where.clubId,
    initialDate: whenInitialValues.initialDate,
    showPastTimes: false,
    disableAutoAdjust: disableWhenAutoAdjust,
  });

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setActiveTab(initialTab);
      setGeneral(getInitialGeneralState(game));
      setWhere(getInitialWhereState(game));
      setPrice(getInitialPriceState(game, userCurrency));
      setWhenSelectedDate(whenInitialValues.initialDate);
      setWhenSelectedTime(whenInitialValues.initialTime);
      setWhenDuration(whenInitialValues.initialDuration);
      setHookDate(whenInitialValues.initialDate);
      setHookTime(whenInitialValues.initialTime);
      setHookDuration(whenInitialValues.initialDuration);
      setDisableWhenAutoAdjust(true);
      setModalCourts(game.clubId && courts.length > 0 && courts[0]?.clubId === game.clubId ? courts : []);
      setTimeout(() => setDisableWhenAutoAdjust(false), 200);
    }
    prevIsOpenRef.current = isOpen;
  }, [
    isOpen,
    initialTab,
    game,
    userCurrency,
    whenInitialValues.initialDate,
    whenInitialValues.initialTime,
    whenInitialValues.initialDuration,
    game.clubId,
    courts,
    setHookDate,
    setHookTime,
    setHookDuration,
  ]);

  useEffect(() => {
    if (!disableWhenAutoAdjust) {
      setWhenSelectedDate(hookDate);
      setWhenSelectedTime(hookTime);
      setWhenDuration(hookDuration);
      setWhenShowPastTimes(hookShowPastTimes);
    }
  }, [disableWhenAutoAdjust, hookDate, hookTime, hookDuration, hookShowPastTimes]);

  useEffect(() => {
    if (!isOpen) return;
    if (general.pendingAvatar) {
      const url = URL.createObjectURL(general.pendingAvatar.avatar);
      setAvatarPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAvatarPreviewUrl(null);
  }, [isOpen, general.pendingAvatar]);

  useEffect(() => {
    if (!isOpen) return;
    if (!where.clubId) {
      setModalCourts([]);
      return;
    }
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    setIsLoadingCourts(true);
    courtsApi
      .getByClubId(where.clubId)
      .then((res) => {
        if (ac.signal.aborted) return;
        setModalCourts(res.data);
        onCourtsChange?.(res.data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || ac.signal.aborted) return;
        setModalCourts([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsLoadingCourts(false);
        if (fetchAbortRef.current === ac) fetchAbortRef.current = null;
      });
    return () => {
      ac.abort();
    };
  }, [isOpen, where.clubId, onCourtsChange]);

  const getDurationLabel = (dur: number) => {
    if (dur === Math.floor(dur)) return t('createGame.hours', { count: dur });
    const hours = Math.floor(dur);
    const minutes = (dur % 1) * 60;
    return t('createGame.hoursMinutes', { hours, minutes });
  };

  const validatePrice = (): boolean => {
    if (price.priceType !== 'NOT_KNOWN' && price.priceType !== 'FREE') {
      if (price.priceTotal == null || price.priceTotal <= 0) return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!game.id) return;
    if (!validatePrice()) {
      toast.error(t('createGame.priceRequired', { defaultValue: 'Price must be greater than 0 for this price type' }));
      return;
    }

    setIsSaving(true);
    try {
      if (general.pendingAvatar) {
        await mediaApi.uploadGameAvatar(game.id, general.pendingAvatar.avatar, general.pendingAvatar.original);
      }

      const updateData: Partial<Game> = {
        name: general.name.trim() || null,
        description: general.description.trim() || null,
        clubId: where.clubId || undefined,
        courtId: where.courtId || '',
        hasBookedCourt: where.courtId ? where.hasBookedCourt : false,
        priceType: price.priceType,
      };

      if (general.removeAvatar) {
        updateData.avatar = null;
        updateData.originalAvatar = null;
      }

      if (price.priceType === 'NOT_KNOWN' || price.priceType === 'FREE') {
        updateData.priceTotal = null;
        updateData.priceCurrency = null;
      } else {
        if (price.priceTotal != null) updateData.priceTotal = price.priceTotal;
        if (price.priceCurrency != null) updateData.priceCurrency = price.priceCurrency;
      }

      if (where.clubId && whenSelectedTime) {
        const club = clubs.find((c) => c.id === where.clubId);
        const startTime = createDateFromClubTime(whenSelectedDate, whenSelectedTime, club);
        const endTime = addHours(startTime, whenDuration);
        updateData.startTime = startTime.toISOString();
        updateData.endTime = endTime.toISOString();
        updateData.timeIsSet = true;
      }

      await gamesApi.update(game.id, updateData);

      if (where.clubId && where.clubId !== game.clubId) {
        const res = await courtsApi.getByClubId(where.clubId);
        onCourtsChange?.(res.data);
      }

      const response = await gamesApi.getById(game.id);
      onGameUpdate?.(response.data);
      toast.success(t('gameDetails.settingsUpdated'));
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'errors.generic';
      toast.error(t(msg, { defaultValue: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="edit-game-info-modal">
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('common.edit')}</DialogTitle>
          <SegmentedSwitch
            tabs={TABS.map((tab) => ({ id: tab.id, label: t(`gameDetails.editTab.${tab.id}`), icon: tab.icon }))}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as EditGameInfoTabId)}
            titleInActiveOnly={true}
            layoutId="edit-game-info-tabs"
          />
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
          {activeTab === 'general' && (
            <GeneralTab
              game={game}
              state={general}
              onChange={(patch) => setGeneral((s) => ({ ...s, ...patch }))}
              avatarPreviewUrl={avatarPreviewUrl}
            />
          )}
          {activeTab === 'when' && (
            <div className="-mx-4">
              <WhenTab
              game={game}
              clubs={clubs}
              clubId={where.clubId}
              selectedDate={whenSelectedDate}
              selectedTime={whenSelectedTime}
              duration={whenDuration}
              showPastTimes={whenShowPastTimes}
              showDatePicker={whenShowDatePicker}
              onDateChange={(d) => {
                setWhenSelectedDate(d);
                setHookDate(d);
              }}
              onTimeChange={(t) => {
                setWhenSelectedTime(t);
                setHookTime(t);
              }}
              onDurationChange={(d) => {
                setWhenDuration(d);
                setHookDuration(d);
              }}
              onShowDatePickerChange={setWhenShowDatePicker}
              onShowPastTimesChange={(v) => {
                setWhenShowPastTimes(v);
                setHookShowPastTimes(v);
              }}
              generateTimeOptions={generateTimeOptions}
              generateTimeOptionsForDate={generateTimeOptionsForDate}
              canAccommodateDuration={canAccommodateDuration}
              getAdjustedStartTime={getAdjustedStartTime}
              getTimeSlotsForDuration={getTimeSlotsForDuration}
              isSlotHighlighted={isSlotHighlighted}
              getDurationLabel={getDurationLabel}
            />
            </div>
          )}
          {activeTab === 'where' && (
            <WhereTab
              game={game}
              clubs={clubs}
              courts={modalCourts}
              state={where}
              onChange={(patch) => setWhere((s) => ({ ...s, ...patch }))}
              isLoadingCourts={isLoadingCourts}
            />
          )}
          {activeTab === 'price' && (
            <PriceTab state={price} onChange={(patch) => setPrice((s) => ({ ...s, ...patch }))} />
          )}
        </div>
        <DialogFooter className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
