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
  getAllClubs,
  createClub,
  updateClub,
  deleteClub,
  getAllCourts,
  createCourt,
  updateCourt,
  deleteCourt,
  getAllGames,
  getAllInvites,
  adminAcceptInvite,
  adminDeclineInvite,
  cleanupOldFiles,
  getStorageStats,
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

router.get('/cities', requireAdmin, getAllCities);
router.post('/cities', requireAdmin, createCity);
router.put('/cities/:cityId', requireAdmin, updateCity);
router.delete('/cities/:cityId', requireAdmin, deleteCity);

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

export default router;