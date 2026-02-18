import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isCapacitor, isIOS, isAndroid } from './capacitor';
import { setupCapacitorNetwork } from './capacitorNetwork';
import pushNotificationService from '@/services/pushNotificationService';

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

const fullScreenHeightCssPx = () =>
  Math.round(window.screen.height / window.devicePixelRatio);

export const setAndroidViewportVars = () => {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const full = fullScreenHeightCssPx();
  document.documentElement.style.setProperty('--viewport-width', `${w}px`);
  document.documentElement.style.setProperty('--viewport-height', `${h}px`);
  document.documentElement.style.setProperty('--viewport-height-full', `${full}px`);
};

export const setupCapacitor = async () => {
  if (!isCapacitor()) return;

  if (isAndroid()) {
    setAndroidViewportVars();
    window.visualViewport?.addEventListener('resize', setAndroidViewportVars);
    window.addEventListener('resize', setAndroidViewportVars);
    window.addEventListener('orientationchange', setAndroidViewportVars);
  }

  try {
    console.log('Setting up Capacitor...');
    
    // Setup network monitoring first
    await setupCapacitorNetwork();
    
    // Initialize push notifications
    await pushNotificationService.initialize();
    
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

    // Use Body resize mode for better keyboard handling
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

    // Store reference to currently focused input
    let currentFocusedInput: HTMLElement | null = null;

    // Track keyboard height for dynamic adjustments
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.body.classList.add('keyboard-visible');

      // Store keyboard height in CSS custom property for dynamic adjustments
      if (info && info.keyboardHeight) {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      }

      // Scroll focused input into view after keyboard appears
      if (currentFocusedInput) {
        setTimeout(() => {
          currentFocusedInput?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }, 100);
      }
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-visible');
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      currentFocusedInput = null;
    });

    Keyboard.addListener('keyboardDidShow', (info) => {
      // Ensure keyboard height is set even if willShow didn't fire
      if (info && info.keyboardHeight) {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      }

      // Double-check that input is visible after keyboard animation completes
      if (currentFocusedInput) {
        setTimeout(() => {
          currentFocusedInput?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }, 50);
      }
    });

    Keyboard.addListener('keyboardDidHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      currentFocusedInput = null;
    });

    // Listen for input/textarea focus to track which element needs to be visible
    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        currentFocusedInput = target;

        // Pre-emptively scroll the input into view
        // This helps on Android where keyboardWillShow might not fire early enough
        setTimeout(() => {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }, 50);
      }
    });

    document.addEventListener('focusout', (e) => {
      const target = e.target as HTMLElement;
      if (target === currentFocusedInput) {
        currentFocusedInput = null;
      }
    });

  } catch (error) {
    console.error('Error setting up Capacitor:', error);
  }
};

export const setupBrowserKeyboardDetection = () => {
  if (isCapacitor()) return () => {}; // Return empty cleanup if in Capacitor

  let initialViewportHeight = window.visualViewport?.height || window.innerHeight;
  let isKeyboardVisible = false;
  const KEYBOARD_THRESHOLD = 150; // Consider keyboard visible if viewport shrinks by more than 150px

  // Update initial height after a short delay to ensure it's accurate
  const updateInitialHeight = () => {
    initialViewportHeight = window.visualViewport?.height || window.innerHeight;
  };

  // Set initial height after page load
  let loadHandler: (() => void) | null = null;
  if (document.readyState === 'complete') {
    setTimeout(updateInitialHeight, 100);
  } else {
    loadHandler = () => {
      setTimeout(updateInitialHeight, 100);
    };
    window.addEventListener('load', loadHandler);
  }

  // Use Visual Viewport API if available (modern mobile browsers)
  if (window.visualViewport) {
    const handleViewportChange = () => {
      const viewport = window.visualViewport!;
      const heightDifference = initialViewportHeight - viewport.height;
      
      if (heightDifference > KEYBOARD_THRESHOLD && !isKeyboardVisible) {
        isKeyboardVisible = true;
        document.body.classList.add('keyboard-visible');
      } else if (heightDifference <= KEYBOARD_THRESHOLD && isKeyboardVisible) {
        isKeyboardVisible = false;
        document.body.classList.remove('keyboard-visible');
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    // Update initial height when orientation changes
    const handleOrientationChange = () => {
      setTimeout(() => {
        updateInitialHeight();
      }, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      if (loadHandler) {
        window.removeEventListener('load', loadHandler);
      }
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  } else {
    // Fallback for older browsers - use window resize
    const updateKeyboardState = () => {
      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      if (heightDifference > KEYBOARD_THRESHOLD && !isKeyboardVisible) {
        isKeyboardVisible = true;
        document.body.classList.add('keyboard-visible');
      } else if (heightDifference <= KEYBOARD_THRESHOLD && isKeyboardVisible) {
        isKeyboardVisible = false;
        document.body.classList.remove('keyboard-visible');
      }
    };

    const handleResize = () => {
      updateKeyboardState();
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        updateInitialHeight();
        updateKeyboardState();
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Also check on input focus/blur as additional triggers
    const handleFocus = () => {
      setTimeout(updateKeyboardState, 300);
    };

    const handleBlur = () => {
      setTimeout(updateKeyboardState, 300);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }
};

