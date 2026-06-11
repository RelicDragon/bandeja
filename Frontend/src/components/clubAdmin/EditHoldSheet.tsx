import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CourtSlotHold, CourtSlotHoldLabel } from '@/api/clubAdmin';

const LABELS: CourtSlotHoldLabel[] = ['WALK_IN', 'PHONE', 'ACADEMY', 'MAINTENANCE', 'OTHER'];

interface EditHoldSheetProps {
  open: boolean;
  hold: CourtSlotHold | null;
  onClose: () => void;
  onSubmit: (holdId: string, data: { label: CourtSlotHoldLabel; note?: string }) => Promise<void>;
}

export function EditHoldSheet({ open, hold, onClose, onSubmit }: EditHoldSheetProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState<CourtSlotHoldLabel>('WALK_IN');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hold) {
      setLabel(hold.label);
      setNote(hold.note ?? '');
    }
  }, [hold]);

  if (!open || !hold) return null;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(hold.id, { label, note: note || undefined });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end bg-black/45 p-3" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">{t('clubAdmin.editHold')}</h2>
        <div className="mt-3 space-y-3">
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
            value={label}
            onChange={(e) => setLabel(e.target.value as CourtSlotHoldLabel)}
          >
            {LABELS.map((l) => (
              <option key={l} value={l}>
                {t(`clubAdmin.label.${l}`)}
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('clubAdmin.noteOptional')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <button type="button" className="btn-primary w-full" disabled={saving} onClick={handleSubmit}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
