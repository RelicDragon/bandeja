import { isCapacitor, isAndroid, isIOS } from './capacitor';

export async function openAppSettings(): Promise<void> {
  if (!isCapacitor()) {
    return;
  }

  try {
    if (isIOS()) {
      window.location.href = 'app-settings:';
    } else if (isAndroid()) {
      const packageName = 'com.funified.bandeja';
      
      // Try multiple methods for better compatibility
      try {
        // Method 1: Intent URL (works on most devices)
        const intent = 'android.settings.APPLICATION_DETAILS_SETTINGS';
        window.location.href = `intent:#Intent;action=${intent};data=package:${packageName};end`;
      } catch (e) {
        // Method 2: Direct package URL (fallback)
        try {
          window.location.href = `package:${packageName}`;
        } catch (e2) {
          // Method 3: Generic settings (last resort)
          window.location.href = 'android.settings.APPLICATION_DETAILS_SETTINGS';
        }
      }
    }
  } catch (error) {
    console.error('Failed to open settings:', error);
    // Final fallback
    if (isIOS()) {
      window.location.href = 'app-settings:';
    } else if (isAndroid()) {
      window.location.href = 'android.settings.APPLICATION_DETAILS_SETTINGS';
    }
  }
}
