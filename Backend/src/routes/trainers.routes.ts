import { Router } from 'express';
import * as trainersController from '../controllers/trainers.controller';

const router = Router();

router.get('/:trainerId/reviews', trainersController.getTrainerReviews);

export default router;
