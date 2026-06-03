import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Card } from '@/components';
import type { Sport, User } from '@/types';
import { usersApi } from '@/api';
import { AddSportQuestionnairePrompt } from '@/components/sportQuestionnaire/AddSportQuestionnairePrompt';
import { ProfileSportCard } from '@/components/profile/ProfileSportCard';
import {
  canEditSportLevel,
  canRemoveSport,
  findSportProfile,
  gamesPlayedForSport,
  getDisplayLevelForSport,
  isSportEnabled,
  hasMultipleSportsEnabled,
  listSelectableSports,
  resolveActivePrimarySport,
  shouldShowSportLevelBadge,
  shouldSuggestAddSportQuestionnaire,
} from '@/utils/profileSports';

type ProfileSportsSectionProps = {
  user: User;
  onUserUpdated: (user: User) => void;
};

export const ProfileSportsSection = ({ user, onUserUpdated }: ProfileSportsSectionProps) => {
  const { t } = useTranslation();
  const [busySport, setBusySport] = useState<Sport | null>(null);
  const [editingSport, setEditingSport] = useState<Sport | null>(null);
  const [draftLevel, setDraftLevel] = useState('');
  const [questionnairePromptSport, setQuestionnairePromptSport] = useState<Sport | null>(null);
  const sportsEnabledKey = (user.sportsEnabled ?? []).join(',');
  const [activityBySport, setActivityBySport] = useState<
    Record<string, { gamesLast7Days: number; gamesLast30Days: number }>
  >({});

  useEffect(() => {
    let cancelled = false;
    void usersApi
      .getMySportActivity()
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, { gamesLast7Days: number; gamesLast30Days: number }> = {};
        for (const row of response.data) {
          map[row.sport] = {
            gamesLast7Days: row.gamesLast7Days,
            gamesLast30Days: row.gamesLast30Days,
          };
        }
        setActivityBySport(map);
      })
      .catch(() => {
        if (!cancelled) setActivityBySport({});
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, sportsEnabledKey]);

  const primary = resolveActivePrimarySport(user);
  const selectableSports = listSelectableSports();

  const questionnairePrompt = (
    <AddSportQuestionnairePrompt
      sport={questionnairePromptSport}
      onClose={() => setQuestionnairePromptSport(null)}
      onUserUpdated={onUserUpdated}
    />
  );

  const run = async <T extends { data: User }>(sport: Sport, fn: () => Promise<T>) => {
    setBusySport(sport);
    try {
      const res = await fn();
      onUserUpdated(res.data);
      toast.success(t('profile.sports.updated'));
      return res;
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(msg);
      return null;
    } finally {
      setBusySport(null);
    }
  };

  const handleAddSport = (sport: Sport) => {
    void run(sport, () => usersApi.addSport(sport)).then((res) => {
      if (
        res &&
        shouldSuggestAddSportQuestionnaire(res.data, sport, res.suggestedQuestionnaire)
      ) {
        setQuestionnairePromptSport(sport);
      }
    });
  };

  const handleSportCardClick = (sport: Sport) => {
    if (busySport === sport) return;
    if (isSportEnabled(user, sport)) {
      if (!canRemoveSport(user, sport)) {
        toast.error(t('auth.atLeastOneSport'));
        return;
      }
      void run(sport, () => usersApi.removeSport(sport));
      return;
    }
    handleAddSport(sport);
  };

  const handleSetPrimary = (sport: Sport) => {
    void run(sport, () => usersApi.setPrimarySport(sport));
  };

  const handlePrimaryStarClick = () => {
    toast(t('profile.sports.primarySportToast'), { icon: '⭐' });
  };

  const startEditLevel = (sport: Sport) => {
    const profile = findSportProfile(user, sport);
    if (!canEditSportLevel(profile)) return;
    setEditingSport(sport);
    setDraftLevel((profile?.level ?? getDisplayLevelForSport(user, sport)).toFixed(1));
  };

  const saveLevel = () => {
    if (!editingSport) return;
    const level = parseFloat(draftLevel);
    if (Number.isNaN(level) || level < 1 || level > 7) {
      toast.error(t('profile.sports.levelInvalid'));
      return;
    }
    void run(editingSport, () => usersApi.updateSportProfileLevel(editingSport, level)).then(() => {
      setEditingSport(null);
    });
  };

  return (
    <>
      <Card className="mt-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('profile.sports.title')}
        </h3>
        {hasMultipleSportsEnabled(user) && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('profile.sports.otherSportsDescription')}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-3">
          {selectableSports.map((sport) => {
            const enabled = isSportEnabled(user, sport);
            const profile = findSportProfile(user, sport);
            const gamesPlayed = gamesPlayedForSport(user, sport);
            const showStats = shouldShowSportLevelBadge(user, sport);

            return (
              <ProfileSportCard
                key={sport}
                sport={sport}
                user={user}
                enabled={enabled}
                isPrimary={primary !== null && sport === primary}
                showStats={showStats}
                displayLevel={getDisplayLevelForSport(user, sport)}
                gamesPlayed={gamesPlayed}
                levelEditable={canEditSportLevel(profile)}
                editing={editingSport === sport}
                draftLevel={draftLevel}
                disabled={busySport === sport}
                onDraftLevelChange={setDraftLevel}
                onCardClick={() => handleSportCardClick(sport)}
                onStartEditLevel={() => startEditLevel(sport)}
                onSaveLevel={saveLevel}
                onCancelEdit={() => setEditingSport(null)}
                onSetPrimary={() => handleSetPrimary(sport)}
                onPrimaryStarClick={handlePrimaryStarClick}
                activityRow={enabled ? activityBySport[sport] : undefined}
                removeHint={
                  enabled && canRemoveSport(user, sport)
                    ? t('profile.sports.tapToRemove')
                    : undefined
                }
                onUserUpdated={onUserUpdated}
                accordionMode={hasMultipleSportsEnabled(user)}
              />
            );
          })}
        </div>
      </Card>

      {questionnairePrompt}
    </>
  );
};
