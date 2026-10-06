/**
 * Add / edit court sheet (Club area → Courts). A console sheet: bottom sheet above the keyboard
 * on phones, side panel on desktop, Android back closes it. The base rate is entered in major
 * units and sent as `pricePerHourCents` (the court's fallback when no price rule covers a time).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Home, Sun } from 'lucide-react';
import type { ClubAdminCourt, UpsertCourtBody } from '@shared/clubAdmin/contract';
import { toastClubAdminError } from '@/queries/clubAdmin/toastError';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { ConsoleSheet } from './console/ConsoleSheet';
import { Field, inputClass } from './console/controls';
import { buttonClass, cx } from './console/classes';
import { centsToInput, parseMoneyInput } from './club/pricingModel';

export type CourtFormValues = Required<Pick<UpsertCourtBody, 'name' | 'isIndoor'>> &
  Pick<UpsertCourtBody, 'sport' | 'courtType' | 'surfaceType' | 'pricePerHourCents' | 'webCameraUrl'>;

interface ClubAdminCourtFormProps {
  open: boolean;
  onClose: () => void;
  court?: Pick<ClubAdminCourt, 'id' | 'name' | 'isIndoor' | 'isActive'> & Partial<ClubAdminCourt> | null;
  clubSports: Sport[];
  currency?: string;
  onSubmit: (data: CourtFormValues) => Promise<void>;
  /** Extra actions under the form (e.g. switch the court off). */
  children?: ReactNode;
}

/** PRD 357 — indoor/outdoor is what decides whether weather alerts fire. */
const COURT_COVER_TABS = [
  { id: 'indoor', labelKey: 'weatherAlerts.indoor', icon: Home },
  { id: 'outdoor', labelKey: 'weatherAlerts.outdoor', icon: Sun },
] as const;

export function ClubAdminCourtForm({ open, onClose, court, clubSports, currency, onSubmit, children }: ClubAdminCourtFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<Sport | null>(null);
  const [courtType, setCourtType] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [price, setPrice] = useState('');
  const [webCameraUrl, setWebCameraUrl] = useState('');
  const [isIndoor, setIsIndoor] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(court?.name ?? '');
    setSport((court?.sport as Sport | null | undefined) ?? (clubSports.length === 1 ? clubSports[0] : null));
    setCourtType(court?.courtType ?? '');
    setSurfaceType(court?.surfaceType ?? '');
    setPrice(centsToInput(court?.pricePerHourCents ?? null));
    setWebCameraUrl(court?.webCameraUrl ?? '');
    setIsIndoor(court?.isIndoor ?? false);
  }, [open, court, clubSports]);

  const priceCents = parseMoneyInput(price);
  const priceInvalid = price.trim() !== '' && priceCents === null;
  const urlInvalid = webCameraUrl.trim() !== '' && !/^https?:\/\/\S+$/i.test(webCameraUrl.trim());

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim() || priceInvalid || urlInvalid) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        sport,
        courtType: courtType.trim() || null,
        surfaceType: surfaceType.trim() || null,
        isIndoor,
        pricePerHourCents: priceCents,
        webCameraUrl: webCameraUrl.trim() || null,
      });
      onClose();
    } catch (e) {
      toastClubAdminError(e);
    } finally {
      setSaving(false);
    }
  };

  const chip = (selected: boolean) =>
    cx(
      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
      selected
        ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-gray-950'
        : 'border-border bg-ca-surface text-foreground hover:bg-muted'
    );

  return (
    <ConsoleSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      title={court ? t('clubAdmin:club.courts.edit') : t('clubAdmin:club.courts.add')}
      modalId={court ? `club-court-edit-${court.id}` : 'club-court-add'}
      dismissible={!saving}
      footer={
        <div className="flex gap-2">
          <button type="button" className={buttonClass('secondary', 'flex-1')} onClick={handleClose} disabled={saving}>
            {t('clubAdmin:common.cancel')}
          </button>
          <button
            type="button"
            className={buttonClass('primary', 'flex-1')}
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim() || priceInvalid || urlInvalid}
          >
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {saving ? t('clubAdmin:common.saving') : t('clubAdmin:common.save')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={t('clubAdmin:club.courts.name')} htmlFor="ca-court-name">
          <input id="ca-court-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label={t('clubAdmin:club.courts.sport')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('clubAdmin:club.courts.sport')}>
            <button type="button" aria-pressed={sport == null} className={chip(sport == null)} onClick={() => setSport(null)}>
              {t('clubAdmin:club.courts.noSport')}
            </button>
            {clubSports.map((s) => (
              <button key={s} type="button" aria-pressed={sport === s} className={chip(sport === s)} onClick={() => setSport(s)}>
                <SportPublicIcon sport={s} className="h-4 w-4 shrink-0 object-contain" />
                {t(getSportConfig(s).labelKey)}
              </button>
            ))}
          </div>
        </Field>

        {/* PRD 357 — this flag decides whether the game gets a weather alert at all, so it is a
            prominent two-option control rather than a checkbox an admin can skim past. */}
        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-foreground">{t('weatherAlerts.courtCover')}</span>
          <SegmentedSwitch
            tabs={COURT_COVER_TABS.map((tab) => ({
              ...tab,
              label: t(tab.labelKey),
              ariaLabel: t(tab.labelKey),
            }))}
            activeId={isIndoor ? 'indoor' : 'outdoor'}
            onChange={(id) => setIsIndoor(id === 'indoor')}
            showOnlyActiveTabText={false}
            fullWidth
            layoutId={`court-cover-${court?.id ?? 'new'}`}
            ariaLabel={t('weatherAlerts.courtCover')}
          />
          <p className="text-xs text-muted-foreground">{t('weatherAlerts.courtCoverHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('clubAdmin:club.courts.type')} htmlFor="ca-court-type">
            <input id="ca-court-type" className={inputClass} value={courtType} onChange={(e) => setCourtType(e.target.value)} />
          </Field>
          <Field label={t('clubAdmin:club.courts.surface')} htmlFor="ca-court-surface">
            <input id="ca-court-surface" className={inputClass} value={surfaceType} onChange={(e) => setSurfaceType(e.target.value)} />
          </Field>
        </div>
        <Field
          label={currency ? `${t('clubAdmin:club.courts.baseRate')} (${currency})` : t('clubAdmin:club.courts.baseRate')}
          htmlFor="ca-court-price"
          hint={t('clubAdmin:club.courts.baseRateHint')}
          error={priceInvalid ? t('clubAdmin:club.pricing.errors.price') : undefined}
        >
          <input
            id="ca-court-price"
            type="text"
            inputMode="decimal"
            className={inputClass}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field
          label={t('clubAdmin:club.courts.webCameraUrl')}
          htmlFor="ca-court-camera"
          error={urlInvalid ? t('clubAdmin:club.profile.errors.url') : undefined}
        >
          <input
            id="ca-court-camera"
            type="url"
            inputMode="url"
            className={inputClass}
            value={webCameraUrl}
            onChange={(e) => setWebCameraUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>

        {court?.externalCourtId ? (
          <p className="rounded-xl bg-ca-sunken px-3 py-2 text-xs text-muted-foreground">
            {t('clubAdmin:club.courts.externalId')}: <span className="font-mono text-foreground">{court.externalCourtId}</span>
          </p>
        ) : null}
        {children}
      </div>
    </ConsoleSheet>
  );
}
