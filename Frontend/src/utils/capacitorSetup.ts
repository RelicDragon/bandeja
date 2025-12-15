import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { isCapacitor, isIOS, isAndroid } from './capacitor';
import { setupCapacitorNetwork } from './capacitorNetwork';

export const updateStatusBarStyle = async () => {
  if (!isCapacitor()) return;
  
  try {
    // Check if app is in dark mode by looking at the html or body class
    const isDarkMode = document.documentElement.classList.contains('dark') || 
                       document.body.classList.contains('dark');
    
    console.log('Updating status bar - isDarkMode:', isDarkMode);
    
    // Capacitor naming is counterintuitive:
    // Style.Light = dark/black text (for LIGHT backgrounds)
    // Style.Dark = light/white text (for DARK backgrounds)
    const style = isDarkMode ? Style.Dark : Style.Light;
    
    console.log('Setting status bar style to:', style, isDarkMode ? '(white text for dark bg)' : '(black text for light bg)');
    
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
    
    // Setup network monitoring first
    await setupCapacitorNetwork();
    
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

    // Set initial status bar style - Style.Light = black text for light backgrounds
    if (isIOS()) {
      await StatusBar.setStyle({ style: Style.Light });
      console.log('iOS StatusBar set to Light style (black text)');
    }
    
    if (isAndroid()) {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#f9fafb' });
      console.log('Android StatusBar set to Light style with light background');
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

    const handleDeepLink = (urlString: string) => {
      try {
        const url = new URL(urlString);
        if (url.hostname === 'bandeja.me' && url.pathname.startsWith('/games/')) {
          const gameId = url.pathname.split('/games/')[1]?.split('/')[0];
          if (gameId) {
            window.location.href = `/games/${gameId}`;
          }
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    };

    App.addListener('appUrlOpen', (event) => {
      handleDeepLink(event.url);
    });

    App.getLaunchUrl().then((result) => {
      if (result?.url) {
        handleDeepLink(result.url);
      }
    }).catch(() => {
      // No launch URL, app was opened normally
    });

  } catch (error) {
    console.error('Error setting up Capacitor:', error);
  }
};

