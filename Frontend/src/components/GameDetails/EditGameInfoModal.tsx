import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { addHours } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Save, Edit3, CalendarClock, Banknote, Loader2, Settings, Users } from 'lucide-react';
import { Game, Club, Court, PriceType, PriceCurrency } from '@/types';
import { gamesApi, courtsApi, clubsApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import toast from 'react-hot-toast';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { identityKey, useStableIdentity } from '@/hooks/useStableIdentity';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { GeneralTab, type GeneralTabState } from './editGameInfo/GeneralTab';
import { LocationTimeTab } from './editGameInfo/LocationTimeTab';
import type { WhereTabState } from './editGameInfo/locationTimeTypes';
import {
  buildEditLocationTimeRequests,
  currentCourtSlotCount,
  initialCourtIds,
  saveEditLocationTime,
} from './editGameInfo/saveEditLocationTime';
import { PriceTab, type PriceTabState } from './editGameInfo/PriceTab';
import { resolvePaymentMethods } from '@shared/payments/paymentMethodSelection';
import {
  buildGameEditPricePayload,
  cleanPaymentMethods,
  isPaidPriceType,
} from '@/features/cost/gameEditPricePayload';
import { useCityCountryQuery } from '@/queries/useCityCountryQuery';
import { GameSettings } from './GameSettings';
import { createDateFromClubTime, useGameTimeDuration } from '@/hooks/useGameTimeDuration';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { checkBookingOverlap, fetchBookedCourtsForDay } from '@/utils/bookedCourts/overlapCheck';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { SeriesScopeSheet } from '@/features/game-series/SeriesScopeSheet';
import { courtMatchesSportFilter } from '@/utils/courtSport';
import {
  courtClashDetails,
  describeCourtClash,
  linkedCourtIds,
  rescheduleNeeded,
} from '@/components/GameDetails/courts/gameCourtsModel';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import { WeatherPreviewCard } from '@/components/weather/WeatherPreviewCard';
import { ClubPoliciesBlock } from '@/components/createGame/ClubPoliciesBlock';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { createClubTimeFormatter } from '@/features/court-reservations/clubTime';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { entitySupportsParticipantSetup } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { authoredGameTextForEdit } from '@/utils/gameText/authoredGameTextForEdit';
export type EditGameInfoTabId = 'general' | 'locationTime' | 'price' | 'participants' | 'settings';
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
  onClubsChange?: (clubs: Club[]) => void;
  /**
   * Games whose time can affect reservations move through the reschedule
   * planner on the game page; the Location & time tab hands off to it.
   */
  onRequestReschedule?: () => void;
}

const TABS = [
  { id: 'general' as const, icon: Edit3 },
  { id: 'locationTime' as const, icon: CalendarClock },
  { id: 'price' as const, icon: Banknote },
  { id: 'participants' as const, icon: Users },
  { id: 'settings' as const, icon: Settings },
];

function getInitialGeneralState(game: Game): GeneralTabState {
  const authored = authoredGameTextForEdit(game);
  return {
    name: authored.name,
    description: authored.description,
    pendingAvatar: null,
    removeAvatar: false,
  };
}

function getInitialWhereState(game: Game): WhereTabState {
  return {
    clubId: game.clubId || '',
    courtId: game.courtId || '',
  };
}

function getInitialPriceState(game: Game, userCurrency: PriceCurrency): PriceTabState {
  return {
    priceType: (game.priceType as PriceType) || 'NOT_KNOWN',
    priceTotal: game.priceTotal,
    priceCurrency: game.priceCurrency ?? userCurrency,
    inputValue: game.priceTotal != null ? String(game.priceTotal) : '',
    // PRD 348 — falls back to the legacy free-text hint for a game written
    // before the catalogue, so opening Edit never silently clears it.
    paymentMethods: resolvePaymentMethods(game.paymentMethods, game.paymentHint),
  };
}

