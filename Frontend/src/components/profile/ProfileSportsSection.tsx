import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Card } from '@/components';
import type { Sport, User } from '@/types';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import { usersApi } from '@/api';
import { AddSportQuestionnairePrompt } from '@/components/sportQuestionnaire/AddSportQuestionnairePrompt';
import { ProfileSportCard } from '@/components/profile/ProfileSportCard';
import {
  canEditSportLevel,
  findSportProfile,
  gamesPlayedForSport,
  getDisplayLevelForSport,
  isSportEnabled,
  listSelectableSports,
  resolveActivePrimarySport,
  shouldShowSportLevelBadge,
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

  const primary = resolveActivePrimarySport(user);
  const selectableSports = listSelectableSports();

  const questionnairePrompt = (
    <AddSportQuestionnairePrompt
      sport={questionnairePromptSport}
      onClose={() => setQuestionnairePromptSport(null)}
      onUserUpdated={onUserUpdated}
    />
  );

  const run = async (sport: Sport, fn: () => Promise<{ data: User }>) => {
    setBusySport(sport);
    try {
      const res = await fn();
      onUserUpdated(res.data);
      toast.success(t('profile.sports.updated'));
      return res.data;
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
    void run(sport, () => usersApi.addSport(sport)).then((updated) => {
      if (updated && sportHasQuestionnaire(sport)) {
        setQuestionnairePromptSport(sport);
      }
    });
  };

  const handleSportCardClick = (sport: Sport) => {
    if (busySport === sport) return;
    if (isSportEnabled(user, sport)) {
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
                onUserUpdated={onUserUpdated}
              />
            );
          })}
        </div>
      </Card>

      {questionnairePrompt}
    </>
  );
};
