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
import { TransactionType } from '@prisma/client';

// Auth endpoints
export const loginAdmin = asyncHandler(async (req: Request, res: Response) => {
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
  const { name, country, timezone, isActive } = req.body;

  const city = await AdminLocationsService.createCity({
    name,
    country,
    timezone,
    isActive,
  });

  res.status(201).json({
    success: true,
    data: city,
  });
});

export const updateCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.params;
  const { name, country, timezone, isActive } = req.body;

  const city = await AdminLocationsService.updateCity(cityId, {
    name,
    country,
    timezone,
    isActive,
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
