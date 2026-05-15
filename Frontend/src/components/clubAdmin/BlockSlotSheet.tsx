import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CourtSlotHoldLabel } from '@/api/clubAdmin';
const LABELS: CourtSlotHoldLabel[] = ['WALK_IN', 'PHONE', 'ACADEMY', 'MAINTENANCE', 'OTHER'];

interface BlockSlotSheetProps {
  open: boolean;
  onClose: () => void;
  courtId: string;
  date: string;
  startTime: string;
  onSubmit: (data: {
    courtId: string;
    startTime: string;
    endTime: string;
    label: CourtSlotHoldLabel;
    note?: string;
  }) => Promise<void>;
}

export function BlockSlotSheet({ open, onClose, courtId, date, startTime, onSubmit }: BlockSlotSheetProps) {
  const { t } = useTranslation();
  const [durationHours, setDurationHours] = useState(1);
  const [label, setLabel] = useState<CourtSlotHoldLabel>('WALK_IN');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    const [h, m] = startTime.split(':').map(Number);
    const start = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    setSaving(true);
    try {
      await onSubmit({
        courtId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        label,
        note: note || undefined,
      });
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
        <h2 className="text-lg font-semibold">{t('clubAdmin.blockThirdParty')}</h2>
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            {[1, 1.5, 2].map((d) => (
              <button
                key={d}
                type="button"
                className={`flex-1 rounded-lg border px-2 py-2 text-sm ${durationHours === d ? 'border-primary bg-primary/10' : ''}`}
                onClick={() => setDurationHours(d)}
              >
                {d}h
              </button>
            ))}
          </div>
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
            {t('clubAdmin.blockSlot')}
          </button>
        </div>
      </div>
    </div>
  );
}
