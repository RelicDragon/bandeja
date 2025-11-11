import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isCapacitor, isIOS, isAndroid } from './capacitor';

export const updateStatusBarStyle = async () => {
  if (!isCapacitor()) return;
  
  try {
    // Check if app is in dark mode by looking at the html or body class
    const isDarkMode = document.documentElement.classList.contains('dark') || 
                       document.body.classList.contains('dark');
    
    console.log('Updating status bar - isDarkMode:', isDarkMode);
    
    // In dark mode (dark background), use light text (white)
    // In light mode (light background), use dark text (black)
    const style = isDarkMode ? Style.Light : Style.Dark;
    
    console.log('Setting status bar style to:', style);
    
    await StatusBar.setStyle({ style });
    
    if (isAndroid()) {
      const bgColor = isDarkMode ? '#111827' : '#f9fafb'; // gray-900 : gray-50
      await StatusBar.setBackgroundColor({ color: bgColor });
    }
    
    console.log('Status bar style updated successfully');
  } catch (error) {
    console.error('Error updating status bar style:', error);
  }
};

export const setupCapacitor = async () => {
  if (!isCapacitor()) return;

  try {
    console.log('Setting up Capacitor...');
    
    // Initial setup
    if (isIOS() || isAndroid()) {
      await StatusBar.setOverlaysWebView({ overlay: true });
      console.log('StatusBar overlay enabled');
    }

    // Set initial status bar style with a delay to ensure DOM is ready
    setTimeout(async () => {
      await updateStatusBarStyle();
    }, 100);

    // Observe dark mode changes on the document
    const observer = new MutationObserver(() => {
      updateStatusBarStyle();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Also observe body in case dark class is applied there
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
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

