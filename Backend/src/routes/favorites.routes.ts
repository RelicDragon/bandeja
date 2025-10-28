import { Router } from 'express';
import { addToFavorites, removeFromFavorites, getUserFavorites, checkIfFavorite } from '../controllers/favorites.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', addToFavorites);
router.get('/', getUserFavorites);
router.get('/check/:clubId', checkIfFavorite);
router.delete('/:clubId', removeFromFavorites);

export default router;
