import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { addHours, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Save, Edit3, CalendarClock, Banknote, Loader2, Settings } from 'lucide-react';
import { Game, Club, Court, PriceType, PriceCurrency } from '@/types';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import { gamesApi, courtsApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { GeneralTab, type GeneralTabState } from './editGameInfo/GeneralTab';
import { LocationTimeTab } from './editGameInfo/LocationTimeTab';
import type { WhereTabState } from './editGameInfo/locationTimeTypes';
import {
  isLocationTimePartialSaveError,
} from '@/components/gameLocationTime/locationTimeSaveErrors';
import {
  saveLocationTime,
  buildEditLocationTimeSaveDraft,
} from '@/components/gameLocationTime/useSaveGameLocationTime';
import {
  areEditLocationTimeDraftsEqual,
  type EditLocationTimeDraft,
} from '@/components/gameLocationTime/locationTimeDraft';
import { PriceTab, type PriceTabState } from './editGameInfo/PriceTab';
import { GameSettings } from './GameSettings';
import { createDateFromClubTime, useGameTimeDuration } from '@/hooks/useGameTimeDuration';
import { useBooktimeTimeOptions } from '@/hooks/useBooktimeTimeOptions';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { checkBookingOverlap, fetchBookedCourtsForDay } from '@/utils/bookedCourts/overlapCheck';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { clubHasBookingIntegration, parseBooktimeIntegrationConfig } from '@shared/clubIntegration';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeCompanyMeta } from '@/hooks/useBooktimeCompanyMeta';
import { useBooktimeSnapshotRefresh } from '@/hooks/useBooktimeSnapshotRefresh';
import { BooktimeCreateGameConfirmModal } from '@/components/createGame/BooktimeCreateGameConfirmModal';
import { BooktimeConnectInline } from '@/components/booktime/BooktimeConnectInline';
import type { BooktimeIntegrationConfig } from '@/components/booktime/ConnectClubSheet';
import { computePendingBookingUnlinks } from '@/components/gameLocationTime/computePendingBookingUnlinks';
import { shouldUseBooktimeTimeOptions } from '@/hooks/createGameBookingFlow/shouldUseBooktimeTimeOptions';
import { courtMatchesSportFilter } from '@/utils/courtSport';
import { computeMaxSelectableCourts } from '@/utils/requiredCourtCount';
import { WeatherPreviewCard } from '@/components/weather/WeatherPreviewCard';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
export type EditGameInfoTabId = 'general' | 'locationTime' | 'price' | 'settings';
export type EditGameInfoInitialTabId = EditGameInfoTabId | 'where' | 'when';

interface EditGameInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  clubs: Club[];
  courts: Court[];
  initialTab?: EditGameInfoInitialTabId;
  /** Owner/admin with results still open — mirrors shell `canViewSettings`. */
  canEditSettings?: boolean;
  onGameUpdate?: (game: Game) => void;
  onCourtsChange?: (courts: Court[]) => void;
}

