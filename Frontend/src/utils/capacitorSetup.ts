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
    
    // Show status bar first
    try {
      await StatusBar.show();
      console.log('StatusBar shown');
    } catch (e) {
      console.log('StatusBar.show() not available or failed:', e);
    }
    
    // Initial setup
    if (isIOS() || isAndroid()) {
      await StatusBar.setOverlaysWebView({ overlay: true });
      console.log('StatusBar overlay enabled');
    }

    // Set initial status bar style - force dark text for light backgrounds
    if (isIOS()) {
      await StatusBar.setStyle({ style: Style.Dark });
      console.log('iOS StatusBar set to Dark style (black text)');
    }
    
    if (isAndroid()) {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#f9fafb' });
      console.log('Android StatusBar set to Dark style with light background');
    }

    // Then update based on actual theme with a delay
    setTimeout(async () => {
      await updateStatusBarStyle();
    }, 200);

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

