import { Camera } from '@capacitor/camera';
import { isCapacitor } from './capacitor';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'limited';

export interface PermissionResult {
  status: PermissionStatus;
  canRequest: boolean;
}

export async function checkPhotoPermission(): Promise<PermissionResult> {
  if (!isCapacitor()) {
    return { status: 'granted', canRequest: false };
  }

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<PermissionResult>((_, reject) => {
      setTimeout(() => reject(new Error('Permission check timeout')), 5000);
    });

    const checkPromise = Camera.checkPermissions().then((result) => {
      const photosStatus = result.photos || 'prompt';

      if (photosStatus === 'granted') {
        return { status: 'granted' as PermissionStatus, canRequest: false };
      }

      if (photosStatus === 'denied') {
        return { status: 'denied' as PermissionStatus, canRequest: false };
      }

      // iOS 14+ limited access
      if (photosStatus === 'limited') {
        return { status: 'limited' as PermissionStatus, canRequest: false };
      }

      return { status: 'prompt' as PermissionStatus, canRequest: true };
    });

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    console.error('Error checking photo permission:', error);
    // Default to prompt on error (safer than denying)
    return { status: 'prompt', canRequest: true };
  }
}

export async function requestPhotoPermission(): Promise<PermissionResult> {
  if (!isCapacitor()) {
    return { status: 'granted', canRequest: false };
  }

  try {
    const result = await Camera.requestPermissions({ permissions: ['photos'] });
    const photosStatus = result.photos || 'prompt';

    if (photosStatus === 'granted') {
      return { status: 'granted', canRequest: false };
    }

    if (photosStatus === 'denied') {
      return { status: 'denied', canRequest: false };
    }

    // iOS 14+ limited access
    if (photosStatus === 'limited') {
      return { status: 'limited', canRequest: false };
    }

    return { status: 'prompt', canRequest: true };
  } catch (error) {
    console.error('Error requesting photo permission:', error);
    return { status: 'prompt', canRequest: true };
  }
}
