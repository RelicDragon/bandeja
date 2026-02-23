import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as trainersController from '../controllers/trainers.controller';

const router = Router();

router.get('/:trainerId/reviews', authenticate, trainersController.getTrainerReviews);

export default router;
