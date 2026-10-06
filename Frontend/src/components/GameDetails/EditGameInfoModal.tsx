import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Edit3, Banknote, Loader2, Settings, Users } from 'lucide-react';
import { Game, PriceType, PriceCurrency } from '@/types';
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
import { resolvePaymentMethods } from '@shared/payments/paymentMethodSelection';
import {
  buildGameEditPricePayload,
  cleanPaymentMethods,
  isPaidPriceType,
} from '@/features/cost/gameEditPricePayload';
import { useCityCountryQuery } from '@/queries/useCityCountryQuery';
import { GameSettings } from './GameSettings';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { SeriesScopeSheet } from '@/features/game-series/SeriesScopeSheet';
import { EditMaxParticipantsModal } from '@/components/EditMaxParticipantsModal';
import { entitySupportsParticipantSetup } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { authoredGameTextForEdit } from '@/utils/gameText/authoredGameTextForEdit';
export type EditGameInfoTabId = 'general' | 'price' | 'participants' | 'settings';
export type EditGameInfoInitialTabId = EditGameInfoTabId;

interface EditGameInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  initialTab?: EditGameInfoInitialTabId;
  /** Owner/admin with results still open — mirrors shell `canViewSettings`. */
  canEditSettings?: boolean;
  onGameUpdate?: (game: Game) => void;
}

const TABS = [
  { id: 'general' as const, icon: Edit3 },
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
    // PRD 348 — falls back to the legacy free-text hint for a game written
    // before the catalogue, so opening Edit never silently clears it.
    paymentMethods: resolvePaymentMethods(game.paymentMethods, game.paymentHint),
  };
}

export const EditGameInfoModal = ({
  isOpen,
  onClose,
  game,
  initialTab = 'general',
  canEditSettings = true,
  onGameUpdate,
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
  const venueCityId = game.city?.id || game.club?.cityId || '';
  const [price, setPrice] = useState<PriceTabState>(() => getInitialPriceState(game, userCurrency));
  // PRD 348 — the picker offers the rails that exist where the game is played.
  const paymentCountryIso2 = useCityCountryQuery(venueCityId);
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
  const isDirty = generalDirty || priceDirty || participantsDirty;

  const handleRequestClose = useCallback(() => {
    if (isSaving || participantsSaving) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isSaving, participantsSaving, isDirty, onClose]);

  useBackButtonModal(isOpen, handleRequestClose, 'edit-game-info-modal');

  const validatePrice = (): boolean => {
    if (price.priceType !== 'NOT_KNOWN' && price.priceType !== 'FREE') {
      if (price.priceTotal == null || price.priceTotal <= 0) return false;
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

    await executeSave();
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
