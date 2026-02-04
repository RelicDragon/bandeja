import { Game, User } from '@/types';
import { GroupChannel } from '@/api/chat';

/**
 * Checks if a user is admin or owner of a game (including parent game)
 * 
 * @param game - The game object
 * @param userId - The user ID to check
 * @returns boolean indicating if the user has admin/owner permissions
 */
export const isUserGameAdminOrOwner = (game: Game, userId: string): boolean => {
  // Check current game
  const isCurrentGameAdminOrOwner = game.participants?.some(
    (p) => p.userId === userId && ['OWNER', 'ADMIN'].includes(p.role)
  );

  if (isCurrentGameAdminOrOwner) return true;

  // Check parent game
  const isParentGameAdminOrOwner = game.parent?.participants?.some(
    (p) => p.userId === userId && ['OWNER', 'ADMIN'].includes(p.role)
  );

  return isParentGameAdminOrOwner || false;
};

/**
 * Checks if a user is owner of a group/channel
 * 
 * @param groupChannel - The group/channel object
 * @param userId - The user ID to check
 * @returns boolean indicating if the user is the owner
 */
export const isGroupChannelOwner = (groupChannel: GroupChannel, userId: string): boolean => {
  if (!groupChannel?.participants) return false;
  return groupChannel.participants.some(
    (p) => p.userId === userId && p.role === 'OWNER'
  );
};

/**
 * Checks if a user is admin or owner of a group/channel
 * 
 * @param groupChannel - The group/channel object
 * @param userId - The user ID to check
 * @returns boolean indicating if the user has admin/owner permissions
 */
export const isGroupChannelAdminOrOwner = (groupChannel: GroupChannel, userId: string): boolean => {
  if (!groupChannel?.participants) return false;
  return groupChannel.participants.some(
    (p) => p.userId === userId && ['OWNER', 'ADMIN'].includes(p.role)
  );
};

/**
 * Checks if a user is a participant in a game (including having access through parent game)
 * 
 * @param game - The game object
 * @param userId - The user ID to check
 * @returns boolean indicating if the user is a participant or has parent access
 */
export const isUserGameParticipant = (game: Game, userId: string): boolean => {
  // Check if user is a participant in current game
  const isCurrentParticipant = game.participants?.some((p) => p.userId === userId);
  
  if (isCurrentParticipant) return true;

  // Check if user is admin/owner of parent game (grants access)
  return isUserGameAdminOrOwner(game, userId);
};

/**
 * Gets the game result status information - shows only problems or simple positive message
 * 
 * @param game - The game object
 * @param user - The user object
 * @returns Object with message and canModify properties, or null if no status
 */
export const getGameResultStatus = (game: Game, user: User | null): { message: string; canModify: boolean } | null => {
  if (!game || !user) return null;

  // First check if user can see the game at all
  if (!canUserSeeGame(game, user)) {
    return {
      message: 'games.results.problems.accessDenied',
      canModify: false
    };
  }

  // Check if user has permission to modify results (user permissions only)
  let hasEditPermission = false;
  
  if (user.isAdmin) {
    hasEditPermission = true;
  } else if (isUserGameAdminOrOwner(game, user.id)) {
    hasEditPermission = true;
  } else if (game.entityType === 'TRAINING' && (user.isTrainer || user.isAdmin)) {
    // For training games, trainers and admins can edit
    hasEditPermission = true;
  } else if (game.resultsByAnyone) {
    // Check if user is a playing participant and resultsByAnyone is true
    const isPlayingParticipant = game.participants.some(
      (p) => p.userId === user.id && p.status === 'PLAYING'
    );
    hasEditPermission = isPlayingParticipant;
  }

  // Check if game is archived
  if (game.status === 'ARCHIVED') {
    // For archived games, allow viewing if results exist, but never allow editing
    if (game.resultsStatus !== 'NONE') {
      return {
        message: 'games.results.positive.canViewResults',
        canModify: false
      };
    }
    return {
      message: 'games.results.problems.gameArchived',
      canModify: false
    };
  }

  // Check for problems that prevent editing
  const problems: string[] = [];

  // Skip participant checks for TRAINING games
  if (game.entityType !== 'TRAINING') {
    // Problem: Not enough players
    if (!game.participantsReady) {
      problems.push('games.results.problems.insufficientPlayers');
    }

    // Problem: Fixed teams not ready
    if (game.hasFixedTeams && !game.teamsReady) {
      problems.push('games.results.problems.fixedTeamsNotReady');
    }
  }

  // Problem: User doesn't have permission to edit
  if (!hasEditPermission) {
    problems.push('games.results.problems.noEditAccess');
  }

  // If there are problems, user cannot modify regardless of permissions
  if (problems.length > 0) {
    return {
      message: problems.join(' • '),
      canModify: false
    };
  }

  // No problems - user can modify if they have permission
  if (game.resultsStatus !== 'NONE') {
    return {
      message: hasEditPermission ? 'games.results.positive.canModifyResults' : 'games.results.positive.canViewResults',
      canModify: hasEditPermission
    };
  } else {
    return {
      message: hasEditPermission ? 'games.results.positive.canEnterResults' : 'games.results.positive.noResultsYet',
      canModify: hasEditPermission
    };
  }
};

