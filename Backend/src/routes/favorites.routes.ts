import { Router } from 'express';
import { addToFavorites, removeFromFavorites, getUserFavorites, checkIfFavorite, addUserToFavorites, removeUserFromFavorites, checkIfUserFavorite, getUserFavoriteUserIds } from '../controllers/favorites.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', addToFavorites);
router.get('/', getUserFavorites);
router.get('/check/:clubId', checkIfFavorite);
router.delete('/:clubId', removeFromFavorites);

router.post('/users', addUserToFavorites);
router.get('/users/check/:userId', checkIfUserFavorite);
router.get('/users', getUserFavoriteUserIds);
router.delete('/users/:userId', removeUserFromFavorites);

export default router;
