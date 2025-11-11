import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isCapacitor, isIOS, isAndroid } from './capacitor';

const updateStatusBarStyle = async () => {
  if (!isCapacitor()) return;
  
  try {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const style = isDarkMode ? Style.Light : Style.Dark;
    
    await StatusBar.setStyle({ style });
    
    if (isAndroid()) {
      const bgColor = isDarkMode ? '#111827' : '#f9fafb'; // gray-900 : gray-50
      await StatusBar.setBackgroundColor({ color: bgColor });
    }
  } catch (error) {
    console.error('Error updating status bar style:', error);
  }
};

export const setupCapacitor = async () => {
  if (!isCapacitor()) return;

  try {
    // Initial setup
    if (isIOS() || isAndroid()) {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }

    // Set initial status bar style
    await updateStatusBarStyle();

    // Listen for dark mode changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      updateStatusBarStyle();
    });

    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    
    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-visible');
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-visible');
    });

  } catch (error) {
    console.error('Error setting up Capacitor:', error);
  }
};

