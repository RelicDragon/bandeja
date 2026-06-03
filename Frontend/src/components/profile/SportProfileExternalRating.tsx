import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Link2 } from 'lucide-react';
import { Button, Input } from '@/components';
import type { Sport, User } from '@/types';
import { usersApi } from '@/api';
import { findSportProfile } from '@/utils/profileSports';
import { getSportRatingModel, sportSupportsExternalRatingHint } from '@/sport/sportRatingModels';

type SportProfileExternalRatingProps = {
  user: User;
  sport: Sport;
  disabled?: boolean;
  onUserUpdated: (user: User) => void;
};

export function SportProfileExternalRating({
  user,
  sport,
  disabled = false,
  onUserUpdated,
}: SportProfileExternalRatingProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (!sportSupportsExternalRatingHint(sport)) return null;

  const profile = findSportProfile(user, sport);
  const displaySystem = getSportRatingModel(sport).display?.system ?? 'NONE';
  const systemKey = displaySystem.toLowerCase();
  const hasOverride = Boolean(profile?.externalRatingHint?.trim());

  const startEdit = () => {
    setDraft(profile?.externalRatingHint ?? '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await usersApi.updateSportExternalRating(
        sport,
        draft.trim() ? draft.trim() : null,
      );
      onUserUpdated(res.data);
      setEditing(false);
      toast.success(t('profile.sports.externalRatingUpdated'));
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-1 flex w-full flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          type="text"
          maxLength={32}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(`profile.sports.externalRatingPlaceholder.${systemKey}`, {
            defaultValue: t('profile.sports.externalRatingPlaceholder.default'),
          })}
          className="h-7 px-1.5 text-center text-[10px]"
        />
        <div className="flex gap-1">
          <Button size="sm" className="flex-1 px-1 text-[10px]" onClick={save} disabled={saving || disabled}>
            {t('profile.save')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 px-1 text-[10px]"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            {t('profile.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-primary-300/80 bg-primary-50/60 px-2 py-0.5 text-[9px] font-medium text-primary-700 transition hover:bg-primary-100/80 disabled:opacity-50 dark:border-primary-600/50 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-900/40"
    >
      <Link2 size={10} aria-hidden className="shrink-0" />
      <span className="truncate">
        {hasOverride
          ? `${t('profile.sports.editExternalRating')}: ${profile?.externalRatingHint}`
          : t('profile.sports.addExternalRating')}
      </span>
    </button>
  );
}
