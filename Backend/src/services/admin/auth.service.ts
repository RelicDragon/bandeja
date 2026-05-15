import type { Request } from 'express';
import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { comparePassword } from '../../utils/hash';
import { issueAdminPanelLoginTokens, jwtPayloadFromAuthUser } from '../auth/authIssuance.service';

export class AdminAuthService {
  static async loginAdmin(phone: string, password: string, req: Request) {
    const user = await prisma.user.findUnique({
      where: { phone },
    });

    if (!user || !user.passwordHash || !user.isAdmin) {
      throw new ApiError(401, 'Invalid admin credentials');
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Invalid admin credentials');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is inactive');
    }

    const issued = await issueAdminPanelLoginTokens(
      jwtPayloadFromAuthUser({
        id: user.id,
        phone: user.phone,
        isAdmin: user.isAdmin,
      }),
      req
    );

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        isTrainer: user.isTrainer,
      },
      token: issued.token,
      refreshToken: issued.refreshToken,
      currentSessionId: issued.currentSessionId,
    };
  }
}
