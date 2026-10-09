import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Edit3, Banknote, CalendarClock, Loader2, Settings, Users } from 'lucide-react';
import type { Club, Court, Game, PriceType, PriceCurrency } from '@/types';
import { gamesApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import toast from 'react-hot-toast';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { GeneralTab, type GeneralTabState } from './editGameInfo/GeneralTab';
import { PriceTab, type PriceTabState } from './editGameInfo/PriceTab';
import { buildGameEditPricePayload, isPaidPriceType } from '@/features/cost/gameEditPricePayload';
import { GameSettings } from './GameSettings';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { SeriesScopeSheet } from '@/features/game-series/SeriesScopeSheet';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { entitySupportsParticipantSetup } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { authoredGameTextForEdit } from '@/utils/gameText/authoredGameTextForEdit';
import { useWhenWhereEditor } from './schedule/useWhenWhereEditor';
export type EditGameInfoTabId = 'whenWhere' | 'general' | 'price' | 'participants' | 'settings';
export type EditGameInfoInitialTabId = EditGameInfoTabId;

/**
 * The game's one Edit dialog: When and where (club, date, time, courts and
 * their bookings), General, Price, Participants, Settings. Save saves every
 * tab with changes (Participants saves on its own; Settings auto-saves).
 */
interface EditGameInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  initialTab?: EditGameInfoInitialTabId;
  /** Bumped by the page to re-apply `initialTab` while the dialog is open. */
  focusKey?: number;
  /** Owner/admin with results still open — mirrors shell `canViewSettings`. */
  canEditSettings?: boolean;
  onGameUpdate?: (game: Game) => void;
  clubs?: Club[];
  courts?: Court[];
  onCourtsChange?: (courts: Court[]) => void;
  onClubsChange?: (clubs: Club[]) => void;
}

const NO_CLUBS: Club[] = [];
const NO_COURTS: Court[] = [];

