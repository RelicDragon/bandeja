import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { GameService } from '../services/game/game.service';
import { ParticipantService } from '../services/game/participant.service';
import { AdminService } from '../services/game/admin.service';
import { OwnershipService } from '../services/game/ownership.service';
import { BookedCourtsService } from '../services/game/bookedCourts.service';
import { ResultsTelegramService } from '../services/telegram/results-telegram.service';
import { generateResultsImage } from '../services/telegram/results-image.service';
import telegramBotService from '../services/telegram/bot.service';
import { getGameInclude } from '../services/game/read.service';
import prisma from '../config/database';

export const createGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const game = await GameService.createGame(req.body, req.userId!);

  res.status(201).json({
    success: true,
    data: game,
  });
});

export const getGameById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const game = await GameService.getGameById(id, req.userId);

  res.json({
    success: true,
    data: game,
    serverTime: new Date().toISOString(),
  });
});

export const getGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const games = await GameService.getGames(req.query, req.userId, req.user?.currentCityId);

  res.json({
    success: true,
    data: games,
    serverTime: new Date().toISOString(),
  });
});

export const getMyGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const games = await GameService.getMyGames(req.userId, req.user?.currentCityId);

  res.json({
    success: true,
    data: games,
    serverTime: new Date().toISOString(),
  });
});

export const getPastGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  const games = await GameService.getPastGames(req.userId, req.user?.currentCityId, limit, offset);

  res.json({
    success: true,
    data: games,
    serverTime: new Date().toISOString(),
  });
});

export const getAvailableGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const showArchived = req.query.showArchived === 'true';

  const games = await GameService.getAvailableGames(req.userId, req.user?.currentCityId, startDate, endDate, showArchived);

  res.json({
    success: true,
    data: games,
    serverTime: new Date().toISOString(),
  });
});

export const updateGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const game = await GameService.updateGame(id, req.body, req.userId!, req.user?.isAdmin);

  res.json({
    success: true,
    data: game,
  });
});

export const deleteGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await GameService.deleteGame(id);

  res.json({
    success: true,
    message: 'Game deleted successfully',
  });
});

export const joinGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.joinGame(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const leaveGame = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.leaveGame(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const joinAsGuest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const message = await ParticipantService.joinAsGuest(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const togglePlayingStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { isPlaying } = req.body;
  const message = await ParticipantService.togglePlayingStatus(id, req.userId!, isPlaying);

  res.json({
    success: true,
    message,
  });
});

export const addAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.addAdmin(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const revokeAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.revokeAdmin(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const kickUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await AdminService.kickUser(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const transferOwnership = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  const message = await OwnershipService.transferOwnership(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const acceptJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  
  // TODO: Remove after 2025-02-02 - Use ParticipantService directly
  const message = await ParticipantService.acceptNonPlayingParticipant(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const declineJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  
  // TODO: Remove after 2025-02-02 - Use ParticipantService directly
  const message = await ParticipantService.declineNonPlayingParticipant(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const cancelJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  // TODO: Remove after 2025-02-02 - Use ParticipantService directly
  const message = await ParticipantService.cancelNonPlayingParticipant(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});

export const getBookedCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clubId = req.query.clubId as string;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const courtId = req.query.courtId as string | undefined;

  if (!clubId) {
    throw new ApiError(400, 'Club ID is required');
  }

  const result = await BookedCourtsService.getBookedCourts(clubId, startDate, endDate, courtId);

  res.json({
    success: true,
    data: result.slots,
    isLoadingExternalSlots: result.isLoadingExternalSlots,
  });
});

export const sendResultsToTelegram = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const gameInclude = getGameInclude();
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      ...gameInclude,
      city: {
        select: {
          id: true,
          name: true,
          telegramGroupId: true,
          telegramPinnedLanguage: true,
        },
      },
    } as any,
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.resultsSentToTelegram) {
    throw new ApiError(400, 'Results have already been sent to Telegram');
  }

  const city = game.city as unknown as { id: string; telegramGroupId: string | null; telegramPinnedLanguage: string | null };
  if (!city.telegramGroupId) {
    throw new ApiError(400, 'City does not have a Telegram group configured');
  }

  if (game.photosCount === 0 && !game.mainPhotoId) {
    throw new ApiError(400, 'Game must have at least one photo');
  }

  const hasResults = ResultsTelegramService.checkResultsEntered(game);
  if (!hasResults) {
    throw new ApiError(400, 'Game must have at least one round with one match with non-zero scores');
  }

  if (!game.outcomes || game.outcomes.length === 0) {
    throw new ApiError(400, 'Game must have outcomes calculated');
  }

  const bot = telegramBotService.getBot();
  if (!bot) {
    throw new ApiError(503, 'Telegram bot is not available');
  }

  // Start background work and return immediately
  setImmediate(async () => {
    try {
      const language = city.telegramPinnedLanguage || 'en-US';
      const summaryText = await ResultsTelegramService.generateResultsSummary(game, language);
      const mainPhotoUrl = await ResultsTelegramService.getMainPhotoUrl(game);

      const imageBuffer = await generateResultsImage({
        id: game.id,
        affectsRating: game.affectsRating || false,
        outcomes: game.outcomes,
        hasFixedTeams: game.hasFixedTeams || false,
        genderTeams: game.genderTeams || 'ANY',
      }, language);

      await ResultsTelegramService.sendResultsToTelegram(
        bot.api,
        id,
        imageBuffer,
        mainPhotoUrl,
        summaryText
      );
    } catch (error: any) {
      console.error('Background Telegram send failed:', error);
    }
  });

  res.json({
    success: true,
    message: 'Sending results to Telegram',
  });
});
