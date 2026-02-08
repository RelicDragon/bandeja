import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { AdminAuthService } from '../services/admin/auth.service';
import { AdminGamesService } from '../services/admin/games.service';
import { AdminLocationsService } from '../services/admin/locations.service';
import { AdminMediaService } from '../services/admin/media.service';
import { AdminStatsService } from '../services/admin/stats.service';
import { AdminUsersService } from '../services/admin/users.service';
import { TransactionService } from '../services/transaction.service';
import { TransactionType, MessageReportStatus } from '@prisma/client';
import { AdminMessageReportsService } from '../services/admin/messageReports.service';
import { AdminAppVersionService } from '../services/admin/appVersion.service';
import { AdminMarketCategoryService } from '../services/admin/marketCategory.service';

// Auth endpoints
export const loginAdmin = asyncHandler(async (req: Request, res: Response) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const { phone, password } = req.body;

  const result = await AdminAuthService.loginAdmin(phone, password);

  res.json({
    success: true,
    data: result,
  });
});

// Game Management endpoints
export const getAllGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.query;

  const games = await AdminGamesService.getAllGames(cityId as string);

  res.json({
    success: true,
    data: games,
  });
});

export const resetGameResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const result = await AdminGamesService.resetGameResults(gameId, req.userId!);

  const socketService = (global as any).socketService;
  if (socketService) {
    await socketService.emitGameUpdate(gameId, req.userId!);
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const getAllInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.query;

  const invites = await AdminGamesService.getAllInvites(cityId as string);

  res.json({
    success: true,
    data: invites,
  });
});

export const adminAcceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { inviteId } = req.params;

  const result = await AdminGamesService.acceptInvite(inviteId);

  if (result.gameId) {
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emitGameUpdate(result.gameId, req.userId!);
    }
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const adminDeclineInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { inviteId } = req.params;

  const result = await AdminGamesService.declineInvite(inviteId);

  res.json({
    success: true,
    message: result.message,
  });
});

// Location Management endpoints
export const getAllCities = asyncHandler(async (req: AuthRequest, res: Response) => {
  const cities = await AdminLocationsService.getAllCities();

  res.json({
    success: true,
    data: cities,
  });
});

export const createCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, country, timezone, isActive, subAdministrativeArea, administrativeArea } = req.body;

  const city = await AdminLocationsService.createCity({
    name,
    country,
    timezone,
    isActive,
    subAdministrativeArea,
    administrativeArea,
  });

  res.status(201).json({
    success: true,
    data: city,
  });
});

export const updateCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.params;
  const { name, country, timezone, isActive, subAdministrativeArea, administrativeArea } = req.body;

  const city = await AdminLocationsService.updateCity(cityId, {
    name,
    country,
    timezone,
    isActive,
    subAdministrativeArea,
    administrativeArea,
  });

  res.json({
    success: true,
    data: city,
  });
});

export const deleteCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.params;

  const result = await AdminLocationsService.deleteCity(cityId);

  res.json({
    success: true,
    message: result.message,
  });
});

export const recalculateCityCenter = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.params;
  const city = await AdminLocationsService.recalculateCityCenter(cityId);
  res.json({ success: true, data: city });
});

export const recalculateAllCitiesCenter = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await AdminLocationsService.recalculateAllCitiesCenter();
  res.json({ success: true, data: result });
});

export const getAllClubs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.query;

  const centers = await AdminLocationsService.getAllClubs(cityId as string);

  res.json({
    success: true,
    data: centers,
  });
});

export const createClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    name,
    description,
    address,
    cityId,
    phone,
    email,
    website,
    latitude,
    longitude,
    openingTime,
    closingTime,
    amenities,
    isActive,
    isBar,
    isForPlaying,
  } = req.body;

  const center = await AdminLocationsService.createClub({
    name,
    description,
    address,
    cityId,
    phone,
    email,
    website,
    latitude,
    longitude,
    openingTime,
    closingTime,
    amenities,
    isActive,
    isBar,
    isForPlaying,
  });

  res.status(201).json({
    success: true,
    data: center,
  });
});

export const updateClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { centerId } = req.params;
  const {
    name,
    description,
    address,
    cityId,
    phone,
    email,
    website,
    latitude,
    longitude,
    openingTime,
    closingTime,
    amenities,
    isActive,
    isBar,
    isForPlaying,
  } = req.body;

  const center = await AdminLocationsService.updateClub(centerId, {
    name,
    description,
    address,
    cityId,
    phone,
    email,
    website,
    latitude,
    longitude,
    openingTime,
    closingTime,
    amenities,
    isActive,
    isBar,
    isForPlaying,
  });

  res.json({
    success: true,
    data: center,
  });
});

export const deleteClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { centerId } = req.params;

  const result = await AdminLocationsService.deleteClub(centerId);

  res.json({
    success: true,
    message: result.message,
  });
});

export const getAllCourts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { centerId } = req.query;

  const courts = await AdminLocationsService.getAllCourts(centerId as string);

  res.json({
    success: true,
    data: courts,
  });
});

export const createCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    name,
    clubId,
    courtType,
    isIndoor,
    surfaceType,
    pricePerHour,
    isActive,
  } = req.body;

  const court = await AdminLocationsService.createCourt({
    name,
    clubId,
    courtType,
    isIndoor,
    surfaceType,
    pricePerHour,
    isActive,
  });

  res.status(201).json({
    success: true,
    data: court,
  });
});

