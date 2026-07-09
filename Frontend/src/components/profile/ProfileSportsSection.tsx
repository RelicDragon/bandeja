import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '@/components';
import type { Sport, User } from '@/types';
import { usersApi } from '@/api';
import { syncNativeAppIconForUser } from '@/services/appIcon.service';
import { AddSportQuestionnairePrompt } from '@/components/sportQuestionnaire/AddSportQuestionnairePrompt';
import { ProfileSportCard } from '@/components/profile/ProfileSportCard';
import { ProfileSportDetailsPanel } from '@/components/profile/ProfileSportDetailsPanel';
import {
  canEditSportLevel,
  canDisableSport,
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
  const [expandedSport, setExpandedSport] = useState<Sport | null>(null);
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
  const expandedProfile = expandedSport ? findSportProfile(user, expandedSport) : null;

  useEffect(() => {
    if (!expandedSport) return;
    if (!isSportEnabled(user, expandedSport)) {
      setExpandedSport(null);
      setEditingSport(null);
    }
  }, [user, expandedSport, sportsEnabledKey]);

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
      syncNativeAppIconForUser(res.data);
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
      if (!canDisableSport(user, sport)) {
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
    setExpandedSport(sport);
    setDraftLevel((profile?.level ?? getDisplayLevelForSport(user, sport)).toFixed(1));
  };

  const toggleExpandedSport = (sport: Sport) => {
    setExpandedSport((current) => (current === sport ? null : sport));
    if (editingSport && editingSport !== sport) {
      setEditingSport(null);
    }
  };

  const closeExpandedSport = () => {
    setExpandedSport(null);
    setEditingSport(null);
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

  const colsPerRow = 3;
  const sportRows: Sport[][] = [];
  for (let i = 0; i < selectableSports.length; i += colsPerRow) {
    sportRows.push(selectableSports.slice(i, i + colsPerRow));
  }

  const renderSportCard = (sport: Sport) => {
    const enabled = isSportEnabled(user, sport);
    const gamesPlayed = gamesPlayedForSport(user, sport);
    const showStats = shouldShowSportLevelBadge(user, sport);

    return (
      <ProfileSportCard
        key={sport}
        sport={sport}
        enabled={enabled}
        isPrimary={primary !== null && sport === primary}
        showStats={showStats}
        displayLevel={getDisplayLevelForSport(user, sport)}
        gamesPlayed={gamesPlayed}
        disabled={busySport === sport}
        detailsOpen={expandedSport === sport}
        onToggleDetails={() => toggleExpandedSport(sport)}
        onCardClick={() => handleSportCardClick(sport)}
        onSetPrimary={() => handleSetPrimary(sport)}
        onPrimaryStarClick={handlePrimaryStarClick}
        activityRow={enabled ? activityBySport[sport] : undefined}
      />
    );
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
        <div className="mt-3 flex flex-col gap-3">
          {sportRows.map((rowSports, rowIndex) => (
            <div key={rowIndex} className="flex flex-col gap-3">
              <div className="grid grid-cols-3 items-stretch gap-3">
                {rowSports.map((sport) => (
                  <div key={sport} className="min-w-0">
                    {renderSportCard(sport)}
                  </div>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {expandedSport &&
                isSportEnabled(user, expandedSport) &&
                rowSports.includes(expandedSport) ? (
                  <motion.div
                    key={expandedSport}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <ProfileSportDetailsPanel
                      sport={expandedSport}
                      user={user}
                      displayLevel={getDisplayLevelForSport(user, expandedSport)}
                      gamesPlayed={gamesPlayedForSport(user, expandedSport)}
                      levelEditable={canEditSportLevel(expandedProfile ?? undefined)}
                      editing={editingSport === expandedSport}
                      draftLevel={draftLevel}
                      disabled={busySport === expandedSport}
                      onDraftLevelChange={setDraftLevel}
                      onStartEditLevel={() => startEditLevel(expandedSport)}
                      onSaveLevel={saveLevel}
                      onCancelEdit={() => setEditingSport(null)}
                      onClose={closeExpandedSport}
                      onUserUpdated={onUserUpdated}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </Card>

      {questionnairePrompt}
    </>
  );
};
