import { Router } from 'express';
import { blockUser, unblockUser, getBlockedUserIds, getBlockedUsers, checkIfUserBlocked, checkIfBlockedByUser } from '../controllers/blockedUsers.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', blockUser);
router.get('/', getBlockedUserIds);
router.get('/list', getBlockedUsers);
router.get('/check/:userId', checkIfUserBlocked);
router.get('/check-blocked-by/:userId', checkIfBlockedByUser);
router.delete('/:userId', unblockUser);

export default router;