const TABS = [
  { id: 'general' as const, icon: Edit3 },
  { id: 'locationTime' as const, icon: CalendarClock },
  { id: 'price' as const, icon: Banknote },
  { id: 'settings' as const, icon: Settings },
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
  initialTab: initialTabProp = 'general',
  canEditSettings = true,
  onGameUpdate,
  onCourtsChange,
}: EditGameInfoModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userCurrency = resolveUserCurrency(user?.defaultCurrency);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const initialTab: EditGameInfoTabId =
    initialTabProp === 'where' || initialTabProp === 'when' ? 'locationTime' : initialTabProp;
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
  const [whenShowDatePicker, setWhenShowDatePicker] = useState(false);
  const [disableWhenAutoAdjust, setDisableWhenAutoAdjust] = useState(true);
  const [modalCourts, setModalCourts] = useState<Court[]>(courts);
  const [_isLoadingCourts, setIsLoadingCourts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [softOverlapOpen, setSoftOverlapOpen] = useState(false);
  const [showConfirmRemoveTime, setShowConfirmRemoveTime] = useState(false);
  const [pendingRemoveBookingIds, setPendingRemoveBookingIds] = useState<string[]>([]);
  const [locationTimeDraft, setLocationTimeDraft] = useState<EditLocationTimeDraft | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [showConfirmUnlinkSave, setShowConfirmUnlinkSave] = useState(false);
  const initialLinkedBookingIds = useMemo(
    () => game.linkedBookings?.map((b) => b.externalBookingId) ?? [],
    [game.linkedBookings],
  );
  const hasLocationTimeDraft = locationTimeDraft != null;
  const pendingUnlinkIds = useMemo(
    () =>
      computePendingBookingUnlinks(
        initialLinkedBookingIds,
        pendingRemoveBookingIds,
        locationTimeDraft?.selectedBookingIds ?? initialLinkedBookingIds,
        hasLocationTimeDraft &&
          (locationTimeDraft?.locationTimeMode === 'bookings' || initialLinkedBookingIds.length > 0),
      ),
    [
      initialLinkedBookingIds,
      pendingRemoveBookingIds,
      hasLocationTimeDraft,
      locationTimeDraft?.selectedBookingIds,
      locationTimeDraft?.locationTimeMode,
    ],
  );
  const handleLocationTimeDraftChange = useCallback((draft: EditLocationTimeDraft) => {
    setLocationTimeDraft((prev) => (areEditLocationTimeDraftsEqual(prev, draft) ? prev : draft));
  }, []);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(() =>
    game.gameCourts?.map((gc) => gc.courtId) ?? (game.courtId ? [game.courtId] : []),
  );
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

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

  const openInitRef = useRef({
    initialTab,
    game,
    userCurrency,
    courts,
    whenInitialValues,
  });
  openInitRef.current = { initialTab, game, userCurrency, courts, whenInitialValues };

  const segmentedTabs = useMemo(() => {
    const tabs = canEditSettings && onGameUpdate ? TABS : TABS.filter((tab) => tab.id !== 'settings');
    return tabs.map((tab) => ({ id: tab.id, label: t(`gameDetails.editTab.${tab.id}`), icon: tab.icon }));
  }, [canEditSettings, onGameUpdate, t]);

  const handleSettingsGameUpdate = useCallback(
    (updated: Game) => {
      onGameUpdate?.(updated);
    },
    [onGameUpdate],
  );

  useEffect(() => {
    if (activeTab === 'settings' && (!canEditSettings || !onGameUpdate)) {
      setActiveTab('general');
    }
  }, [activeTab, canEditSettings, onGameUpdate]);

  const {
    selectedDate: hookDate,
    setSelectedDate: setHookDate,
    selectedTime: hookTime,
    setSelectedTime: setHookTime,
    duration: hookDuration,
    setDuration: setHookDuration,
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
    disableAutoAdjust: disableWhenAutoAdjust,
  });

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const {
        initialTab: tab,
        game: openGame,
        userCurrency: currency,
        courts: courtsList,
        whenInitialValues: when,
      } = openInitRef.current;
      const resolvedTab =
        tab === 'settings' && (!canEditSettings || !onGameUpdate) ? 'general' : tab;
      setActiveTab(resolvedTab);
      setGeneral(getInitialGeneralState(openGame));
      setWhere(getInitialWhereState(openGame));
      setPrice(getInitialPriceState(openGame, currency));
      setWhenSelectedDate(when.initialDate);
      setWhenSelectedTime(when.initialTime);
      setWhenDuration(when.initialDuration);
      setHookDate(when.initialDate);
      setHookTime(when.initialTime);
      setHookDuration(when.initialDuration);
      setDisableWhenAutoAdjust(true);
      setModalCourts(
        openGame.clubId && courtsList.length > 0 && courtsList[0]?.clubId === openGame.clubId
          ? courtsList
          : [],
      );
      setSelectedCourtIds(
        openGame.gameCourts?.map((gc) => gc.courtId) ?? (openGame.courtId ? [openGame.courtId] : []),
      );
      setPendingRemoveBookingIds([]);
      setLocationTimeDraft(null);
      setConfirmModalOpen(false);
      setShowConfirmUnlinkSave(false);
      setTimeout(() => setDisableWhenAutoAdjust(false), 200);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, canEditSettings, onGameUpdate, setHookDate, setHookTime, setHookDuration]);

  useEffect(() => {
    if (!disableWhenAutoAdjust) {
      setWhenSelectedDate(hookDate);
      setWhenSelectedTime(hookTime);
      setWhenDuration(hookDuration);
    }
  }, [disableWhenAutoAdjust, hookDate, hookTime, hookDuration]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

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
      .getByClubId(where.clubId, { sport: game.sport })
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
  }, [isOpen, where.clubId, game.sport, onCourtsChange]);

  useEffect(() => {
    if (!isOpen || modalCourts.length === 0) return;
    setSelectedCourtIds((prev) => {
      const filtered = prev.filter((id) => {
        const court = modalCourts.find((c) => c.id === id);
        return !court || courtMatchesSportFilter(court, game.sport);
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [isOpen, modalCourts, game.sport]);

  useEffect(() => {
    if (!isOpen) return;
    setWhere((s) => {
      if (!s.courtId || selectedCourtIds.includes(s.courtId)) return s;
      return { ...s, courtId: selectedCourtIds[0] ?? '' };
    });
  }, [isOpen, selectedCourtIds]);

  const selectedClubData = clubs.find((c) => c.id === where.clubId);
  const weatherPreviewTiming = useMemo(() => {
    if (!selectedClubData?.cityId || !whenSelectedTime) return null;
    const start = createDateFromClubTime(whenSelectedDate, whenSelectedTime, selectedClubData);
    const end = addHours(start, whenDuration);
    return {
      cityId: selectedClubData.cityId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }, [selectedClubData, whenDuration, whenSelectedDate, whenSelectedTime]);
  const clubBookingFlowActive =
    supportsClubBookingFlow(game.entityType, 'edit') && clubHasBookingIntegration(selectedClubData);
  const willBookOnEdit =
    locationTimeDraft?.willBookOnCreate === true &&
    (locationTimeDraft.integratedCourtIds.length ?? 0) > 0;
  const bookingsModeActive = locationTimeDraft?.locationTimeMode === 'bookings';
  const booktimeIntegrationConfig = useMemo((): BooktimeIntegrationConfig | null => {
    if (!selectedClubData || !clubHasBookingIntegration(selectedClubData)) return null;
    return parseBooktimeIntegrationConfig(selectedClubData.integrationConfig);
  }, [selectedClubData]);
  const { status: booktimeAuth, refresh: refreshBooktimeAuth } = useBooktimeClubAuth(
    where.clubId || undefined,
    clubBookingFlowActive && Boolean(booktimeIntegrationConfig),
  );
  const needsBooktimeAuth = Boolean(
    willBookOnEdit && clubBookingFlowActive && !booktimeAuth?.connected,
  );
  const booktimeScheduleConstrained = willBookOnEdit && !needsBooktimeAuth;
  const booktimeCompanyMeta = useBooktimeCompanyMeta(
    selectedClubData,
    (willBookOnEdit || bookingsModeActive) && clubBookingFlowActive && !needsBooktimeAuth,
  );
  const snapshotRefreshEnabled =
    isOpen &&
    (willBookOnEdit || bookingsModeActive || confirmModalOpen) &&
    clubBookingFlowActive &&
    Boolean(booktimeIntegrationConfig) &&
    !needsBooktimeAuth;
  const {
    refreshSnapshot,
    lastFetchedAt: snapshotLastFetchedAt,
    snapshotBanner,
    isRefreshingSnapshot,
  } = useBooktimeSnapshotRefresh(
      selectedClubData,
      whenSelectedDate,
      snapshotRefreshEnabled,
    );
  const snapshotBlocked =
    snapshotBanner === 'noSyncToday' ||
    (snapshotBanner === 'scoutPoolEmpty' && !snapshotLastFetchedAt);
  const booktimeTimeOptions = useBooktimeTimeOptions({
    club: selectedClubData,
    courts: modalCourts,
    selectedDate: whenSelectedDate,
    durationHours: whenDuration,
    selectedCourtId: where.courtId || selectedCourtIds[0] || null,
    enabled: shouldUseBooktimeTimeOptions({
      entityType: game.entityType,
      clubHasBookingIntegration: clubHasBookingIntegration(selectedClubData),
      needsBooktimeAuth,
      locationTimeMode: locationTimeDraft?.locationTimeMode,
      willBookOnCreate: willBookOnEdit,
      booktimeConnected: Boolean(booktimeAuth?.connected),
    }) && isOpen,
  });
  const resolvedGenerateTimeOptions = booktimeTimeOptions.active
    ? booktimeTimeOptions.generateTimeOptions
    : generateTimeOptions;
  const resolvedGenerateTimeOptionsForDate = booktimeTimeOptions.active
    ? booktimeTimeOptions.generateTimeOptionsForDate
    : generateTimeOptionsForDate;
  const resolvedCanAccommodateDuration = booktimeTimeOptions.active
    ? booktimeTimeOptions.canAccommodateDuration
    : canAccommodateDuration;
  const resolvedGetAdjustedStartTime = booktimeTimeOptions.active
    ? booktimeTimeOptions.getAdjustedStartTime
    : getAdjustedStartTime;
  const resolvedGetTimeSlotsForDuration = booktimeTimeOptions.active
    ? booktimeTimeOptions.getTimeSlotsForDuration
    : getTimeSlotsForDuration;
  const resolvedIsSlotHighlighted = booktimeTimeOptions.active
    ? (time: string) => booktimeTimeOptions.isSlotHighlighted(time, whenSelectedTime, whenDuration)
    : isSlotHighlighted;
  const { clampDate: clampBooktimeDate, fixedDates: booktimeFixedDates } = booktimeCompanyMeta;

  useEffect(() => {
    if (!booktimeScheduleConstrained || !booktimeFixedDates?.length) return;
    const clamped = clampBooktimeDate(whenSelectedDate);
    if (format(clamped, 'yyyy-MM-dd') !== format(whenSelectedDate, 'yyyy-MM-dd')) {
      setWhenSelectedDate(clamped);
      setHookDate(clamped);
      setWhenSelectedTime('');
      setHookTime('');
    }
  }, [
    booktimeScheduleConstrained,
    booktimeFixedDates,
    clampBooktimeDate,
    whenSelectedDate,
    setHookDate,
    setHookTime,
  ]);
  const multiCourtMode = game.maxParticipants > 4;

  const handleEditCourtSelect = useCallback(
    (id: string) => {
      setWhenSelectedTime('');
      setHookTime('');

      if (id === 'notBooked') {
        setSelectedCourtIds([]);
        setWhere((s) => ({ ...s, courtId: '' }));
        return;
      }
      if (!multiCourtMode) {
        setSelectedCourtIds([id]);
        setWhere((s) => ({ ...s, courtId: id }));
        return;
      }
      setSelectedCourtIds((prev) => {
        const existing = prev.indexOf(id);
        const next = existing >= 0 ? prev.filter((courtId) => courtId !== id) : [...prev, id];
        const max = computeMaxSelectableCourts(game.maxParticipants, modalCourts.length);
        const capped = next.length > max ? next.slice(0, max) : next;
        setWhere((s) => ({ ...s, courtId: capped[0] ?? '' }));
        return capped;
      });
    },
    [multiCourtMode, game.maxParticipants, modalCourts.length, setHookTime],
  );

  const handleEditCourtIdsSync = useCallback((ids: string[]) => {
    setSelectedCourtIds(ids);
    setWhere((s) => ({ ...s, courtId: ids[0] ?? '' }));
  }, []);

  const integratedCourtsForConfirm = useMemo(
    () =>
      (locationTimeDraft?.integratedCourtIds ?? [])
        .map((id) => modalCourts.find((c) => c.id === id))
        .filter((court): court is Court => court != null),
    [locationTimeDraft?.integratedCourtIds, modalCourts],
  );

  const editSnapshotOverlayEnabled =
    (willBookOnEdit || bookingsModeActive) &&
    !needsBooktimeAuth &&
    selectedClubData?.integrationType === 'BOOKTIME';

  const handleRemoveTime = async () => {
    if (!game.id) return;
    setIsSaving(true);
    try {
      await gamesApi.update(game.id, { timeIsSet: false });
      const response = await gamesApi.getById(game.id);
      onGameUpdate?.(response.data);
      toast.success(t('gameDetails.timeRemoved'));
      setShowConfirmRemoveTime(false);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'errors.generic';
      toast.error(t(msg, { defaultValue: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  const validatePrice = (): boolean => {
    if (price.priceType !== 'NOT_KNOWN' && price.priceType !== 'FREE') {
      if (price.priceTotal == null || price.priceTotal <= 0) return false;
    }
    return true;
  };

  const runBookingOverlapGate = async (): Promise<boolean> => {
    if (willBookOnEdit || locationTimeDraft?.locationTimeMode === 'bookings') return true;
    if (!where.clubId || !whenSelectedTime || !whenDuration) return true;

    const scheduleUnchanged =
      where.clubId === (game.clubId || '') &&
      (where.courtId || '') === (game.courtId || '') &&
      whenSelectedTime === whenInitialValues.initialTime &&
      whenDuration === whenInitialValues.initialDuration &&
      whenSelectedDate.toDateString() === whenInitialValues.initialDate.toDateString();
    if (scheduleUnchanged) return true;

    const club = clubs.find((c) => c.id === where.clubId);
    try {
      const bookings = await fetchBookedCourtsForDay({
        clubId: where.clubId,
        selectedDate: whenSelectedDate,
        courtId: where.courtId || undefined,
        club,
      });
      const overlap = checkBookingOverlap(bookings, whenSelectedTime, whenDuration, club);
      if (overlap.hasSoftOverlap) {
        setSoftOverlapOpen(true);
        return false;
      }
    } catch {
      /* proceed */
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
      const overlapOk = await runBookingOverlapGate();
      if (!overlapOk) {
        setIsSaving(false);
        return;
      }

      if (pendingUnlinkIds.length > 0) {
        setIsSaving(false);
        setShowConfirmUnlinkSave(true);
        return;
      }

      if (willBookOnEdit) {
        if (needsBooktimeAuth) {
          await executeSave();
          return;
        }
        await refreshSnapshot({ force: true });
        setIsSaving(false);
        setConfirmModalOpen(true);
        return;
      }

      await executeSave();
    } catch {
      setIsSaving(false);
    }
  };

  const proceedAfterUnlinkConfirm = async () => {
    setShowConfirmUnlinkSave(false);
    setIsSaving(true);
    try {
      if (willBookOnEdit) {
        if (needsBooktimeAuth) {
          await executeSave();
          return;
        }
        await refreshSnapshot({ force: true });
        setIsSaving(false);
        setConfirmModalOpen(true);
        return;
      }
      await executeSave();
    } catch {
      setIsSaving(false);
    }
  };

  const executeSave = async (bookingOverrides?: {
    externalBookingIds: string[];
    bookingSnapshots: BookingSnapshotInput[];
  }) => {
    if (!game.id) return;

    setIsSaving(true);
    try {
      if (general.pendingAvatar) {
        await mediaApi.uploadGameAvatar(game.id, general.pendingAvatar.avatar, general.pendingAvatar.original);
      }

      const updateData: Partial<Game> = {
        name: general.name.trim() || null,
        description: general.description.trim() || null,
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

      await gamesApi.update(game.id, updateData);

      const club = clubs.find((c) => c.id === where.clubId);
      if (snapshotRefreshEnabled && bookingOverrides) {
        await refreshSnapshot({ force: true });
      }

      const locationDraft = buildEditLocationTimeSaveDraft({
        game,
        clubId: where.clubId,
        courtId: where.courtId,
        selectedCourtIds,
        whenSelectedDate,
        whenSelectedTime,
        whenDuration,
        hasBookedCourt: where.hasBookedCourt,
        club,
        courts: modalCourts,
        pendingRemoveBookingIds,
        locationTimeDraft,
        bookingOverrides,
      });

      const hasLocationChanges =
        locationDraft.addBookingIds.length > 0 ||
        locationDraft.removeBookingIds.length > 0 ||
        Boolean(locationDraft.linkBookingContext?.adds.length) ||
        locationDraft.clubId !== (game.clubId || undefined) ||
        locationDraft.courtId !== (game.courtId || undefined) ||
        locationDraft.startTime !== game.startTime ||
        locationDraft.endTime !== game.endTime ||
        locationDraft.timeOverride !== (game.timeOverride ?? false) ||
        locationDraft.hasBookedCourt !== (game.hasBookedCourt ?? false) ||
        Boolean(locationDraft.snapshots?.length) ||
        Boolean(locationDraft.courtIds?.length);

      if (hasLocationChanges) {
        await saveLocationTime(game.id, locationDraft);
      } else if (selectedCourtIds.length > 0) {
        const initialCourtIds =
          game.gameCourts?.map((gc) => gc.courtId) ?? (game.courtId ? [game.courtId] : []);
        if (selectedCourtIds.join(',') !== initialCourtIds.join(',')) {
          await saveLocationTime(game.id, { ...locationDraft, addBookingIds: [], removeBookingIds: [] });
        }
      }

      if (where.clubId && where.clubId !== game.clubId) {
        const res = await courtsApi.getByClubId(where.clubId, { sport: game.sport });
        onCourtsChange?.(res.data);
      }

      const response = await gamesApi.getById(game.id);
      onGameUpdate?.(response.data);
      toast.success(t('gameDetails.settingsUpdated'));
      setConfirmModalOpen(false);
      onClose();
    } catch (err: unknown) {
      if (isLocationTimePartialSaveError(err)) {
        if (err.completedSteps.length > 0) {
          try {
            const response = await gamesApi.getById(game.id);
            onGameUpdate?.(response.data);
          } catch {
            /* best effort refresh */
          }
        }
        toast.error(
          t('gameDetails.locationTime.partialSaveFailed', {
            step: t(`gameDetails.locationTime.saveStep.${err.failedStep}`),
          }),
        );
        return;
      }
      const axiosErr = err as {
        response?: { data?: { message?: string; externalBookingId?: string } };
      };
      const data = axiosErr.response?.data;
      const msg = data?.message || 'errors.generic';
      const interpolation =
        typeof data?.externalBookingId === 'string' && data.externalBookingId.trim()
          ? { externalBookingId: data.externalBookingId.trim() }
          : undefined;
      toast.error(t(msg, { ...interpolation, defaultValue: msg }));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <Dialog open={isOpen} onClose={onClose} modalId="edit-game-info-modal">
      <DialogContent className="max-w-[480px]">
        <DialogHeader className="flex-col items-start gap-3 pt-10 pr-10">
          <DialogTitle className="sr-only">{t('common.edit')}</DialogTitle>
          <SegmentedSwitch
            tabs={segmentedTabs}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as EditGameInfoTabId)}
            showOnlyActiveTabText={true}
            activeLabelMaxWidth={200}
            layoutId="edit-game-info-tabs"
            disabled={isSaving}
            className="w-fit max-w-full"
          />
        </DialogHeader>
        <div ref={contentScrollRef} className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
          {activeTab === 'general' && (
            <GeneralTab
              game={game}
              state={general}
              onChange={(patch) => setGeneral((s) => ({ ...s, ...patch }))}
              avatarPreviewUrl={avatarPreviewUrl}
            />
          )}
          {activeTab === 'locationTime' && (
            <div className="space-y-4">
              <LocationTimeTab
                game={game}
                entityType={game.entityType}
                clubs={clubs}
                courts={modalCourts}
                selectedClub={where.clubId}
                selectedCourtIds={selectedCourtIds}
                selectedCourt={where.courtId || selectedCourtIds[0] || 'notBooked'}
                hasBookedCourt={where.hasBookedCourt}
                onSelectClub={(id) => {
                  setWhere((s) => ({ ...s, clubId: id, courtId: '' }));
                  setSelectedCourtIds([]);
                }}
                onSelectCourt={handleEditCourtSelect}
                onSelectCourtIds={handleEditCourtIdsSync}
                onToggleHasBookedCourt={(checked) => setWhere((s) => ({ ...s, hasBookedCourt: checked }))}
                selectedDate={whenSelectedDate}
                selectedTime={whenSelectedTime}
                duration={whenDuration}
                showDatePicker={whenShowDatePicker}
                onDateChange={(d) => {
                  setWhenSelectedDate(d);
                  setHookDate(d);
                }}
                onTimeChange={(timeValue) => {
                  setWhenSelectedTime(timeValue);
                  setHookTime(timeValue);
                }}
                onDurationChange={(d) => {
                  setWhenDuration(d);
                  setHookDuration(d);
                }}
                onShowDatePickerChange={setWhenShowDatePicker}
                generateTimeOptions={resolvedGenerateTimeOptions}
                generateTimeOptionsForDate={resolvedGenerateTimeOptionsForDate}
                canAccommodateDuration={resolvedCanAccommodateDuration}
                getAdjustedStartTime={resolvedGetAdjustedStartTime}
                getTimeSlotsForDuration={resolvedGetTimeSlotsForDuration}
                isSlotHighlighted={resolvedIsSlotHighlighted}
                dateInputRef={{ current: null }}
                pendingRemoveBookingIds={pendingRemoveBookingIds}
                onDraftChange={handleLocationTimeDraftChange}
                clubBookingFlowActive={clubBookingFlowActive}
                booktimeCompanyId={booktimeIntegrationConfig?.companyId ?? null}
                booktimeConnected={Boolean(booktimeAuth?.connected)}
                snapshotOverlayEnabled={editSnapshotOverlayEnabled}
                snapshotLoading={isRefreshingSnapshot}
                snapshotBannerState={snapshotBanner}
                willBookOnCreate={booktimeScheduleConstrained}
                needsBooktimeAuth={needsBooktimeAuth}
                booktimeFixedDates={booktimeScheduleConstrained ? booktimeFixedDates : undefined}
                slotsLoading={booktimeTimeOptions.active && booktimeTimeOptions.loading}
                booktimeSlotsActive={booktimeTimeOptions.active}
                connectedPhone={booktimeAuth?.phoneNumber ?? null}
                bookableDaysHint={booktimeScheduleConstrained ? booktimeCompanyMeta.bookableDays : null}
                renderAuthGateSection={({ collapsed, onSkip, onCollapsedClick }) =>
                  selectedClubData && booktimeIntegrationConfig ? (
                    <BooktimeConnectInline
                      club={selectedClubData}
                      integrationConfig={booktimeIntegrationConfig}
                      onConnected={() => void refreshBooktimeAuth()}
                      onSkip={onSkip}
                      collapsed={collapsed}
                      onCollapsedClick={onCollapsedClick}
                    />
                  ) : null
                }
              />
              <WeatherPreviewCard
                cityId={weatherPreviewTiming?.cityId}
                startTime={weatherPreviewTiming?.startTime}
                endTime={weatherPreviewTiming?.endTime}
                enabled={game.entityType !== 'BAR'}
                locale={displaySettings.locale}
                hour12={displaySettings.hour12}
              />
            </div>
          )}
          {activeTab === 'price' && (
            <PriceTab state={price} onChange={(patch) => setPrice((s) => ({ ...s, ...patch }))} />
          )}
          {activeTab === 'settings' && onGameUpdate && canEditSettings && (
            <GameSettings
              game={game}
              canEdit={canEditSettings}
              embedded
              onGameUpdate={handleSettingsGameUpdate}
            />
          )}
        </div>
        {activeTab !== 'settings' ? (
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
            aria-busy={isSaving}
            className="flex items-center justify-center gap-2 min-w-[6.5rem] px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 size={18} className="animate-spin shrink-0" aria-hidden />
            ) : (
              <Save size={18} className="shrink-0" aria-hidden />
            )}
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </DialogFooter>
        ) : (
          <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <ConfirmationModal
      isOpen={softOverlapOpen}
      tone="warning"
      title={t('createGame.overlapSoftTitle')}
      message={t('createGame.overlapSoftMessage')}
      confirmText={t('createGame.overlapSoftProceed')}
      cancelText={t('common.cancel')}
      onConfirm={() => {
        setSoftOverlapOpen(false);
        if (pendingUnlinkIds.length > 0) {
          setShowConfirmUnlinkSave(true);
          return;
        }
        void executeSave();
      }}
      onClose={() => setSoftOverlapOpen(false)}
    />

    <ConfirmationModal
      isOpen={showConfirmRemoveTime}
      onClose={() => setShowConfirmRemoveTime(false)}
      onConfirm={() => void handleRemoveTime()}
      title={t('gameDetails.removeTime')}
      message={t('gameDetails.removeTimeConfirmation')}
      confirmText={isSaving ? t('common.removing') : t('common.remove')}
      cancelText={t('common.cancel')}
      confirmVariant="danger"
    />

    <ConfirmationModal
      isOpen={showConfirmUnlinkSave}
      onClose={() => setShowConfirmUnlinkSave(false)}
      onConfirm={() => void proceedAfterUnlinkConfirm()}
      title={t('gameDetails.locationTime.unlinkSaveConfirmTitle')}
      message={t('gameDetails.locationTime.unlinkSaveConfirmMessage', { count: pendingUnlinkIds.length })}
      confirmText={isSaving ? t('common.saving') : t('common.save')}
      cancelText={t('common.cancel')}
      confirmVariant="danger"
    />

    {selectedClubData && booktimeIntegrationConfig && confirmModalOpen ? (
      <BooktimeCreateGameConfirmModal
        open={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
        club={selectedClubData}
        companyId={booktimeIntegrationConfig.companyId}
        bookings={integratedCourtsForConfirm.map((court) => ({
          court,
          date: whenSelectedDate,
          startTime: whenSelectedTime,
          durationMinutes: Math.round(whenDuration * 60),
        }))}
        phoneNumber={booktimeAuth?.phoneNumber ?? null}
        firstName={booktimeAuth?.firstName ?? null}
        lastName={booktimeAuth?.lastName ?? null}
        allowedHoursToCancel={booktimeCompanyMeta.allowedHoursToCancel}
        currency={booktimeCompanyMeta.currency}
        sport={game.sport}
        summaryChips={[]}
        bookFlowContext={{
          refreshSnapshot,
          lastFetchedAt: snapshotLastFetchedAt,
        }}
        snapshotBlocked={snapshotBlocked}
        onExecuteCreateGame={async (overrides) => {
          await executeSave({
            externalBookingIds: overrides.externalBookingIds,
            bookingSnapshots: overrides.bookingSnapshots,
          });
        }}
        onSlotTaken={() => {
          setWhenSelectedTime('');
          setHookTime('');
          booktimeTimeOptions.reload();
        }}
        onSuccess={() => {
          setConfirmModalOpen(false);
        }}
        flowMode="edit"
      />
    ) : null}
    </>
  );
};
