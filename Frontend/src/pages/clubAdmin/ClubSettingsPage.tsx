import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clubAdminApi } from '@/api/clubAdmin';
import { mediaApi } from '@/api/media';
import { ClubAdminLayout } from '@/components/clubAdmin/ClubAdminLayout';
import { ClubAdminCoachMark } from '@/components/clubAdmin/ClubAdminCoachMark';
import { ClubAvatar } from '@/components/ClubAvatar';
import { Club, ClubPhoto } from '@/types';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { CLUB_AMENITY_KEYS, ClubAmenityKey } from '@/utils/clubAdmin/constants';
import { normalizeClubPhotos } from '@/utils/clubPhotos';
import {
  markClubAdminCoachStep,
  readClubAdminCoachMarks,
} from '@/utils/clubAdminCoachMarksStorage';

type ClubAdminClub = Club & {
  policyText?: string | null;
  defaultSlotMinutes?: number | null;
  cancellationNoticeHours?: number | null;
  integrationActive?: boolean;
};

export function ClubSettingsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useTranslation();
  const handleForbidden = useClubAdminForbidden();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [club, setClub] = useState<ClubAdminClub | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [coachMarks, setCoachMarks] = useState(readClubAdminCoachMarks);

  useEffect(() => {
    if (!clubId) return;
    clubAdminApi.getClub(clubId).then(setClub).catch(handleForbidden);
  }, [clubId, handleForbidden]);

  const amenities = (club?.amenities as Record<string, boolean> | undefined) ?? {};
  const photos = normalizeClubPhotos(club?.photos);

  const toggleAmenity = (key: ClubAmenityKey) => {
    if (!club) return;
    setClub({
      ...club,
      amenities: { ...amenities, [key]: !amenities[key] },
    });
  };

  const save = async () => {
    if (!club || !clubId) return;
    setSaving(true);
    try {
      const updated = await clubAdminApi.patchClub(clubId, {
        name: club.name,
        description: club.description,
        phone: club.phone,
        email: club.email,
        website: club.website,
        address: club.address,
        openingTime: club.openingTime,
        closingTime: club.closingTime,
        policyText: club.policyText,
        defaultSlotMinutes: club.defaultSlotMinutes ?? undefined,
        cancellationNoticeHours: club.cancellationNoticeHours ?? undefined,
        amenities,
      });
      setClub(updated as ClubAdminClub);
    } catch (e) {
      handleForbidden(e);
    } finally {
      setSaving(false);
    }
  };

  const onPhotoPick = async (file: File | null) => {
    if (!file || !clubId) return;
    setUploadingPhoto(true);
    try {
      const updated = await mediaApi.uploadClubPhoto(clubId, file);
      setClub(updated as ClubAdminClub);
    } catch (e) {
      handleForbidden(e);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async (index: number) => {
    if (!clubId || !club) return;
    const next = photos.filter((_, i) => i !== index);
    try {
      const updated = await clubAdminApi.patchClub(clubId, {
        photos: next as unknown as ClubPhoto[],
      });
      setClub(updated as ClubAdminClub);
    } catch (e) {
      handleForbidden(e);
    }
  };

  const onAvatarPick = async (file: File | null) => {
    if (!file || !clubId) return;
    setUploadingAvatar(true);
    try {
      await mediaApi.uploadClubAvatar(clubId, file);
      const refreshed = await clubAdminApi.getClub(clubId);
      setClub(refreshed as ClubAdminClub);
    } catch (e) {
      handleForbidden(e);
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (!club) return null;

  const field = (label: string, key: keyof Club, multiline = false) => (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          value={(club[key] as string) ?? ''}
          onChange={(e) => setClub({ ...club, [key]: e.target.value })}
          rows={3}
        />
      ) : (
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          value={(club[key] as string) ?? ''}
          onChange={(e) => setClub({ ...club, [key]: e.target.value })}
        />
      )}
    </label>
  );

  return (
    <ClubAdminLayout title={t('clubAdmin.settings')} backTo={`/my-clubs/${clubId}`}>
      <ClubAdminCoachMark
        show={coachMarks.schedule && coachMarks.tapSlot && !coachMarks.settings}
        stepLabel={t('clubAdmin.coachStep', { current: 3, total: 3 })}
        message={t('clubAdmin.coachSettings')}
        onDismiss={() => {
          markClubAdminCoachStep('settings');
          setCoachMarks(readClubAdminCoachMarks());
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ClubAvatar club={club} variant="card" className="h-16 w-16" />
            <div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onAvatarPick(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? t('common.loading') : t('clubAdmin.changeAvatar')}
              </button>
            </div>
          </div>

          {club.integrationActive !== undefined && (
            <p className="text-xs text-muted-foreground">
              {club.integrationActive
                ? t('clubAdmin.integrationLinked')
                : t('clubAdmin.integrationNone')}
            </p>
          )}

          {field(t('clubAdmin.name'), 'name')}
          {field(t('clubAdmin.description'), 'description', true)}
          {field(t('clubAdmin.phone'), 'phone')}
          {field(t('clubAdmin.email'), 'email')}
          {field(t('clubAdmin.website'), 'website')}
          {field(t('clubAdmin.address'), 'address')}
          {field(t('clubAdmin.openingTime'), 'openingTime')}
          {field(t('clubAdmin.closingTime'), 'closingTime')}

          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t('clubAdmin.photos')}</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((ph, i) => (
                <div key={`${ph.thumbnailUrl}-${i}`} className="relative h-16 w-16 overflow-hidden rounded-lg">
                  <img src={ph.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-xs text-white"
                    onClick={() => void removePhoto(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <input
              type="file"
              accept="image/*"
              className="mt-2 text-sm"
              disabled={uploadingPhoto}
              onChange={(e) => void onPhotoPick(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="block text-sm">
            <span className="text-muted-foreground">{t('clubAdmin.policyText')}</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
              value={club.policyText ?? ''}
              onChange={(e) => setClub({ ...club, policyText: e.target.value })}
              rows={3}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-muted-foreground">{t('clubAdmin.defaultSlotMinutes')}</span>
              <input
                type="number"
                min={15}
                step={15}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={club.defaultSlotMinutes ?? ''}
                onChange={(e) =>
                  setClub({
                    ...club,
                    defaultSlotMinutes: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">{t('clubAdmin.cancellationNoticeHours')}</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                value={club.cancellationNoticeHours ?? ''}
                onChange={(e) =>
                  setClub({
                    ...club,
                    cancellationNoticeHours: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t('clubAdmin.amenities')}</p>
            <div className="flex flex-wrap gap-2">
              {CLUB_AMENITY_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${
                    amenities[key] ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                  }`}
                  onClick={() => toggleAmenity(key)}
                >
                  {t(`clubAdmin.amenity.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn-primary w-full" disabled={saving} onClick={save}>
            {t('common.save')}
          </button>
        </div>
      </ClubAdminCoachMark>
    </ClubAdminLayout>
  );
}
