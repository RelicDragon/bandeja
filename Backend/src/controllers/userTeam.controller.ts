import { Response } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { UserTeamService } from '../services/userTeam.service';

export const createTeamValidators = [
  body('name').optional().trim().isString().isLength({ min: 3, max: 120 }),
  body('verbalStatus').optional({ nullable: true }).trim().isString().isLength({ max: 32 }),
  body('avatar').optional({ nullable: true }).isString(),
  body('originalAvatar').optional({ nullable: true }).isString(),
];

export const updateTeamValidators = [
  body('name').optional().trim().isString().isLength({ min: 3, max: 120 }),
  body('verbalStatus').optional({ nullable: true }).trim().isString().isLength({ max: 32 }),
  body('avatar').optional({ nullable: true }).isString(),
  body('originalAvatar').optional({ nullable: true }).isString(),
  body('cutAngle').optional().isFloat({ min: 0, max: 360 }),
];

export const inviteMemberValidators = [body('userId').notEmpty().withMessage('userId required')];

export const createTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const team = await UserTeamService.createTeam(req.userId!, req.body);
  res.status(201).json({ success: true, data: team });
});

export const getMyTeams = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await UserTeamService.getMyTeams(req.userId!);
  res.json({ success: true, data });
});

export const getMyMemberships = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await UserTeamService.getMyMemberships(req.userId!);
  res.json({ success: true, data });
});

export const listTeamsForPlayerInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await UserTeamService.listTeamsForPlayerInvite(req.userId!);
  res.json({ success: true, data });
});

export const getTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await UserTeamService.getTeamForUser(id, req.userId!);
  res.json({ success: true, data });
});

export const updateTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await UserTeamService.updateTeam(id, req.userId!, req.body);
  res.json({ success: true, data });
});

export const deleteTeam = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await UserTeamService.deleteTeam(id, req.userId!);
  res.json({ success: true, data: { deleted: true } });
});

export const inviteMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) throw new ApiError(400, 'errors.userTeams.userIdRequired');
  const data = await UserTeamService.inviteMember(id, req.userId!, userId);
  res.json({ success: true, data });
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await UserTeamService.acceptInvite(id, req.userId!);
  res.json({ success: true, data });
});

export const declineInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = await UserTeamService.declineInvite(id, req.userId!);
  res.json({ success: true, data });
});

export const removeMember = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId } = req.params;
  const data = await UserTeamService.removeMember(id, req.userId!, userId);
  res.json({ success: true, data });
});
