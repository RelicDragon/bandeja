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

  // Problem: Not enough players
  if (!game.participantsReady) {
    problems.push('games.results.problems.insufficientPlayers');
  }

  // Problem: Fixed teams not ready
  if (game.hasFixedTeams && !game.teamsReady) {
    problems.push('games.results.problems.fixedTeamsNotReady');
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