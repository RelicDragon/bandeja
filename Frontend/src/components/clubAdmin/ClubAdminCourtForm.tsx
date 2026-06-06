import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components';
import { Court } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

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
    webCameraUrl?: string | null;
    isActive?: boolean;
  }) => Promise<void>;
}

const INPUT_CLASS =
  'mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ClubAdminCourtForm({ open, onClose, court, onSubmit }: ClubAdminCourtFormProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(open);
  const [name, setName] = useState('');
  const [courtType, setCourtType] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [pricePerHour, setPricePerHour] = useState('');
  const [webCameraUrl, setWebCameraUrl] = useState('');
  const [isIndoor, setIsIndoor] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInternalOpen(true);
    setName(court?.name ?? '');
    setCourtType(court?.courtType ?? '');
    setSurfaceType(court?.surfaceType ?? '');
    setPricePerHour(court?.pricePerHour != null ? String(court.pricePerHour) : '');
    setWebCameraUrl(court?.webCameraUrl ?? '');
    setIsIndoor(court?.isIndoor ?? false);
    setIsActive(court?.isActive !== false);
  }, [open, court]);

  const dismiss = () => {
    setInternalOpen(false);
    setTimeout(onClose, 300);
  };

  const handleClose = () => {
    if (saving) return;
    dismiss();
  };

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
        webCameraUrl: court ? (webCameraUrl.trim() || null) : (webCameraUrl.trim() || undefined),
        ...(court ? { isActive } : {}),
      });
      dismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={internalOpen}
      onClose={handleClose}
      modalId={court ? `club-court-edit-${court.id}` : 'club-court-add'}
    >
      <DialogContent>
        <DialogHeader className="border-gray-200 dark:border-gray-800">
          <DialogTitle>{court ? t('clubAdmin.editCourt') : t('clubAdmin.addCourt')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ minHeight: 0 }}>
          <div className="space-y-4">
            <Field label={t('clubAdmin.courtName')}>
              <input
                className={INPUT_CLASS}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('clubAdmin.courtType')}>
                <input className={INPUT_CLASS} value={courtType} onChange={(e) => setCourtType(e.target.value)} />
              </Field>
              <Field label={t('clubAdmin.surfaceType')}>
                <input className={INPUT_CLASS} value={surfaceType} onChange={(e) => setSurfaceType(e.target.value)} />
              </Field>
            </div>
            <Field label={t('clubAdmin.pricePerHour')}>
              <input
                type="number"
                min={0}
                className={INPUT_CLASS}
                value={pricePerHour}
                onChange={(e) => setPricePerHour(e.target.value)}
              />
            </Field>
            <Field label={t('clubAdmin.webCameraUrl')}>
              <input
                type="url"
                className={INPUT_CLASS}
                value={webCameraUrl}
                onChange={(e) => setWebCameraUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>

            <div className="overflow-hidden rounded-xl border border-border bg-muted/20 divide-y divide-border">
              <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium text-foreground">{t('clubAdmin.indoor')}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                  checked={isIndoor}
                  onChange={(e) => setIsIndoor(e.target.checked)}
                />
              </label>
              {court && (
                <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{t('clubAdmin.active')}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                </label>
              )}
            </div>

            {court?.externalCourtId && (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t('clubAdmin.externalCourtId')}:{' '}
                <span className="font-mono text-foreground">{court.externalCourtId}</span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <Button variant="outline" size="md" onClick={handleClose} disabled={saving}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('common.save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