/**
 * Checks if a user can edit game results based on the game state and user permissions
 * 
 * @param game - The game object
 * @param user - The user object
 * @returns boolean indicating if the user can edit results
 */
export const canUserEditResults = (game: Game, user: User | null): boolean => {
  const status = getGameResultStatus(game, user);
  return status?.canModify ?? false;
};

/**
 * Checks if a user can see/view a game based on game visibility and user permissions
 * 
 * @param game - The game object
 * @param user - The user object
 * @returns boolean indicating if the user can see the game
 */
export const canUserSeeGame = (game: Game, user: User | null): boolean => {
  if (!game) return false;

  // Public games are visible to everyone
  if (game.isPublic) return true;

  // If no user is provided, only public games are visible
  if (!user) return false;

  // Admin users can see all games
  if (user.isAdmin) return true;

  // Check if user is a participant or has parent access
  return isUserGameParticipant(game, user.id);
};

/**
 * Validates set index bounds
 * 
 * @param setIndex - The set index to validate
 * @returns Error message if invalid, null if valid
 */
export const validateSetIndex = (setIndex: number): string | null => {
  if (setIndex < 0) {
    return 'Invalid set index: negative values not allowed';
  }
  if (setIndex > 100) {
    return 'Invalid set index: too large';
  }
  return null;
};

/**
 * Validates set scores against game constraints
 * 
 * @param teamAScore - Team A score
 * @param teamBScore - Team B score
 * @param game - The game object with constraints
 * @returns Error message if invalid, null if valid
 */
export const validateSetScores = (
  teamAScore: number,
  teamBScore: number,
  game: Game | null
): string | null => {
  if (teamAScore < 0 || teamBScore < 0) {
    return 'Invalid scores: negative values not allowed';
  }

  const maxPointsPerTeam = game?.maxPointsPerTeam;
  if (maxPointsPerTeam && maxPointsPerTeam > 0) {
    if (teamAScore > maxPointsPerTeam || teamBScore > maxPointsPerTeam) {
      return `Score cannot exceed ${maxPointsPerTeam}`;
    }
  }

  const maxTotalPointsPerSet = game?.maxTotalPointsPerSet;
  if (maxTotalPointsPerSet && maxTotalPointsPerSet > 0) {
    if (teamAScore + teamBScore > maxTotalPointsPerSet) {
      return `Total score cannot exceed ${maxTotalPointsPerSet}`;
    }
  }

  return null;
};

/**
 * Validates set index against fixedNumberOfSets constraint
 * 
 * @param setIndex - The set index to validate
 * @param fixedNumberOfSets - The fixed number of sets (0 if not fixed)
 * @returns Error message if invalid, null if valid
 */
export const validateSetIndexAgainstFixed = (
  setIndex: number,
  fixedNumberOfSets: number
): string | null => {
  if (fixedNumberOfSets > 0 && setIndex >= fixedNumberOfSets) {
    return `Set index cannot exceed ${fixedNumberOfSets - 1}`;
  }
  return null;
};

/**
 * Determines if a set is the last set in a match
 * 
 * @param setIndex - The index of the set to check
 * @param sets - Array of all sets in the match
 * @param fixedNumberOfSets - The fixed number of sets (0 if not fixed)
 * @param setBeingUpdated - Optional: the set data being updated (to account for updates in progress)
 * @returns boolean indicating if this is the last set
 */
