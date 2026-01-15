import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AppVersionService } from '../appVersion.service';

const SEMANTIC_VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

function isValidSemanticVersion(version: string): boolean {
  return SEMANTIC_VERSION_REGEX.test(version);
}

export class AdminAppVersionService {
  static async getAllVersionRequirements() {
    const requirements = await prisma.appVersionRequirement.findMany({
      orderBy: { platform: 'asc' },
    });
    return requirements;
  }

  static async createOrUpdateVersionRequirement(data: {
    platform: string;
    minBuildNumber: number;
    minVersion: string;
    isBlocking: boolean;
    message?: string;
  }) {
    const normalizedPlatform = data.platform.toLowerCase();

    if (normalizedPlatform !== 'ios' && normalizedPlatform !== 'android') {
      throw new ApiError(400, 'Platform must be either ios or android');
    }

    if (data.minBuildNumber <= 0) {
      throw new ApiError(400, 'Build number must be greater than 0');
    }

    if (!isValidSemanticVersion(data.minVersion)) {
      throw new ApiError(400, 'Version must follow semantic versioning format (e.g., 1.2.3)');
    }

    const requirement = await prisma.appVersionRequirement.upsert({
      where: { platform: normalizedPlatform },
      update: {
        minBuildNumber: data.minBuildNumber,
        minVersion: data.minVersion,
        isBlocking: data.isBlocking,
        message: data.message || null,
      },
      create: {
        platform: normalizedPlatform,
        minBuildNumber: data.minBuildNumber,
        minVersion: data.minVersion,
        isBlocking: data.isBlocking,
        message: data.message || null,
      },
    });

    AppVersionService.clearCache();

    return requirement;
  }

  static async deleteVersionRequirement(platform: string) {
    const normalizedPlatform = platform.toLowerCase();

    const requirement = await prisma.appVersionRequirement.findUnique({
      where: { platform: normalizedPlatform },
    });

    if (!requirement) {
      throw new ApiError(404, 'Version requirement not found');
    }

    await prisma.appVersionRequirement.delete({
      where: { platform: normalizedPlatform },
    });

    AppVersionService.clearCache();

    return { message: 'Version requirement deleted successfully' };
  }
}
