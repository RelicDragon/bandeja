/**
 * `/my-clubs/:clubId/club/profile` (`club.edit`) — the club's public profile. Text fields, chips
 * and booking defaults are a draft saved from the sticky save bar (`PATCH /profile`); the avatar
 * and photos change at once (upload via the media endpoints, reorder/remove via `PATCH /profile`
 * `photos`). Server validation lands on its field (`details`).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { ClubProfile, PatchClubProfileBody } from '@shared/clubAdmin/contract';
import { mediaApi } from '@/api/media';
import { ClubAvatar } from '@/components/ClubAvatar';
import { FilterChips, Field, inputClass } from '@/components/clubAdmin/console/controls';
import { Card, ErrorState, Section, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx, iconButtonClass } from '@/components/clubAdmin/console/classes';
import { ConfirmSheet, SaveBar, UnsavedChangesGuard } from '@/components/clubAdmin/club/formChrome';
import { useFormBottomPadding, validationFieldErrors } from '@/components/clubAdmin/club/formHooks';
import { movePhoto, removePhotoAt } from '@/components/clubAdmin/club/photoOrder';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { invalidateAfterClubChange, toastClubAdminError } from '@/queries/clubAdmin';
import { useClubProfileQuery, useSaveClubProfileMutation } from '@/queries/clubAdmin/clubArea';
import { getSportConfig } from '@/sport/sportRegistry';
import { listSelectableSports } from '@/utils/profileSports';
import { SUPPORTED_CURRENCIES } from '@/utils/currency';
import type { Sport } from '@/types';

const CLUB_AMENITY_KEYS = ['parking', 'showers', 'wifi', 'lockerRoom', 'bar', 'shop', 'rental', 'lessons'] as const;
const SLOT_OPTIONS = [15, 30, 45, 60, 90, 120];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+\.\S+$/i;
const PHONE_RE = /^\+?[\d\s().-]{5,}$/;

interface ProfileDraft {
  name: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  amenities: string[];
  sports: string[];
  policyText: string;
  defaultSlotMinutes: string;
  cancellationNoticeHours: string;
  currency: string;
}

type DraftField = keyof ProfileDraft;

function toDraft(p: ClubProfile): ProfileDraft {
  return {
    name: p.name,
    description: p.description ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: p.website ?? '',
    address: p.address ?? '',
    amenities: [...p.amenities],
    sports: p.sports.length ? [...p.sports] : ['PADEL'],
    policyText: p.policyText ?? '',
    defaultSlotMinutes: String(p.defaultSlotMinutes),
    cancellationNoticeHours: p.cancellationNoticeHours === null ? '' : String(p.cancellationNoticeHours),
    currency: p.currency,
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

/** Only the fields that changed, typed for `PATCH /profile`. */
function diffDraft(base: ProfileDraft, d: ProfileDraft): PatchClubProfileBody {
  const out: PatchClubProfileBody = {};
  const text = (k: 'description' | 'phone' | 'email' | 'website' | 'policyText') => {
    if (base[k].trim() !== d[k].trim()) out[k] = d[k].trim() || null;
  };
  if (base.name.trim() !== d.name.trim()) out.name = d.name.trim();
  if (base.address.trim() !== d.address.trim()) out.address = d.address.trim();
  text('description');
  text('phone');
  text('email');
  text('website');
  text('policyText');
  if (!sameList(base.amenities, d.amenities)) out.amenities = d.amenities;
  if (!sameList(base.sports, d.sports)) out.sports = d.sports;
  if (base.defaultSlotMinutes !== d.defaultSlotMinutes) out.defaultSlotMinutes = Number(d.defaultSlotMinutes);
  if (base.cancellationNoticeHours.trim() !== d.cancellationNoticeHours.trim()) {
    out.cancellationNoticeHours = d.cancellationNoticeHours.trim() === '' ? null : Number(d.cancellationNoticeHours);
  }
  if (base.currency !== d.currency) out.currency = d.currency;
  return out;
}

function validateDraft(d: ProfileDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.name.trim()) e.name = 'required';
  if (!d.address.trim()) e.address = 'required';
  if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e.email = 'email';
  if (d.website.trim() && !URL_RE.test(d.website.trim())) e.website = 'url';
  if (d.phone.trim() && !PHONE_RE.test(d.phone.trim())) e.phone = 'phone';
  const notice = d.cancellationNoticeHours.trim();
  if (notice && !(/^\d+$/.test(notice) && Number(notice) <= 720)) e.cancellationNoticeHours = 'notice';
  if (d.sports.length === 0) e.sports = 'sports';
  return e;
}

