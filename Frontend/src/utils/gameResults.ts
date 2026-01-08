import { Game, User } from '@/types';

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
      (p) => p.userId === user.id && p.isPlaying
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

  // Problem: Game hasn't started yet
  if (game.status === 'ANNOUNCED') {
    problems.push('games.results.problems.gameNotStarted');
  }

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
  if (!hasEditPermission && game.status !== 'ANNOUNCED') {
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