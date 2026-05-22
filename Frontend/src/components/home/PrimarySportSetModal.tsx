import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components';
import { ProfileSportCard } from '@/components/profile/ProfileSportCard';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { DEFAULT_REGISTRATION_SPORT } from '@/utils/registrationPrimarySport';
import {
  getDisplayLevelForSport,
  listEnabledSports,
  listSelectableSports,
  resolveActivePrimarySport,
} from '@/utils/profileSports';
import type { Sport, User } from '@/types';

interface PrimarySportSetModalProps {
  open: boolean;
}

export function PrimarySportSetModal({ open }: PrimarySportSetModalProps) {
  const { t } = useTranslation();
  const authUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [enabledSports, setEnabledSports] = useState<Sport[]>([DEFAULT_REGISTRATION_SPORT]);
  const [primarySport, setPrimarySport] = useState<Sport>(DEFAULT_REGISTRATION_SPORT);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !authUser) return;
    const enabled = listEnabledSports(authUser);
    setEnabledSports(enabled.length > 0 ? enabled : [DEFAULT_REGISTRATION_SPORT]);
    setPrimarySport(resolveActivePrimarySport(authUser) ?? DEFAULT_REGISTRATION_SPORT);
  }, [open, authUser]);

  const draftUser = useMemo((): User | null => {
    if (!authUser) return null;
    return {
      ...authUser,
      sportsEnabled: enabledSports,
      primarySport,
    };
  }, [authUser, enabledSports, primarySport]);

  const selectableSports = listSelectableSports();

  const toggleSport = (sport: Sport) => {
    if (enabledSports.includes(sport)) {
      if (enabledSports.length <= 1) {
        toast.error(t('auth.atLeastOneSport'));
        return;
      }
      const next = enabledSports.filter((s) => s !== sport);
      setEnabledSports(next);
      if (primarySport === sport) {
        setPrimarySport(next[0]!);
      }
      return;
    }
    setEnabledSports([...enabledSports, sport]);
  };

  const handleConfirm = async () => {
    if (enabledSports.length === 0) {
      toast.error(t('auth.atLeastOneSport'));
      return;
    }
    const primary = enabledSports.includes(primarySport) ? primarySport : enabledSports[0]!;
    setIsSaving(true);
    try {
      const response = await usersApi.confirmPrimarySport(enabledSports, primary);
      updateUser(response.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!draftUser) return null;

  return (
    <Dialog open={open} onClose={() => {}} modalId="primary-sport-set-modal">
      <DialogContent
        showCloseButton={false}
        closeOnInteractOutside={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-[22rem] border-0 bg-transparent p-0 shadow-none sm:max-w-md"
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl dark:border-slate-700/80 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-3 pt-5 text-center dark:border-slate-800 dark:from-slate-800/80 dark:to-slate-900">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {t('auth.registrationSportTitle')}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t('auth.registrationSportHint')}
            </p>
          </div>
          <div className="px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              {selectableSports.map((sport) => {
                const enabled = enabledSports.includes(sport);
                return (
                  <ProfileSportCard
                    key={sport}
                    sport={sport}
                    user={draftUser}
                    enabled={enabled}
                    isPrimary={enabled && sport === primarySport}
                    showStats={false}
                    displayLevel={getDisplayLevelForSport(draftUser, sport)}
                    gamesPlayed={0}
                    levelEditable={false}
                    editing={false}
                    draftLevel=""
                    disabled={isSaving}
                    onDraftLevelChange={() => {}}
                    onCardClick={() => toggleSport(sport)}
                    onStartEditLevel={() => {}}
                    onSaveLevel={() => {}}
                    onCancelEdit={() => {}}
                    onSetPrimary={() => setPrimarySport(sport)}
                    onPrimaryStarClick={() => {
                      toast(t('profile.sports.primarySportToast'), { icon: '⭐' });
                    }}
                    onUserUpdated={updateUser}
                  />
                );
              })}
            </div>
          </div>
          <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
            <Button
              type="button"
              className="h-10 w-full rounded-lg text-sm font-semibold"
              onClick={handleConfirm}
              disabled={isSaving || enabledSports.length === 0}
            >
              {isSaving ? t('app.loading') : t('common.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
