import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GameTeamService } from '../services/gameTeam.service';
import { attachUserTeamsToFixedTeams, attachUserTeamsToTeamList } from '../services/game/fixedTeamUserTeam';

export const setGameTeams = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const { teams, openEndedList } = req.body;

    const saved = await GameTeamService.setGameTeams(gameId, teams, { openEndedList: openEndedList === true });
    // Same `fixedTeams[].userTeam` as the game detail, so the client can swap the game in place.
    const result = saved ? await attachUserTeamsToFixedTeams(saved) : saved;

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getGameTeams = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;

    const rows = await GameTeamService.getGameTeams(gameId);
    // Signed-in only, like the game detail's `fixedTeams[].userTeam`.
    const teams = req.userId ? await attachUserTeamsToTeamList(rows) : rows;

    res.status(200).json({
      success: true,
      data: teams,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteGameTeams = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;

    await GameTeamService.deleteGameTeams(gameId);

    res.status(200).json({
      success: true,
      message: 'Fixed pairs deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

