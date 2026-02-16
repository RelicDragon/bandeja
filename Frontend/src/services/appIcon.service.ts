import { isCapacitor } from '@/utils/capacitor';
import type { AppIconId } from '@/config/appIcons';

const NATIVE_ALTERNATE_NAME = 'racket';

export async function setNativeAppIcon(appIconId: AppIconId): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { AppIcon } = await import('@capacitor-community/app-icon');
    const supported = await AppIcon.isSupported();
    if (!supported?.value) return;
    if (appIconId === 'tiger') {
      await AppIcon.reset({ suppressNotification: true, disable: [NATIVE_ALTERNATE_NAME] });
    } else {
      await AppIcon.change({
        name: NATIVE_ALTERNATE_NAME,
        suppressNotification: true,
        disable: ['tiger'],
      });
    }
  } catch {
    // Plugin not installed or platform doesn't support
  }
}