const TABS = [
  { id: 'general' as const, icon: Edit3 },
  { id: 'whenWhere' as const, icon: CalendarClock },
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
  initialTab = 'general',
  focusKey = 0,
  canEditSettings = true,
  onGameUpdate,
  clubs = NO_CLUBS,
  courts = NO_COURTS,
  onCourtsChange,
  onClubsChange,
}: EditGameInfoModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userCurrency = resolveUserCurrency(user?.defaultCurrency);
  const canEditParticipants =
    canEditSettings && Boolean(onGameUpdate) && entitySupportsParticipantSetup(game.entityType);

  const [activeTab, setActiveTab] = useState<EditGameInfoTabId>(initialTab);
  /** PRD 345 — non-null while the "Apply to" sheet is open after a save. */
  const [seriesScopePatch, setSeriesScopePatch] = useState<Record<string, unknown> | null>(null);
  const [general, setGeneral] = useState<GeneralTabState>(() => getInitialGeneralState(game));
  const [price, setPrice] = useState<PriceTabState>(() => getInitialPriceState(game, userCurrency));
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [participantsDirty, setParticipantsDirty] = useState(false);
  const [participantsSaving, setParticipantsSaving] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const prevIsOpenRef = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const openInitRef = useRef({ initialTab, game, userCurrency });
  openInitRef.current = { initialTab, game, userCurrency };

  const segmentedTabs = useMemo(() => {
    const tabs = TABS.filter((tab) => {
      if (tab.id === 'settings') return canEditSettings && Boolean(onGameUpdate);
      if (tab.id === 'participants') return canEditParticipants;
      return true;
    });
    return tabs.map((tab) => ({
      id: tab.id,
      label: tab.id === 'whenWhere' ? t('gameDetails.whenWhere.title') : t(`gameDetails.editTab.${tab.id}`),
      icon: tab.icon,
    }));
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

  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const { initialTab: tab, game: openGame, userCurrency: currency } = openInitRef.current;
      const resolvedTab =
        (tab === 'settings' && (!canEditSettings || !onGameUpdate)) ||
        (tab === 'participants' && !canEditParticipants)
          ? 'general'
          : tab;
      setActiveTab(resolvedTab);
      setGeneral(getInitialGeneralState(openGame));
      setPrice(getInitialPriceState(openGame, currency));
      setShowDiscardConfirm(false);
      setParticipantsDirty(false);
      setParticipantsSaving(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, canEditParticipants, canEditSettings, onGameUpdate]);

  // The page asked for a tab / part while the dialog is already open (a court sheet's "Set date and time").
  const lastFocusKey = useRef(focusKey);
  useEffect(() => {
    if (!isOpen || focusKey === lastFocusKey.current) return;
    lastFocusKey.current = focusKey;
    setActiveTab(initialTab);
  }, [isOpen, focusKey, initialTab]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const handleWhenWhereUpdate = useCallback((updated: Game) => onGameUpdate?.(updated), [onGameUpdate]);
  const whenWhere = useWhenWhereEditor({
    open: isOpen,
    active: activeTab === 'whenWhere',
    focusKey,
    scrollRef: contentScrollRef,
    onActivate: () => setActiveTab('whenWhere'),
    onClose,
    game,
    clubs,
    courts,
    canClear: canEditSettings,
    onGameUpdate: handleWhenWhereUpdate,
    onCourtsChange,
    onClubsChange,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (general.pendingAvatar) {
      const url = URL.createObjectURL(general.pendingAvatar.avatar);
      setAvatarPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAvatarPreviewUrl(null);
  }, [isOpen, general.pendingAvatar]);

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
        (price.priceCurrency ?? null) !== (initialPrice.priceCurrency ?? null)));
  const infoDirty = generalDirty || priceDirty;
  const isDirty = infoDirty || participantsDirty || (whenWhere.isDirty && !whenWhere.showRun);
  const saving = isSaving || whenWhere.isSaving;

  const handleRequestClose = useCallback(() => {
    if (isSaving || participantsSaving || whenWhere.isSaving || whenWhere.locked) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isSaving, participantsSaving, whenWhere.isSaving, whenWhere.locked, isDirty, onClose]);

  useBackButtonModal(isOpen, handleRequestClose, 'edit-game-info-modal');

  const validatePrice = (): boolean => {
    if (price.priceType !== 'NOT_KNOWN' && price.priceType !== 'FREE') {
      if (price.priceTotal == null || price.priceTotal <= 0) return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!game.id || saving) return;
    if (participantsDirty) {
      setActiveTab('participants');
      toast(t('gameDetails.editModal.saveParticipantsFirst'));
      return;
    }
    if (infoDirty && !validatePrice()) {
      setActiveTab('price');
      toast.error(t('createGame.priceRequired', { defaultValue: 'Price must be greater than 0 for this price type' }));
      return;
    }

    let infoPatch: Record<string, unknown> | null = null;
    if (infoDirty) {
      infoPatch = await saveInfo();
      if (!infoPatch) return;
    }
    if (whenWhere.isDirty) {
      // Stopped (a busy court to answer), running (club changes on screen) or failed: stay open.
      const result = await whenWhere.save();
      if (result !== 'saved') return;
    }
    toast.success(t('gameDetails.settingsUpdated'));
    // PRD 345 — an occurrence of a series asks where the name / price edit
    // applies before it closes. The edit itself is already saved on THIS game;
    // the sheet only offers to push the same fields onto future occurrences.
    if (infoPatch && isGameSeriesEnabled() && game.seriesId) {
      setSeriesScopePatch(infoPatch);
      return;
    }
    onClose();
  };

  /** General + Price → `PUT /games/:id`. The patch on success, `null` on failure. */
  const saveInfo = async (): Promise<Record<string, unknown> | null> => {
    setIsSaving(true);
    try {
      if (general.pendingAvatar) {
        await mediaApi.uploadGameAvatar(game.id, general.pendingAvatar.avatar, general.pendingAvatar.original);
      }

      const updateData: Partial<Game> = {
        name: general.name.trim() || null,
        description: general.description.trim() || null,
        ...buildGameEditPricePayload(price),
      };

      if (general.removeAvatar) {
        updateData.avatar = null;
        updateData.originalAvatar = null;
      }

      await gamesApi.update(game.id, updateData);

      const response = await gamesApi.getById(game.id);
      onGameUpdate?.(response.data);
      setGeneral(getInitialGeneralState(response.data));
      setPrice(getInitialPriceState(response.data, userCurrency));
      return { ...updateData } as Record<string, unknown>;
    } catch (err: unknown) {
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
      return null;
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
      dismissible={!whenWhere.locked}
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
            {whenWhere.runTitle ?? t('gameDetails.editModal.title')}
          </h2>
          {whenWhere.locked ? null : <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />}
        </div>
        <div className="flex shrink-0 justify-center px-4 pb-3">
          <SegmentedSwitch
            tabs={segmentedTabs}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as EditGameInfoTabId)}
            showOnlyActiveTabText={true}
            activeLabelMaxWidth={200}
            layoutId="edit-game-info-tabs"
            disabled={saving || participantsSaving || whenWhere.showRun}
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
          {activeTab === 'whenWhere' && whenWhere.body}
          {activeTab === 'general' && (
            <GeneralTab
              game={game}
              state={general}
              onChange={(patch) => setGeneral((s) => ({ ...s, ...patch }))}
              avatarPreviewUrl={avatarPreviewUrl}
            />
          )}
          {activeTab === 'price' && (
            <PriceTab
              state={price}
              onChange={(patch) => setPrice((s) => ({ ...s, ...patch }))}
              maxParticipants={game.maxParticipants}
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
        {activeTab === 'whenWhere' && whenWhere.showRun ? (
          <div className="mt-auto shrink-0 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] dark:border-gray-800">
            {whenWhere.runFooter}
          </div>
        ) : activeTab !== 'settings' && activeTab !== 'participants' ? (
        <div className="mt-auto flex shrink-0 items-center gap-3 border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] dark:border-gray-800">
          <span
            aria-live="polite"
            className={`flex-1 min-w-0 truncate text-xs transition-opacity duration-200 ${
              isDirty && !saving
                ? 'text-amber-600 dark:text-amber-400 opacity-100'
                : 'opacity-0'
            }`}
          >
            {t('gameDetails.editModal.unsavedChanges')}
          </span>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isDirty || (whenWhere.isDirty && !whenWhere.canSave)}
            aria-busy={saving}
            data-testid="edit-game-save"
            className="flex items-center justify-center gap-2 min-w-[6.5rem] max-w-[60%] px-5 py-2.5 text-sm font-semibold bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin shrink-0" aria-hidden />
            ) : (
              <Save size={18} className="shrink-0" aria-hidden />
            )}
            <span className="truncate">
              {saving ? t('common.saving') : (whenWhere.isDirty && whenWhere.saveLabel) || t('common.save')}
            </span>
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

    {whenWhere.dialogs}

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
