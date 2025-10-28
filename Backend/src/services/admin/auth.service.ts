import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { generateToken } from '../../utils/jwt';
import { comparePassword } from '../../utils/hash';

export class AdminAuthService {
  static async loginAdmin(phone: string, password: string) {
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

    const token = generateToken({ userId: user.id, phone: user.phone!, isAdmin: true });

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
      token,
    };
  }
}
