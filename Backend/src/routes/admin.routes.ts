import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import {
  loginAdmin,
  getStats,
  getAllUsers,
  toggleUserStatus,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  getAllCities,
  createCity,
  updateCity,
  deleteCity,
  recalculateCityCenter,
  recalculateAllCitiesCenter,
  getAllClubs,
  createClub,
  updateClub,
  deleteClub,
  getAllCourts,
  createCourt,
  updateCourt,
  deleteCourt,
  getAllGames,
  resetGameResults,
  getAllInvites,
  adminAcceptInvite,
  adminDeclineInvite,
  cleanupOldFiles,
  getStorageStats,
  emitCoins,
  dropCoins,
  getAllMessageReports,
  updateMessageReportStatus,
  getAllAppVersions,
  createOrUpdateAppVersion,
  deleteAppVersion,
  getMarketCategories,
  createMarketCategory,
  updateMarketCategory,
  deleteMarketCategory,
} from '../controllers/admin.controller';

const router = Router();

router.post('/login', loginAdmin);
router.get('/stats', requireAdmin, getStats);

router.get('/users', requireAdmin, getAllUsers);
router.post('/users', requireAdmin, createUser);
router.put('/users/:userId', requireAdmin, updateUser);
router.patch('/users/:userId/toggle-status', requireAdmin, toggleUserStatus);
router.post('/users/:userId/reset-password', requireAdmin, resetUserPassword);
router.delete('/users/:userId', requireAdmin, deleteUser);

router.get('/games', requireAdmin, getAllGames);
router.post('/games/:gameId/reset-results', requireAdmin, resetGameResults);

router.get('/cities', requireAdmin, getAllCities);
router.post('/cities', requireAdmin, createCity);
router.post('/cities/recalculate-all-centers', requireAdmin, recalculateAllCitiesCenter);
router.put('/cities/:cityId', requireAdmin, updateCity);
router.delete('/cities/:cityId', requireAdmin, deleteCity);
router.post('/cities/:cityId/recalculate-center', requireAdmin, recalculateCityCenter);

router.get('/clubs', requireAdmin, getAllClubs);
router.post('/clubs', requireAdmin, createClub);
router.put('/clubs/:centerId', requireAdmin, updateClub);
router.delete('/clubs/:centerId', requireAdmin, deleteClub);

router.get('/courts', requireAdmin, getAllCourts);
router.post('/courts', requireAdmin, createCourt);
router.put('/courts/:courtId', requireAdmin, updateCourt);
router.delete('/courts/:courtId', requireAdmin, deleteCourt);

router.get('/invites', requireAdmin, getAllInvites);
router.post('/invites/:inviteId/accept', requireAdmin, adminAcceptInvite);
router.post('/invites/:inviteId/decline', requireAdmin, adminDeclineInvite);

router.post('/media/cleanup', requireAdmin, cleanupOldFiles);
router.get('/media/stats', requireAdmin, getStorageStats);

router.post('/users/:userId/emit-coins', requireAdmin, emitCoins);
router.post('/coins/drop', requireAdmin, dropCoins);

router.get('/message-reports', requireAdmin, getAllMessageReports);
router.patch('/message-reports/:reportId/status', requireAdmin, updateMessageReportStatus);

router.get('/app-versions', requireAdmin, getAllAppVersions);
router.post('/app-versions', requireAdmin, createOrUpdateAppVersion);
router.delete('/app-versions/:platform', requireAdmin, deleteAppVersion);

router.get('/market-categories', requireAdmin, getMarketCategories);
router.post('/market-categories', requireAdmin, createMarketCategory);
router.put('/market-categories/:categoryId', requireAdmin, updateMarketCategory);
router.delete('/market-categories/:categoryId', requireAdmin, deleteMarketCategory);

export default router;