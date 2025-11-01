import { Router } from 'express';
import { addToFavorites, removeFromFavorites, getUserFavorites, checkIfFavorite, addUserToFavorites, removeUserFromFavorites, checkIfUserFavorite } from '../controllers/favorites.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', addToFavorites);
router.get('/', getUserFavorites);
router.get('/check/:clubId', checkIfFavorite);
router.delete('/:clubId', removeFromFavorites);

router.post('/users', addUserToFavorites);
router.get('/users/check/:userId', checkIfUserFavorite);
router.delete('/users/:userId', removeUserFromFavorites);

export default router;