export const updateCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courtId } = req.params;
  const {
    name,
    clubId,
    courtType,
    isIndoor,
    surfaceType,
    pricePerHour,
    isActive,
  } = req.body;

  const court = await AdminLocationsService.updateCourt(courtId, {
    name,
    clubId,
    courtType,
    isIndoor,
    surfaceType,
    pricePerHour,
    isActive,
  });

  res.json({
    success: true,
    data: court,
  });
});

export const deleteCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courtId } = req.params;

  const result = await AdminLocationsService.deleteCourt(courtId);

  res.json({
    success: true,
    message: result.message,
  });
});

// Media Management endpoints
export const cleanupOldFiles = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { maxAgeInDays = 30 } = req.body;
  
  const result = await AdminMediaService.cleanupOldFiles(maxAgeInDays);
  
  res.status(200).json({
    success: true,
    message: result.message
  });
});

export const getStorageStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await AdminMediaService.getStorageStats();
  
  res.status(200).json({
    success: true,
    data: stats
  });
});

// Stats endpoints
export const getStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.query;

  const stats = await AdminStatsService.getStats(cityId as string);

  res.json({
    success: true,
    data: stats,
  });
});

// User Management endpoints
export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.query;

  const users = await AdminUsersService.getAllUsers(cityId as string);

  res.json({
    success: true,
    data: users,
  });
});

export const toggleUserStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const updatedUser = await AdminUsersService.toggleUserStatus(userId);

  res.json({
    success: true,
    data: updatedUser,
  });
});

export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    phone,
    email,
    firstName,
    lastName,
    gender,
    level,
    currentCityId,
    isActive,
    isAdmin,
    isTrainer,
    canCreateTournament,
    canCreateLeague,
  } = req.body;

  const user = await AdminUsersService.createUser({
    phone,
    email,
    firstName,
    lastName,
    gender,
    level,
    currentCityId,
    isActive,
    isAdmin,
    isTrainer,
    canCreateTournament,
    canCreateLeague,
  });

  res.status(201).json({
    success: true,
    data: user,
  });
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const {
    phone,
    email,
    firstName,
    lastName,
    gender,
    level,
    currentCityId,
    isActive,
    isAdmin,
    isTrainer,
    canCreateTournament,
    canCreateLeague,
  } = req.body;

  const user = await AdminUsersService.updateUser(userId, {
    phone,
    email,
    firstName,
    lastName,
    gender,
    level,
    currentCityId,
    isActive,
    isAdmin,
    isTrainer,
    canCreateTournament,
    canCreateLeague,
  });

  res.json({
    success: true,
    data: user,
  });
});

export const resetUserPassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  const result = await AdminUsersService.resetUserPassword(userId, newPassword);

  res.json({
    success: true,
    message: result.message,
  });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const result = await AdminUsersService.deleteUser(userId);

  res.json({
    success: true,
    message: result.message,
  });
});

export const emitCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { amount, description } = req.body;

  if (!amount) {
    return res.status(400).json({
      success: false,
      message: 'Amount is required',
    });
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be a positive integer',
    });
  }

  const transaction = await TransactionService.createTransaction({
    type: TransactionType.NEW_COIN,
    toUserId: userId,
    transactionRows: [
      {
        name: description || 'Admin coin emission',
        price: amount,
        qty: 1,
      },
    ],
  });

  res.status(201).json({
    success: true,
    data: transaction,
  });
});

export const dropCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount, description } = req.body;
  const { cityId } = req.query;

  if (!amount) {
    return res.status(400).json({
      success: false,
      message: 'Amount is required',
    });
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be a positive integer',
    });
  }

  const results = await TransactionService.dropCoins(
    amount,
    description,
    cityId as string | undefined
  );

  res.status(200).json({
    success: true,
    data: results,
    message: `Coins dropped to ${results.successful} out of ${results.totalUsers} users`,
  });
});

export const getAllMessageReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;

  const reports = await AdminMessageReportsService.getAllReports(
    status ? (status as MessageReportStatus) : undefined
  );

  res.json({
    success: true,
    data: reports,
  });
});

export const updateMessageReportStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reportId } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(MessageReportStatus).includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Valid status is required',
    });
  }

  const report = await AdminMessageReportsService.updateReportStatus(reportId, status as MessageReportStatus);

  res.json({
    success: true,
    data: report,
  });
});

export const getAllAppVersions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const versions = await AdminAppVersionService.getAllVersionRequirements();

  res.json({
    success: true,
    data: versions,
  });
});

export const createOrUpdateAppVersion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { platform, minBuildNumber, minVersion, isBlocking, message } = req.body;

  const version = await AdminAppVersionService.createOrUpdateVersionRequirement({
    platform,
    minBuildNumber,
    minVersion,
    isBlocking,
    message,
  });

  res.json({
    success: true,
    data: version,
  });
});

export const deleteAppVersion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { platform } = req.params;

  const result = await AdminAppVersionService.deleteVersionRequirement(platform);

  res.json({
    success: true,
    message: result.message,
  });
});

export const getMarketCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categories = await AdminMarketCategoryService.getAll();
  res.json({ success: true, data: categories });
});

export const createMarketCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, order, isActive } = req.body;
  const category = await AdminMarketCategoryService.create({ name, order, isActive });
  res.status(201).json({ success: true, data: category });
});

export const updateMarketCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { categoryId } = req.params;
  const { name, order, isActive } = req.body;
  const category = await AdminMarketCategoryService.update(categoryId, {
    name,
    order,
    isActive,
  });
  res.json({ success: true, data: category });
});

export const deleteMarketCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { categoryId } = req.params;
  const result = await AdminMarketCategoryService.delete(categoryId);
  res.json({ success: true, message: result.message });
});