export function ClubProfilePage() {
  const { t } = useTranslation('clubAdmin');
  const { t: tApp } = useTranslation();
  const { clubId } = useClubConsole();
  const hub = `${consoleBase(clubId)}/club`;
  useConsoleHeader({ title: t('club.pages.profile.title'), backTo: hub });

  const profile = useClubProfileQuery(clubId);
  const save = useSaveClubProfileMutation(clubId);
  const [base, setBase] = useState<ProfileDraft | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile.data && !base) {
      const d = toDraft(profile.data);
      setBase(d);
      setDraft(d);
    }
  }, [profile.data, base]);

  const patch = useMemo(() => (base && draft ? diffDraft(base, draft) : {}), [base, draft]);
  const dirty = Object.keys(patch).length > 0;
  const clientErrors = draft ? validateDraft(draft) : {};
  const bottomPad = useFormBottomPadding(dirty);

  const set = <K extends DraftField>(k: K, v: ProfileDraft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setServerErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const errorFor = (k: DraftField): string | undefined => {
    if (serverErrors[k] !== undefined) return t('club.profile.errors.server', { message: serverErrors[k] });
    const code = showErrors ? clientErrors[k] : undefined;
    return code ? t(`club.profile.errors.${code}`) : undefined;
  };

  const onSave = async () => {
    if (!draft || !base) return;
    if (Object.keys(clientErrors).length > 0) {
      setShowErrors(true);
      toast.error(t('club.form.fixErrors'));
      return;
    }
    try {
      const updated = await save.mutateAsync(patch);
      const d = toDraft(updated);
      setBase(d);
      setDraft(d);
      setShowErrors(false);
      setServerErrors({});
      toast.success(t('common.saved'));
    } catch (e) {
      const fields = validationFieldErrors(e);
      if (fields) {
        setServerErrors(fields);
        toast.error(t('club.form.fixErrors'));
      }
    }
  };

  if (profile.isPending) return <SkeletonRows rows={6} className="mx-auto w-full max-w-2xl p-4 lg:p-6" />;
  if (profile.isError || !profile.data) return <ErrorState onRetry={() => void profile.refetch()} />;
  if (!draft) return <SkeletonRows rows={6} className="mx-auto w-full max-w-2xl p-4 lg:p-6" />;

  const toggle = (k: 'amenities' | 'sports', v: string) => {
    const cur = draft[k];
    if (k === 'sports' && cur.includes(v) && cur.length <= 1) return;
    set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  const slotOptions = SLOT_OPTIONS.includes(Number(draft.defaultSlotMinutes))
    ? SLOT_OPTIONS
    : [...SLOT_OPTIONS, Number(draft.defaultSlotMinutes)].sort((a, b) => a - b);
  const unknownAmenities = draft.amenities.filter((a) => !(CLUB_AMENITY_KEYS as readonly string[]).includes(a));

  const textField = (k: 'name' | 'phone' | 'email' | 'website' | 'address', type: string, autoComplete?: string) => (
    <Field label={t(`club.profile.${k}`)} htmlFor={`ca-profile-${k}`} error={errorFor(k)}>
      <input
        id={`ca-profile-${k}`}
        type={type}
        inputMode={k === 'phone' ? 'tel' : k === 'email' ? 'email' : k === 'website' ? 'url' : undefined}
        autoComplete={autoComplete}
        className={cx(inputClass, errorFor(k) && 'border-destructive')}
        aria-invalid={!!errorFor(k)}
        value={draft[k]}
        placeholder={k === 'website' ? 'https://' : undefined}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 lg:p-6" style={{ paddingBottom: bottomPad }}>
      <MediaSection profile={profile.data} clubId={clubId} />

      <Section title={t('club.profile.basics')}>
        <Card className="space-y-4 p-4">
          {textField('name', 'text', 'organization')}
          <Field label={t('club.profile.description')} htmlFor="ca-profile-description" error={errorFor('description')}>
            <textarea
              id="ca-profile-description"
              rows={4}
              className={inputClass}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          {textField('address', 'text', 'street-address')}
        </Card>
      </Section>

      <Section title={t('club.profile.contacts')}>
        <Card className="space-y-4 p-4">
          {textField('phone', 'tel', 'tel')}
          {textField('email', 'email', 'email')}
          {textField('website', 'url', 'url')}
        </Card>
      </Section>

      <Section title={t('club.profile.sportsAndAmenities')}>
        <Card className="space-y-4 p-4">
          <Field label={t('club.profile.sports')} hint={t('club.profile.sportsHint')} error={errorFor('sports')}>
            <FilterChips
              className="flex-wrap overflow-visible"
              ariaLabel={t('club.profile.sports')}
              options={listSelectableSports().map((s: Sport) => {
                const cfg = getSportConfig(s);
                return { value: s as string, label: `${cfg.icon ?? ''} ${tApp(cfg.labelKey)}`.trim() };
              })}
              selected={draft.sports}
              onToggle={(v) => toggle('sports', v)}
            />
          </Field>
          <Field label={t('club.profile.amenities')} error={errorFor('amenities')}>
            <FilterChips
              className="flex-wrap overflow-visible"
              ariaLabel={t('club.profile.amenities')}
              options={[
                ...CLUB_AMENITY_KEYS.map((k) => ({ value: k as string, label: t(`club.profile.amenity.${k}`) })),
                ...unknownAmenities.map((k) => ({ value: k, label: k })),
              ]}
              selected={draft.amenities}
              onToggle={(v) => toggle('amenities', v)}
            />
          </Field>
        </Card>
      </Section>

      <Section title={t('club.profile.booking')}>
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('club.profile.slotLength')} htmlFor="ca-profile-slot" error={errorFor('defaultSlotMinutes')}>
              <select
                id="ca-profile-slot"
                className={inputClass}
                value={draft.defaultSlotMinutes}
                onChange={(e) => set('defaultSlotMinutes', e.target.value)}
              >
                {slotOptions.map((m) => (
                  <option key={m} value={String(m)}>
                    {t('common.minutesShort', { count: m })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('club.profile.cancellationNotice')} htmlFor="ca-profile-notice" error={errorFor('cancellationNoticeHours')}>
              <input
                id="ca-profile-notice"
                type="text"
                inputMode="numeric"
                className={cx(inputClass, errorFor('cancellationNoticeHours') && 'border-destructive')}
                placeholder={t('club.profile.cancellationNoticeNone')}
                value={draft.cancellationNoticeHours}
                onChange={(e) => set('cancellationNoticeHours', e.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
          </div>
          <Field label={t('club.profile.currency')} htmlFor="ca-profile-currency" hint={t('club.profile.currencyHint')} error={errorFor('currency')}>
            <select id="ca-profile-currency" className={inputClass} value={draft.currency} onChange={(e) => set('currency', e.target.value)}>
              {(SUPPORTED_CURRENCIES as string[]).includes(draft.currency) ? null : <option value={draft.currency}>{draft.currency}</option>}
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('club.profile.policyText')} htmlFor="ca-profile-policy" hint={t('club.profile.policyHint')} error={errorFor('policyText')}>
            <textarea
              id="ca-profile-policy"
              rows={4}
              className={inputClass}
              value={draft.policyText}
              onChange={(e) => set('policyText', e.target.value)}
            />
          </Field>
        </Card>
      </Section>

      {profile.data.integrationType ? (
        <p className="px-1 text-xs text-muted-foreground">
          {profile.data.integrationHealthy === false
            ? t('club.profile.integrationBroken', { provider: profile.data.integrationType })
            : t('club.profile.integrationLinked', { provider: profile.data.integrationType })}
        </p>
      ) : null}

      <SaveBar
        visible={dirty}
        saving={save.isPending}
        onSave={() => void onSave()}
        onDiscard={() => {
          setDraft(base);
          setShowErrors(false);
          setServerErrors({});
        }}
      />
      <UnsavedChangesGuard dirty={dirty} fallback={hub} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar + photos (immediate)
// ---------------------------------------------------------------------------

function MediaSection({ profile, clubId }: { profile: ClubProfile; clubId: string }) {
  const { t } = useTranslation('clubAdmin');
  const qc = useQueryClient();
  const save = useSaveClubProfileMutation(clubId);
  const avatarInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<'avatar' | 'photo' | null>(null);
  const [photos, setPhotos] = useState<string[]>(profile.photos);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  useEffect(() => setPhotos(profile.photos), [profile.photos]);

  const refresh = () => invalidateAfterClubChange(qc, clubId);

  const upload = async (kind: 'avatar' | 'photo', file: File | null | undefined) => {
    if (!file) return;
    setUploading(kind);
    try {
      if (kind === 'avatar') await mediaApi.uploadClubAvatar(clubId, file);
      else await mediaApi.uploadClubPhoto(clubId, file);
      await refresh();
      toast.success(kind === 'avatar' ? t('club.profile.avatarUpdated') : t('club.profile.photoAdded'));
    } catch (e) {
      toastClubAdminError(e);
    } finally {
      setUploading(null);
    }
  };

  const persist = async (next: string[]) => {
    const previous = photos;
    setPhotos(next);
    try {
      await save.mutateAsync({ photos: next });
    } catch (e) {
      setPhotos(previous);
      // The form mutation keeps validation silent (per-field); photos have no field to show it on.
      if (validationFieldErrors(e)) toastClubAdminError(e);
    }
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom === null || dragFrom === to) return;
    void persist(movePhoto(photos, dragFrom, to));
    setDragFrom(null);
  };

  return (
    <Section title={t('club.profile.media')}>
      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <ClubAvatar club={{ id: profile.id, name: profile.name, avatar: profile.avatar }} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t('club.profile.avatar')}</p>
            <p className="text-xs text-muted-foreground">{t('club.profile.avatarHint')}</p>
          </div>
          <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => void upload('avatar', e.target.files?.[0])} />
          <button type="button" className={buttonClass('secondary')} disabled={uploading !== null} onClick={() => avatarInput.current?.click()}>
            {uploading === 'avatar' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('club.profile.changeAvatar')}
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t('club.profile.photos')}</p>
            <span className="text-xs text-muted-foreground">{t('club.profile.photosHint')}</span>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t('club.profile.photos')}>
            {photos.map((url, i) => (
              <li
                key={url}
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, i)}
                className={cx(
                  'group relative aspect-square overflow-hidden rounded-xl border border-border bg-ca-sunken lg:cursor-grab',
                  dragFrom === i && 'opacity-50'
                )}
              >
                <img src={url} alt={t('club.profile.photoAlt', { n: i + 1 })} loading="lazy" className="h-full w-full object-cover" draggable={false} />
                {i === 0 ? (
                  <span className="absolute start-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                    {t('club.profile.cover')}
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-1">
                  <div className="flex lg:invisible lg:group-hover:visible lg:group-focus-within:visible">
                    <button
                      type="button"
                      className={cx(iconButtonClass, 'h-8 w-8 text-white hover:bg-white/20')}
                      aria-label={t('club.profile.moveEarlier', { n: i + 1 })}
                      disabled={i === 0 || save.isPending}
                      onClick={() => void persist(movePhoto(photos, i, i - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cx(iconButtonClass, 'h-8 w-8 text-white hover:bg-white/20')}
                      aria-label={t('club.profile.moveLater', { n: i + 1 })}
                      disabled={i === photos.length - 1 || save.isPending}
                      onClick={() => void persist(movePhoto(photos, i, i + 1))}
                    >
                      <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={cx(iconButtonClass, 'h-8 w-8 text-white hover:bg-white/20')}
                    aria-label={t('club.profile.removePhoto', { n: i + 1 })}
                    onClick={() => setRemoveIndex(i)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
            <li>
              <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void upload('photo', e.target.files?.[0])} />
              <button
                type="button"
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                disabled={uploading !== null}
                onClick={() => photoInput.current?.click()}
              >
                {uploading === 'photo' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
                {t('club.profile.addPhoto')}
              </button>
            </li>
          </ul>
        </div>
      </Card>
      <ConfirmSheet
        open={removeIndex !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveIndex(null);
        }}
        modalId="club-photo-remove"
        title={t('club.profile.removePhotoTitle')}
        body={t('club.profile.removePhotoBody')}
        confirmLabel={t('common.delete')}
        busy={save.isPending}
        onConfirm={() => {
          const i = removeIndex;
          setRemoveIndex(null);
          if (i !== null) void persist(removePhotoAt(photos, i));
        }}
      />
    </Section>
  );
}
