import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import {
  completeSportQuestionnaire,
  getSportQuestionnaireStatus,
  rejectSocialLevelInQuestionnaireBody,
  resetSportQuestionnaire,
  skipSportQuestionnaire,
} from '../../services/user/sportQuestionnaire.service';
import { loadProfileUser, parseSportParam } from '../../services/user/userSportProfile.service';
import { disableConditionalHttpCache } from '../../utils/httpCache';

export const completeSportQuestionnaireHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  rejectSocialLevelInQuestionnaireBody(req.body);
  const sport = parseSportParam(req.params.sport);
  const { answers } = req.body as { answers: string[] };
  await completeSportQuestionnaire(req.userId!, sport, answers, req.body as Record<string, unknown>);
  const user = await loadProfileUser(req.userId!);
  res.json({ success: true, data: user });
});

export const skipSportQuestionnaireHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  rejectSocialLevelInQuestionnaireBody(req.body);
  const sport = parseSportParam(req.params.sport);
  await skipSportQuestionnaire(req.userId!, sport, req.body as Record<string, unknown>);
  const user = await loadProfileUser(req.userId!);
  res.json({ success: true, data: user });
});

export const getSportQuestionnaireStatusHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  disableConditionalHttpCache(req, res);
  const sport = parseSportParam(req.params.sport);
  const status = await getSportQuestionnaireStatus(req.userId!, sport);
  res.json({ success: true, data: status });
});

export const resetSportQuestionnaireHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sport = parseSportParam(req.params.sport);
  const user = await resetSportQuestionnaire(req.userId!, sport);
  res.json({ success: true, data: user });
});
