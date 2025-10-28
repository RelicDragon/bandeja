import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { GameTeamService } from '../services/gameTeam.service';

export const setGameTeams = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { gameId } = req.params;
    const { teams } = req.body;
    const userId = req.userId!;

    const result = await GameTeamService.setGameTeams(gameId, teams, userId);

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

    const teams = await GameTeamService.getGameTeams(gameId);

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
    const userId = req.userId!;

    await GameTeamService.deleteGameTeams(gameId, userId);

    res.status(200).json({
      success: true,
      message: 'Fixed teams deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

