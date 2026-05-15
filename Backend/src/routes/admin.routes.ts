import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  loginAdmin,
  getStats,
  getTranslationQueueStats,
  getOnlineUsers,
  getAllUsers,
  toggleUserStatus,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  mergeUsers,
  getAllCities,
  createCity,
  updateCity,
  deleteCity,
  recalculateCityCenter,
  recalculateAllCitiesCenter,
  getAllClubs,
  getAdminClubById,
  createClub,
  updateClub,
  deleteClub,
  getAllCourts,
  createCourt,
  updateCourt,
  deleteCourt,
  getAllGames,
  getGameById,
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
  sendMassNotification,
  getClubAdmins,
  assignClubAdmin,
  removeClubAdmin,
} from '../controllers/admin.controller';

const router = Router();

router.post('/login', loginAdmin);
router.get('/stats', requireAdmin, getStats);
router.get('/translation-queue/stats', requireAdmin, getTranslationQueueStats);
router.get('/online-users', requireAdmin, getOnlineUsers);

router.get('/users', requireAdmin, getAllUsers);
router.post('/users', requireAdmin, createUser);
router.put('/users/:userId', requireAdmin, updateUser);
router.patch('/users/:userId/toggle-status', requireAdmin, toggleUserStatus);
router.post('/users/:userId/reset-password', requireAdmin, resetUserPassword);
router.delete('/users/:userId', requireAdmin, deleteUser);
router.post('/users/merge', requireAdmin, mergeUsers);

router.get('/games', requireAdmin, getAllGames);
router.get('/games/:gameId', requireAdmin, getGameById);
router.post('/games/:gameId/reset-results', requireAdmin, resetGameResults);

router.get('/cities', requireAdmin, getAllCities);
router.post('/cities', requireAdmin, createCity);
router.post('/cities/recalculate-all-centers', requireAdmin, recalculateAllCitiesCenter);
router.put('/cities/:cityId', requireAdmin, updateCity);
router.delete('/cities/:cityId', requireAdmin, deleteCity);
router.post('/cities/:cityId/recalculate-center', requireAdmin, recalculateCityCenter);

router.get('/clubs', requireAdmin, getAllClubs);
router.get('/clubs/:centerId', requireAdmin, getAdminClubById);
router.post('/clubs', requireAdmin, createClub);
router.put('/clubs/:centerId', requireAdmin, updateClub);
router.delete('/clubs/:centerId', requireAdmin, deleteClub);

router.get('/clubs/:clubId/admins', requireAdmin, getClubAdmins);
router.post(
  '/clubs/:clubId/admins',
  requireAdmin,
  validate([body('userId').notEmpty()]),
  assignClubAdmin
);
router.delete('/clubs/:clubId/admins/:userId', requireAdmin, removeClubAdmin);

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
router.post(
  '/app-versions',
  requireAdmin,
  validate([
    body('platform').isIn(['ios', 'android', 'iOS', 'Android']).withMessage('Platform must be ios or android'),
    body('minBuildNumber').isInt({ min: 1 }).withMessage('Build number must be a positive integer'),
    body('minVersion')
      .isString()
      .matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/)
      .withMessage('Version must follow semantic versioning format (e.g., 1.2.3)'),
    body('isBlocking').isBoolean().withMessage('isBlocking must be a boolean'),
    body('message').optional({ nullable: true }).isString().isLength({ max: 500 }),
  ]),
  createOrUpdateAppVersion
);
router.delete(
  '/app-versions/:platform',
  requireAdmin,
  validate([param('platform').isIn(['ios', 'android', 'iOS', 'Android'])]),
  deleteAppVersion
);

router.get('/market-categories', requireAdmin, getMarketCategories);
router.post('/market-categories', requireAdmin, createMarketCategory);
router.put('/market-categories/:categoryId', requireAdmin, updateMarketCategory);
router.delete('/market-categories/:categoryId', requireAdmin, deleteMarketCategory);

router.post('/mass-notification', requireAdmin, sendMassNotification);

export default router;