import type { Sport, User, UserSportProfile } from '@/types';
import { getSportQuestionnaireConfig, sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import { findSportProfile, gamesPlayedForSport, getDisplayLevelForSport, getUserPrimarySport } from '@/utils/profileSports';
import type { QuestionnaireStatus } from '@/api/sportQuestionnaire';

export function isPadelWelcomeComplete(user: User | null | undefined): boolean {
  return user?.welcomeScreenPassed === true;
}

export function isSportQuestionnaireCompleted(
  user: User | null | undefined,
  sport: Sport,
  profile?: UserSportProfile,
): boolean {
  const p = profile ?? findSportProfile(user, sport);
  if (p?.questionnaireCompletedAt) return true;
  if (sport === 'PADEL' && isPadelWelcomeComplete(user) && user && getDisplayLevelForSport(user, sport) !== 1) {
    return true;
  }
  if (sport === 'PADEL' && isPadelWelcomeComplete(user) && p?.levelSource === 'QUESTIONNAIRE') {
    return true;
  }
  return false;
}

export function isSportQuestionnaireSkipped(
  user: User | null | undefined,
  sport: Sport,
  profile?: UserSportProfile,
): boolean {
  const p = profile ?? findSportProfile(user, sport);
  if (p?.questionnaireSkippedAt) return true;
  if (sport === 'PADEL' && isPadelWelcomeComplete(user) && !isSportQuestionnaireCompleted(user, sport, p)) {
    return true;
  }
  return false;
}

export function shouldSuggestSportQuestionnaire(
  user: User | null | undefined,
  sport: Sport,
  status?: QuestionnaireStatus | null,
): boolean {
  if (!sportHasQuestionnaire(sport)) return false;
  if (status) {
    return status.suggested && !status.completed && !status.skipped && status.gamesPlayed === 0;
  }
  const profile = findSportProfile(user, sport);
  if ((profile?.gamesPlayed ?? 0) > 0) return false;
  if (isSportQuestionnaireCompleted(user, sport, profile)) return false;
  if (isSportQuestionnaireSkipped(user, sport, profile)) return false;
  return true;
}

export function shouldShowEstimateLevelLink(
  user: User | null | undefined,
  sport: Sport,
  status?: QuestionnaireStatus | null,
): boolean {
  if (!getSportQuestionnaireConfig(sport)) return false;
  const profile = findSportProfile(user, sport);
  const level = status?.level ?? profile?.level ?? (user ? getDisplayLevelForSport(user, sport) : 1);
  const gamesPlayed = status?.gamesPlayed ?? profile?.gamesPlayed ?? (user ? gamesPlayedForSport(user, sport) : 0);
  if (gamesPlayed > 0) return false;
  if (level !== 1 && level !== 1.0) return false;
  return shouldSuggestSportQuestionnaire(user, sport, status);
}

/** Invite flow: unrated 1.0 for game sport, including cross-sport (e.g. padel 4.0 → tennis invite). */
export function shouldNudgeInvite(
  user: User | null | undefined,
  gameSport: Sport,
  status?: QuestionnaireStatus | null,
): boolean {
  if (!shouldShowEstimateLevelLink(user, gameSport, status)) return false;
  const primary = getUserPrimarySport(user!);
  if (gameSport !== primary) {
    const primaryLevel = getDisplayLevelForSport(user!, primary);
    if (primaryLevel > 1) return true;
  }
  return shouldSuggestSportQuestionnaire(user, gameSport, status);
}

export type InviteNudgeCopyMode = 'none' | 'same-sport' | 'cross-sport';

export function getInviteNudgeCopyMode(
  user: User | null | undefined,
  gameSport: Sport,
  status?: QuestionnaireStatus | null,
): InviteNudgeCopyMode {
  if (!user || !shouldNudgeInvite(user, gameSport, status)) return 'none';
  const primary = getUserPrimarySport(user);
  if (gameSport !== primary && getDisplayLevelForSport(user, primary) > 1) {
    return 'cross-sport';
  }
  return 'same-sport';
}

const CREATE_GAME_HIGH_BAND_THRESHOLD = 2.5;

/** Creator at default 1.0 (ADR-Q8): levelSource DEFAULT or unrated 1.0 with no rated games. */
export function isCreatorUnratedForSport(
  user: User,
  sport: Sport,
  status?: QuestionnaireStatus | null,
): boolean {
  const profile = findSportProfile(user, sport);
  const level = status?.level ?? profile?.level ?? getDisplayLevelForSport(user, sport);
  if (level !== 1 && level !== 1.0) return false;
  const gamesPlayed =
    status?.gamesPlayed ?? profile?.gamesPlayed ?? gamesPlayedForSport(user, sport);
  if (gamesPlayed > 0) return false;
  const levelSource = profile?.levelSource ?? 'DEFAULT';
  return levelSource === 'DEFAULT' || gamesPlayed === 0;
}

export function shouldWarnCreateGameLevelBand(
  user: User,
  sport: Sport,
  minLevel: number,
  _maxLevel: number,
  status?: QuestionnaireStatus | null,
): boolean {
  if (!isCreatorUnratedForSport(user, sport, status)) return false;
  return minLevel > CREATE_GAME_HIGH_BAND_THRESHOLD;
}
