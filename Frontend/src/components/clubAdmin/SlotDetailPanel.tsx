import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScheduleSlot } from '@/api/clubAdmin';

export interface SlotDetailPanelProps {
  slot: ScheduleSlot | null;
  freeSlot?: { courtId: string; time: string } | null;
  onClose: () => void;
  onBlock?: () => void;
  onCancel?: () => void;
  onClearCourt?: () => void;
  onMessageHost?: () => void;
  onReleaseHold?: () => void;
  onEditHold?: () => void;
  readOnly?: boolean;
}

export function SlotDetailPanel({
  slot,
  freeSlot,
  onClose,
  onBlock,
  onCancel,
  onClearCourt,
  onMessageHost,
  onReleaseHold,
  onEditHold,
  readOnly,
}: SlotDetailPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const title = slot
    ? slot.type === 'hold'
      ? t('clubAdmin.holdTitle')
      : slot.type === 'external'
        ? t('clubAdmin.externalTitle')
        : slot.name || t('clubAdmin.gameTitle')
    : t('clubAdmin.freeSlot');

  const isGame = slot?.type === 'game' || slot?.type === 'game_court';

  return (
    <>
      <h2 className="text-lg font-semibold">{title}</h2>
      {readOnly && (
        <p className="mt-2 text-xs text-muted-foreground">{t('clubAdmin.pastSlotViewOnly')}</p>
      )}
      <div className="mt-3 space-y-3">
        {freeSlot && !slot && !readOnly && onBlock && (
          <button type="button" className="btn-primary w-full" onClick={onBlock}>
            {t('clubAdmin.blockThirdParty')}
          </button>
        )}

        {isGame && slot && (
          <>
            <p className="text-sm text-muted-foreground">
              {slot.host.firstName} {slot.host.lastName} · {slot.participantCount}{' '}
              {t('clubAdmin.participants')}
            </p>
            <p className="text-sm">
              {slot.hasBookedCourt ? t('clubAdmin.confirmed') : t('clubAdmin.planned')}
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => navigate(`/games/${slot.gameId}`)}
            >
              {t('clubAdmin.openGame')}
            </button>
            {!readOnly && onMessageHost && (
              <button type="button" className="btn-secondary w-full" onClick={onMessageHost}>
                {t('clubAdmin.messageHost')}
              </button>
            )}
            {!readOnly && !slot.hasBookedCourt && onClearCourt && (
              <button type="button" className="btn-secondary w-full" onClick={onClearCourt}>
                {t('clubAdmin.clearCourt')}
              </button>
            )}
            {!readOnly && onCancel && (
              <button type="button" className="btn-secondary w-full" onClick={onCancel}>
                {t('clubAdmin.cancelAndNotify')}
              </button>
            )}
          </>
        )}

        {slot?.type === 'external' && (
          <p className="text-sm text-muted-foreground">{t('clubAdmin.externalViewOnly')}</p>
        )}

        {slot?.type === 'hold' && (
          <>
            <p className="text-sm">{slot.label}</p>
            {slot.note && <p className="text-sm text-muted-foreground">{slot.note}</p>}
            {!readOnly && onEditHold && (
              <button type="button" className="btn-secondary w-full" onClick={onEditHold}>
                {t('clubAdmin.editHold')}
              </button>
            )}
            {!readOnly && onReleaseHold && (
              <button type="button" className="btn-secondary w-full" onClick={onReleaseHold}>
                {t('clubAdmin.releaseHold')}
              </button>
            )}
          </>
        )}
      </div>
      <button type="button" className="mt-4 w-full text-sm text-muted-foreground" onClick={onClose}>
        {t('common.close')}
      </button>
    </>
  );
}
