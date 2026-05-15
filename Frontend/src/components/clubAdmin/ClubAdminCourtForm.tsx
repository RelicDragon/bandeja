import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Court } from '@/types';

interface ClubAdminCourtFormProps {
  open: boolean;
  onClose: () => void;
  court?: Court | null;
  onSubmit: (data: {
    name: string;
    courtType?: string;
    isIndoor?: boolean;
    surfaceType?: string;
    pricePerHour?: number;
    isActive?: boolean;
  }) => Promise<void>;
}

export function ClubAdminCourtForm({ open, onClose, court, onSubmit }: ClubAdminCourtFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [courtType, setCourtType] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [isIndoor, setIsIndoor] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(court?.name ?? '');
    setCourtType(court?.courtType ?? '');
    setSurfaceType(court?.surfaceType ?? '');
    setPricePerHour(court?.pricePerHour != null ? String(court.pricePerHour) : '');
    setIsIndoor(court?.isIndoor ?? false);
    setIsActive(court?.isActive !== false);
  }, [open, court]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        courtType: courtType.trim() || undefined,
        surfaceType: surfaceType.trim() || undefined,
        isIndoor,
        pricePerHour: pricePerHour ? Number(pricePerHour) : undefined,
        ...(court ? { isActive } : {}),
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
        <h2 className="text-lg font-semibold">{court ? t('clubAdmin.editCourt') : t('clubAdmin.addCourt')}</h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">{t('clubAdmin.courtName')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{t('clubAdmin.courtType')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={courtType}
              onChange={(e) => setCourtType(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{t('clubAdmin.surfaceType')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{t('clubAdmin.pricePerHour')}</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={pricePerHour}
              onChange={(e) => setPricePerHour(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isIndoor} onChange={(e) => setIsIndoor(e.target.checked)} />
            {t('clubAdmin.indoor')}
          </label>
          {court && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {t('clubAdmin.active')}
            </label>
          )}
          {court?.externalCourtId && (
            <p className="text-xs text-muted-foreground">
              {t('clubAdmin.externalCourtId')}: {court.externalCourtId}
            </p>
          )}
          <button type="button" className="btn-primary w-full" disabled={saving} onClick={() => void handleSubmit()}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
