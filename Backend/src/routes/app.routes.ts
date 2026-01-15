import { Router } from 'express';
import * as appController from '../controllers/app.controller';

const router = Router();

router.get('/version-check', appController.checkVersion);

export default router;
