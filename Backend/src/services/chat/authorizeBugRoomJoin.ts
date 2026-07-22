import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';

export type BugRoomJoinAuth =
  | { ok: true }
  | { ok: false; message: string; code?: string };

/** Same access rules as HTTP bug chat read (`validateBugAccess`). */
export async function authorizeBugRoomJoin(
  bugId: unknown,
  userId: string | undefined
): Promise<BugRoomJoinAuth> {
  if (!userId) {
    return { ok: false, message: 'Unauthorized', code: 'auth.notAuthenticated' };
  }
  if (typeof bugId !== 'string' || !bugId) {
    return { ok: false, message: 'Invalid bug id', code: 'bug.invalidId' };
  }
  try {
    await MessageService.validateBugAccess(bugId, userId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Access denied to bug room';
    const code =
      err instanceof ApiError && typeof err.data?.code === 'string'
        ? err.data.code
        : 'bug.accessDenied';
    return { ok: false, message, code };
  }
}