export const isLastSet = (
  setIndex: number,
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>,
  fixedNumberOfSets: number,
  setBeingUpdated?: { teamA: number; teamB: number; isTieBreak?: boolean }
): boolean => {
  if (fixedNumberOfSets > 0) {
    return setIndex === fixedNumberOfSets - 1;
  }

  // For dynamic sets, find the last set with scores
  // Create effective sets array with updated data if provided
  const effectiveSets = sets.map((set, idx) => {
    if (idx === setIndex && setBeingUpdated) {
      return setBeingUpdated;
    }
    return set;
  });

  // Find all valid sets (with scores > 0)
  const validSetIndices: number[] = [];
  for (let i = 0; i < effectiveSets.length; i++) {
    const set = effectiveSets[i];
    if (set.teamA > 0 || set.teamB > 0) {
      validSetIndices.push(i);
    }
  }

  // If no valid sets exist, the first set (index 0) is considered the last set
  if (validSetIndices.length === 0) {
    return setIndex === 0;
  }

  // The last set is the highest index among valid sets
  const lastValidSetIndex = Math.max(...validSetIndices);
  return setIndex === lastValidSetIndex;
};

/**
 * Checks if previous sets are equally won by both teams
 * 
 * @param setIndex - The index of the set to check
 * @param sets - Array of all sets in the match
 * @param setBeingUpdated - Optional: the set data being updated
 * @returns boolean indicating if previous sets are tied
 */
const arePreviousSetsTied = (
  setIndex: number,
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>,
  setBeingUpdated?: { teamA: number; teamB: number; isTieBreak?: boolean }
): boolean => {
  if (setIndex < 2) {
    return false; // Need at least 2 previous sets (0 and 1) for 3rd set (index 2)
  }

  // Create effective sets array with updated data if provided
  const effectiveSets = sets.map((set, idx) => {
    if (idx === setIndex && setBeingUpdated) {
      return setBeingUpdated;
    }
    return set;
  });

  let teamAWins = 0;
  let teamBWins = 0;

  // Count wins in previous sets (before setIndex)
  for (let i = 0; i < setIndex; i++) {
    const set = effectiveSets[i];
    if (set && (set.teamA > 0 || set.teamB > 0)) {
      if (set.teamA > set.teamB) {
        teamAWins++;
      } else if (set.teamB > set.teamA) {
        teamBWins++;
      }
    }
  }

  return teamAWins === teamBWins;
};

/**
 * Validates TieBreak rules for a set
 * 
 * @param setIndex - The index of the set
 * @param sets - Array of all sets in the match
 * @param fixedNumberOfSets - The fixed number of sets (0 if not fixed)
 * @param isTieBreak - Whether this set is being marked as a tiebreak
 * @param ballsInGames - Whether the game uses balls in games (required for tiebreak)
 * @param setBeingUpdated - Optional: the set data being updated
 * @returns Error message if invalid, null if valid
 */
export const validateTieBreak = (
  setIndex: number,
  sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>,
  fixedNumberOfSets: number,
  isTieBreak: boolean,
  ballsInGames: boolean,
  setBeingUpdated?: { teamA: number; teamB: number; isTieBreak?: boolean }
): string | null => {
  if (!isTieBreak) {
    return null; // No validation needed if not setting tiebreak
  }

  if (!ballsInGames) {
    return 'TieBreak can only be set when ballsInGames is enabled';
  }

  // Check if this is an odd set starting from 3rd (setIndex 2, 4, 6, 8)
  // 3rd set = index 2, 5th set = index 4, 7th set = index 6, 9th set = index 8
  const isOddSetFromThird = setIndex >= 2 && (setIndex - 2) % 2 === 0;
  if (!isOddSetFromThird) {
    return 'TieBreak can only be set on the 3rd, 5th, 7th, or 9th set';
  }

  // Check if previous sets are equally won by both teams
  if (!arePreviousSetsTied(setIndex, sets, setBeingUpdated)) {
    return 'TieBreak can only be set when previous sets are equally won by both teams';
  }

  // Check if scores are equal (tiebreak cannot have equal scores)
  const currentSet = setBeingUpdated || sets[setIndex];
  if (currentSet && currentSet.teamA === currentSet.teamB && (currentSet.teamA > 0 || currentSet.teamB > 0)) {
    return 'TieBreak sets cannot have equal scores';
  }

  // Check if this is the last set
  if (!isLastSet(setIndex, sets, fixedNumberOfSets, setBeingUpdated)) {
    return 'TieBreak can only be set on the last set of a match';
  }

  // Check if there's already a tiebreak in another set
  const hasExistingTieBreak = sets.some((set, idx) => {
    if (idx === setIndex) {
      // Skip the set being updated, but check if it was previously a tiebreak
      return false;
    }
    return set.isTieBreak === true;
  });

  if (hasExistingTieBreak) {
    return 'Only one TieBreak can exist per match';
  }

  return null;
};