export const EditGameInfoModal = ({
  isOpen,
  onClose,
  game,
  clubs: clubsProp,
  courts,
  initialTab: initialTabProp = 'general',
  canEditSettings = true,
  onGameUpdate,
  onCourtsChange,
  onClubsChange,
  onRequestReschedule,
}: EditGameInfoModalProps) => {
  const { t } = useTranslation();
  // The shell refetches clubs/courts while the drawer is open and hands back
  // equal-but-fresh arrays. Everything keyed on a club object (booking auth,
  // company meta, snapshots, time options) resets on that identity change, so
  // the drawer re-renders and blinks. Pin the reference while data is equal.
  const clubs = useStableIdentity(clubsProp);
  const user = useAuthStore((s) => s.user);
  const userCurrency = resolveUserCurrency(user?.defaultCurrency);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const canEditParticipants =
    canEditSettings && Boolean(onGameUpdate) && entitySupportsParticipantSetup(game.entityType);

  const initialTab: EditGameInfoTabId =
    initialTabProp === 'where' || initialTabProp === 'when' ? 'locationTime' : initialTabProp;
  const [activeTab, setActiveTab] = useState<EditGameInfoTabId>(initialTab);
  /** PRD 345 — non-null while the "Apply to" sheet is open after a save. */
  const [seriesScopePatch, setSeriesScopePatch] = useState<Record<string, unknown> | null>(null);
  const [general, setGeneral] = useState<GeneralTabState>(() => getInitialGeneralState(game));
  const [where, setWhere] = useState<WhereTabState>(() => getInitialWhereState(game));
  const [venueCityId, setVenueCityId] = useState(
    () => game.city?.id || game.club?.cityId || '',
  );

  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;

  useEffect(() => {
    if (!isOpen || !venueCityId) return;
    let cancelled = false;
    void clubsApi
      .getByCityId(venueCityId, game.entityType)
      .then((res) => {
        if (cancelled || !res.success) return;
        const next = res.data ?? [];
        // The shell already loaded this city; re-publishing an equal list only
        // re-renders the page under the drawer and churns club identities.
        if (identityKey(next) === identityKey(clubsRef.current)) return;
        onClubsChange?.(next);
      })
      .catch(() => {
        /* keep current clubs */
      });
    return () => {
      cancelled = true;
    };
  }, [game.entityType, isOpen, onClubsChange, venueCityId]);
  const [price, setPrice] = useState<PriceTabState>(() => getInitialPriceState(game, userCurrency));
  // PRD 348 — the picker offers the rails that exist where the game is played.
  const paymentCountryIso2 = useCityCountryQuery(venueCityId);
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
  const courtsRef = useRef(courts);
  courtsRef.current = courts;
  const [_isLoadingCourts, setIsLoadingCourts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [softOverlapOpen, setSoftOverlapOpen] = useState(false);
  const [showConfirmRemoveTime, setShowConfirmRemoveTime] = useState(false);
  /** Soft overlap gate: a planned game (`soft`) or another game's reserved court (`reserved`). */
  const [overlapKind, setOverlapKind] = useState<'soft' | 'reserved'>('soft');
  const [courtCount, setCourtCount] = useState<number>(() => currentCourtSlotCount(game));
  const initialCourtIdsKey = useMemo(() => initialCourtIds(game).join(','), [game]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [participantsDirty, setParticipantsDirty] = useState(false);
  const [participantsSaving, setParticipantsSaving] = useState(false);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(() => initialCourtIds(game));
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const locationTimePanelRef = useRef<HTMLDivElement>(null);

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
    const tabs = TABS.filter((tab) => {
      if (tab.id === 'settings') return canEditSettings && Boolean(onGameUpdate);
      if (tab.id === 'participants') return canEditParticipants;
      return true;
    });
    return tabs.map((tab) => ({ id: tab.id, label: t(`gameDetails.editTab.${tab.id}`), icon: tab.icon }));
  }, [canEditParticipants, canEditSettings, onGameUpdate, t]);

  const handleSettingsGameUpdate = useCallback(
    (updated: Game) => {
      onGameUpdate?.(updated);
    },
    [onGameUpdate],
  );

  useEffect(() => {
    const activeTabUnavailable =
      (activeTab === 'settings' && (!canEditSettings || !onGameUpdate)) ||
      (activeTab === 'participants' && !canEditParticipants);
    if (activeTabUnavailable) {
      setActiveTab('general');
    }
  }, [activeTab, canEditParticipants, canEditSettings, onGameUpdate]);

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
        (tab === 'settings' && (!canEditSettings || !onGameUpdate)) ||
        (tab === 'participants' && !canEditParticipants)
          ? 'general'
          : tab;
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
      setSelectedCourtIds(initialCourtIds(openGame));
      setCourtCount(currentCourtSlotCount(openGame));
      setShowDiscardConfirm(false);
      setParticipantsDirty(false);
      setParticipantsSaving(false);
      setTimeout(() => setDisableWhenAutoAdjust(false), 200);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, canEditParticipants, canEditSettings, onGameUpdate, setHookDate, setHookTime, setHookDuration]);

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
        const nextKey = identityKey(res.data);
        setModalCourts((prev) => (identityKey(prev) === nextKey ? prev : res.data));
        if (nextKey !== identityKey(courtsRef.current)) onCourtsChange?.(res.data);
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
  const showClubPoliciesFooter =
    game.entityType !== 'BAR' &&
    Boolean(selectedClubData) &&
    Boolean(selectedClubData?.policyText?.trim() || selectedClubData?.cancellationNoticeHours);
  const slotModel = supportsClubBookingFlow(game.entityType, 'edit') && Boolean(where.clubId);
  const clubChanged = where.clubId !== (game.clubId || '');
  const lockedCourtIds = useMemo(() => (clubChanged ? new Set<string>() : linkedCourtIds(game)), [clubChanged, game]);
  const clubLocked = (game.linkedBookings ?? []).length > 0;
  const timeManagedByPlanner = !clubChanged && rescheduleNeeded(game);

  const handleEditCourtToggle = useCallback(
    (id: string) => {
      if (!slotModel) {
        const next = id === 'notBooked' ? [] : [id];
        setSelectedCourtIds(next);
        setWhere((s) => ({ ...s, courtId: next[0] ?? '' }));
        return;
      }
      if (lockedCourtIds.has(id)) return;
      setSelectedCourtIds((prev) => {
        const next = prev.includes(id) ? prev.filter((courtId) => courtId !== id) : [...prev, id];
        setWhere((s) => ({ ...s, courtId: next[0] ?? '' }));
        setCourtCount((count) => Math.max(count, next.length, 1));
        return next;
      });
    },
    [slotModel, lockedCourtIds],
  );

  const handleEditCourtIdsSync = useCallback((ids: string[]) => {
    setSelectedCourtIds(ids);
    setWhere((s) => ({ ...s, courtId: ids[0] ?? '' }));
    setCourtCount((count) => Math.max(count, ids.length, 1));
  }, []);

  /** The new window from the plain time editor (never for planner-managed games). */
  const editedWindow = useMemo(() => {
    if (timeManagedByPlanner || !whenSelectedTime || !whenDuration) return null;
    const start = createDateFromClubTime(whenSelectedDate, whenSelectedTime, selectedClubData);
    return { startTime: start.toISOString(), endTime: addHours(start, whenDuration).toISOString() };
  }, [timeManagedByPlanner, whenSelectedDate, whenSelectedTime, whenDuration, selectedClubData]);

  const initialGeneral = useMemo(() => getInitialGeneralState(game), [game]);
  const initialPrice = useMemo(() => getInitialPriceState(game, userCurrency), [game, userCurrency]);
  const generalDirty =
    general.name !== initialGeneral.name ||
    general.description !== initialGeneral.description ||
    general.pendingAvatar != null ||
    general.removeAvatar;
  const priceIsPaid = isPaidPriceType(price.priceType);
  const priceDirty =
    price.priceType !== initialPrice.priceType ||
    (priceIsPaid &&
      ((price.priceTotal ?? null) !== (initialPrice.priceTotal ?? null) ||
        (price.priceCurrency ?? null) !== (initialPrice.priceCurrency ?? null) ||
        JSON.stringify(cleanPaymentMethods(price.paymentMethods)) !==
          JSON.stringify(cleanPaymentMethods(initialPrice.paymentMethods))));
  const scheduleDirty =
    clubChanged ||
    selectedCourtIds.join(',') !== initialCourtIdsKey ||
    (slotModel && courtCount !== currentCourtSlotCount(game)) ||
    (!timeManagedByPlanner &&
      (whenSelectedTime !== whenInitialValues.initialTime ||
        whenDuration !== whenInitialValues.initialDuration ||
        whenSelectedDate.toDateString() !== whenInitialValues.initialDate.toDateString()));
  const isDirty = generalDirty || priceDirty || scheduleDirty || participantsDirty;

  const handleRequestClose = useCallback(() => {
    if (isSaving || participantsSaving) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isSaving, participantsSaving, isDirty, onClose]);

  useBackButtonModal(isOpen, handleRequestClose, 'edit-game-info-modal');

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
    if (!where.clubId || !editedWindow || selectedCourtIds.length === 0) return true;
    const scheduleUnchanged =
      !clubChanged &&
      selectedCourtIds.join(',') === initialCourtIdsKey &&
      whenSelectedTime === whenInitialValues.initialTime &&
      whenDuration === whenInitialValues.initialDuration &&
      whenSelectedDate.toDateString() === whenInitialValues.initialDate.toDateString();
    if (scheduleUnchanged) return true;

    const club = clubs.find((c) => c.id === where.clubId);
    try {
      const courtIds = new Set(selectedCourtIds);
      const bookings = (
        await fetchBookedCourtsForDay({ clubId: where.clubId, selectedDate: whenSelectedDate, club })
      ).filter((b) => b.courtId != null && courtIds.has(b.courtId));
      const overlap = checkBookingOverlap(bookings, whenSelectedTime, whenDuration, club, { excludeGameId: game.id });
      if (overlap.reservedGameCount > 0 || overlap.hasSoftOverlap) {
        setOverlapKind(overlap.reservedGameCount > 0 ? 'reserved' : 'soft');
        setSoftOverlapOpen(true);
        return false;
      }
    } catch {
      /* proceed: the server's clash guard still answers */
    }
    return true;
  };

  const handleSave = async () => {
    if (!game.id) return;
    if (participantsDirty) {
      setActiveTab('participants');
      toast(t('gameDetails.editModal.saveParticipantsFirst'));
      return;
    }
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

      await executeSave();
    } catch {
      setIsSaving(false);
    }
  };

  const executeSave = async () => {
    if (!game.id) return;

    setIsSaving(true);
    try {
      if (general.pendingAvatar) {
        await mediaApi.uploadGameAvatar(game.id, general.pendingAvatar.avatar, general.pendingAvatar.original);
      }

      const updateData: Partial<Game> = {
        name: general.name.trim() || null,
        description: general.description.trim() || null,
        // PRD 348 — `paymentMethods` is sent only when the organizer changed it:
        // the seed can be missing from a game object the socket delivered, and
        // writing it back unconditionally deleted saved IBANs.
        ...buildGameEditPricePayload(price, initialPrice),
      };

      if (general.removeAvatar) {
        updateData.avatar = null;
        updateData.originalAvatar = null;
      }

      await gamesApi.update(game.id, updateData);

      if (scheduleDirty) {
        await saveEditLocationTime(
          game.id,
          buildEditLocationTimeRequests({
            game,
            clubId: where.clubId,
            courtIds: selectedCourtIds,
            slotModel,
            courtSlotCount: slotModel ? courtCount : null,
            time: editedWindow,
          }),
        );
      }

      if (where.clubId && where.clubId !== game.clubId) {
        const res = await courtsApi.getByClubId(where.clubId, { sport: game.sport });
        onCourtsChange?.(res.data);
      }

      const response = await gamesApi.getById(game.id);
      onGameUpdate?.(response.data);
      toast.success(t('gameDetails.settingsUpdated'));
      // PRD 345 — an occurrence of a series asks where the edit applies before
      // it closes. The edit itself is already saved on THIS game; the sheet only
      // offers to push the same fields onto future occurrences.
      if (isGameSeriesEnabled() && game.seriesId) {
        setSeriesScopePatch({ ...updateData } as Record<string, unknown>);
        return;
      }
      onClose();
    } catch (err: unknown) {
      const clash = courtClashDetails(err);
      if (clash) {
        const clock = createClubTimeFormatter({
          timeZone: getClubTimezone(game) ?? selectedClubData?.city?.timezone ?? 'UTC',
          locale: displaySettings.locale,
          hour12: displaySettings.hour12,
        });
        const message = describeCourtClash(clash, (id) => modalCourts.find((c) => c.id === id)?.name, clock.time);
        toast.error(t(message.key, message.params));
        setActiveTab('locationTime');
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
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleRequestClose();
      }}
    >
      <DrawerContent
        className="!mt-10 !max-h-[min(94dvh,960px,var(--overlay-pinned-max-height))] flex h-[min(94dvh,960px,var(--overlay-pinned-max-height))] flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby="edit-game-info-modal-title"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" aria-hidden />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id="edit-game-info-modal-title"
            className="min-w-0 flex-1 text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {t('gameDetails.editModal.title')}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>
        <div className="flex shrink-0 justify-center px-4 pb-3">
          <SegmentedSwitch
            tabs={segmentedTabs}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as EditGameInfoTabId)}
            showOnlyActiveTabText={true}
            activeLabelMaxWidth={200}
            layoutId="edit-game-info-tabs"
            disabled={isSaving || participantsSaving}
          />
        </div>
        <div
          ref={contentScrollRef}
          className={`min-h-0 flex-1 px-4 py-3 ${
            activeTab === 'general' || activeTab === 'participants'
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto'
          }`}
        >
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
                onSelectClub={(id, club) => {
                  if (club) {
                    onClubsChange?.(clubs.some((c) => c.id === club.id)
                      ? clubs.map((c) => c.id === club.id ? club : c)
                      : [...clubs, club]);
                  }
                  if (club?.cityId) setVenueCityId(club.cityId);
                  setWhere((s) => ({ ...s, clubId: id, courtId: '' }));
                  setSelectedCourtIds([]);
                }}
                onVenueCityChange={(id) => {
                  if (id === venueCityId) return;
                  setVenueCityId(id);
                  setWhere((s) => ({ ...s, clubId: '', courtId: '' }));
                  setSelectedCourtIds([]);
                }}
                venueCityId={venueCityId}
                slotModel={slotModel}
                onToggleCourt={handleEditCourtToggle}
                onSetCourtIds={handleEditCourtIdsSync}
                lockedCourtIds={lockedCourtIds}
                courtCount={Math.max(courtCount, selectedCourtIds.length, 1)}
                onCourtCountChange={(count) => setCourtCount(Math.max(count, selectedCourtIds.length, 1))}
                clubLocked={clubLocked}
                timeManagedByPlanner={timeManagedByPlanner}
                onRequestReschedule={
                  onRequestReschedule
                    ? () => {
                        if (isDirty) {
                          toast(t('gameDetails.courts.saveFirst'));
                          return;
                        }
                        onRequestReschedule();
                      }
                    : undefined
                }
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
                generateTimeOptions={generateTimeOptions}
                generateTimeOptionsForDate={generateTimeOptionsForDate}
                canAccommodateDuration={canAccommodateDuration}
                getAdjustedStartTime={getAdjustedStartTime}
                getTimeSlotsForDuration={getTimeSlotsForDuration}
                isSlotHighlighted={isSlotHighlighted}
                dateInputRef={{ current: null }}
                panelRef={locationTimePanelRef}
              />
              {showClubPoliciesFooter || weatherPreviewTiming ? (
                <div className="space-y-3">
                  {showClubPoliciesFooter && selectedClubData ? (
                    <ClubPoliciesBlock club={selectedClubData} entityType={game.entityType} />
                  ) : null}
                  {weatherPreviewTiming ? (
                    <WeatherPreviewCard
                      cityId={weatherPreviewTiming.cityId}
                      startTime={weatherPreviewTiming.startTime}
                      endTime={weatherPreviewTiming.endTime}
                      enabled={game.entityType !== 'BAR'}
                      locale={displaySettings.locale}
                      hour12={displaySettings.hour12}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {activeTab === 'price' && (
            <PriceTab
              state={price}
              onChange={(patch) => setPrice((s) => ({ ...s, ...patch }))}
              maxParticipants={game.maxParticipants}
              countryIso2={paymentCountryIso2}
            />
          )}
          {canEditParticipants ? (
            <div
              className={
                activeTab === 'participants'
                  ? 'flex min-h-0 flex-1 flex-col'
                  : 'hidden'
              }
            >
              <EditMaxParticipantsModal
                isOpen={isOpen}
                game={game}
                presentation="embedded"
                closeOnSave={false}
                onClose={handleRequestClose}
                onUpdate={handleSettingsGameUpdate}
                onKickUser={async (userId) => {
                  await gamesApi.kickUser(game.id, userId);
                }}
                onDirtyChange={setParticipantsDirty}
                onSavingChange={setParticipantsSaving}
              />
            </div>
          ) : null}
          {activeTab === 'settings' && onGameUpdate && canEditSettings && (
            <GameSettings
              game={game}
              canEdit={canEditSettings}
              embedded
              onGameUpdate={handleSettingsGameUpdate}
            />
          )}
        </div>
        {activeTab !== 'settings' && activeTab !== 'participants' ? (
        <div className="mt-auto flex shrink-0 items-center gap-3 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] dark:border-gray-800">
          <span
            aria-live="polite"
            className={`flex-1 min-w-0 truncate text-xs transition-opacity duration-200 ${
              isDirty && !isSaving
                ? 'text-amber-600 dark:text-amber-400 opacity-100'
                : 'opacity-0'
            }`}
          >
            {t('gameDetails.editModal.unsavedChanges')}
          </span>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={isSaving}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            aria-busy={isSaving}
            className="flex items-center justify-center gap-2 min-w-[6.5rem] px-5 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 size={18} className="animate-spin shrink-0" aria-hidden />
            ) : (
              <Save size={18} className="shrink-0" aria-hidden />
            )}
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
        ) : activeTab === 'settings' ? (
          <div className="mt-auto flex shrink-0 items-center gap-3 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] dark:border-gray-800">
            <span className="flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
              {t('gameDetails.editModal.autoSaveNote')}
            </span>
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>

    <ConfirmationModal
      isOpen={showDiscardConfirm}
      onClose={() => setShowDiscardConfirm(false)}
      onConfirm={() => {
        setShowDiscardConfirm(false);
        onClose();
      }}
      title={t('gameDetails.editModal.discardTitle')}
      message={t('gameDetails.editModal.discardMessage')}
      confirmText={t('gameDetails.editModal.discardConfirm')}
      cancelText={t('gameDetails.editModal.keepEditing')}
      confirmVariant="danger"
    />

    <ConfirmationModal
      isOpen={softOverlapOpen}
      tone="warning"
      title={t('createGame.overlapSoftTitle')}
      message={t(overlapKind === 'reserved' ? 'gameDetails.courts.overlapReserved' : 'createGame.overlapSoftMessage')}
      confirmText={t('createGame.overlapSoftProceed')}
      cancelText={t('common.cancel')}
      onConfirm={() => {
        setSoftOverlapOpen(false);
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

    {seriesScopePatch && game.seriesId ? (
      <SeriesScopeSheet
        open
        seriesId={game.seriesId}
        templatePatch={seriesScopePatch}
        entityType={game.entityType}
        onDone={() => {
          setSeriesScopePatch(null);
          onClose();
        }}
      />
    ) : null}
    </>
  );
};
