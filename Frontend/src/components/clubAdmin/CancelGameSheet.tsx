import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildClubAdminDmPreview } from '@/utils/clubAdmin/cancelMessage';

export interface CancelPreviewParams {
  mode: 'cancel' | 'clear';
  hostFirstName: string | null;
  clubName: string;
  date: string;
  time: string;
}

interface CancelGameSheetProps {
  open: boolean;
  onClose: () => void;
  mode: 'cancel' | 'clear';
  previewParams: CancelPreviewParams | null;
  onSubmit: (body: { reason: string; note?: string; message: string }) => Promise<void>;
}

export function CancelGameSheet({ open, onClose, mode, previewParams, onSubmit }: CancelGameSheetProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setNote('');
    setMessage('');
  }, [open, mode]);

  useEffect(() => {
    if (!open || !previewParams) return;
    setMessage(
      buildClubAdminDmPreview({
        ...previewParams,
        mode,
        reason: reason || '…',
        note,
      })
    );
  }, [open, previewParams, mode, reason, note]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ reason: reason.trim(), note: note.trim() || undefined, message: message.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cap-keyboard-aware-overlay fixed inset-0 z-[75] flex items-end bg-black/45 p-3" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">
          {mode === 'cancel' ? t('clubAdmin.cancelGame') : t('clubAdmin.clearCourt')}
        </h2>
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            placeholder={t('clubAdmin.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('clubAdmin.noteOptional')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-muted-foreground">{t('clubAdmin.messagePreview')}</p>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <button type="button" className="btn-primary w-full" disabled={saving} onClick={() => void handleSubmit()}>
            {t('clubAdmin.confirmCancelNotify')}
          </button>
        </div>
      </div>
    </div>
  );
}
