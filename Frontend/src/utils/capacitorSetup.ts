import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isCapacitor, isIOS, isAndroid } from './capacitor';
import { setupCapacitorNetwork } from './capacitorNetwork';
import pushNotificationService from '@/services/pushNotificationService';

let lastPluginKeyboardInsetPx = 0;
let currentFocusedInput: HTMLElement | null = null;
let scrollFocusedInputTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_KEYBOARD_INSET_RATIO = 0.92;
const SCROLL_FOCUSED_INPUT_MS = 120;

const isInsideChatComposerFooter = (el: HTMLElement | null) =>
  !!el?.closest('.chat-container footer');

const resetAppRootScrollIfChatInput = () => {
  if (!isInsideChatComposerFooter(currentFocusedInput)) return;
  const root = document.getElementById('root');
  if (root) root.scrollTop = 0;
  window.scrollTo(0, 0);
};

const resetKeyboardLayoutUi = () => {
  document.body.classList.remove('keyboard-visible');
  lastPluginKeyboardInsetPx = 0;
  currentFocusedInput = null;
  syncKeyboardLayoutFromViewport();
};

export const syncKeyboardLayoutFromViewport = () => {
  if (typeof document === 'undefined' || !document.documentElement) return;

  const innerH = window.innerHeight || 0;
  const maxInset = innerH > 0 ? Math.round(innerH * MAX_KEYBOARD_INSET_RATIO) : 10_000;

  const vv = window.visualViewport;
  const derived = vv
    ? Math.max(0, Math.round(innerH - vv.height - vv.offsetTop))
    : 0;
  const raw = Math.max(derived, lastPluginKeyboardInsetPx);
  const effective = Math.min(raw, maxInset);

  document.documentElement.style.setProperty('--keyboard-height', `${effective}px`);
  if (vv) {
    document.documentElement.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
    document.documentElement.style.setProperty('--vv-offset-top', `${Math.round(vv.offsetTop)}px`);
  }
};

const isEditableFocusTarget = (el: HTMLElement) => {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'searchbox';
};

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

const getAndroidViewportHeight = (): number => {
  const vv = window.visualViewport;
  const a = vv?.height ?? 0;
  const b = window.innerHeight ?? 0;
  const c = (typeof document.documentElement?.clientHeight === 'number') ? document.documentElement.clientHeight : 0;
  const h = Math.max(a, b, c, 100);
  return Math.round(h);
};

const getAndroidViewportWidth = (): number => {
  const vv = window.visualViewport;
  const w = vv?.width ?? window.innerWidth ?? document.documentElement?.clientWidth ?? 0;
  return Math.max(Math.round(w), 100);
};

export const setAndroidViewportVars = () => {
  const w = getAndroidViewportWidth();
  const h = getAndroidViewportHeight();
  document.documentElement.style.setProperty('--viewport-width', `${w}px`);
  document.documentElement.style.setProperty('--viewport-height', `${h}px`);
};

const scrollInputIntoViewIfAble = (el: HTMLElement | null) => {
  if (!el) return;
  if (isInsideChatComposerFooter(el)) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
};

const scheduleScrollFocusedInput = () => {
  if (scrollFocusedInputTimer) clearTimeout(scrollFocusedInputTimer);
  scrollFocusedInputTimer = setTimeout(() => {
    scrollFocusedInputTimer = null;
    scrollInputIntoViewIfAble(currentFocusedInput);
  }, SCROLL_FOCUSED_INPUT_MS);
};

export const setupCapacitor = async () => {
  if (!isCapacitor()) return;

  if (isAndroid()) {
    const onAndroidViewport = () => {
      setAndroidViewportVars();
      syncKeyboardLayoutFromViewport();
    };
    onAndroidViewport();
    requestAnimationFrame(onAndroidViewport);
    window.addEventListener('load', () => onAndroidViewport());
    window.visualViewport?.addEventListener('resize', onAndroidViewport);
    window.visualViewport?.addEventListener('scroll', onAndroidViewport);
    window.addEventListener('resize', onAndroidViewport);
    window.addEventListener('orientationchange', () => {
      setTimeout(onAndroidViewport, 50);
      requestAnimationFrame(onAndroidViewport);
    });
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

    if (isIOS() || isAndroid()) {
      await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    }

    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        resetKeyboardLayoutUi();
        return;
      }
      if (isAndroid()) {
        const refresh = () => {
          setAndroidViewportVars();
          syncKeyboardLayoutFromViewport();
        };
        refresh();
        requestAnimationFrame(refresh);
      }
    });

    Keyboard.addListener('keyboardWillShow', (info) => {
      document.body.classList.add('keyboard-visible');
      if (info && typeof info.keyboardHeight === 'number' && info.keyboardHeight >= 0) {
        lastPluginKeyboardInsetPx = info.keyboardHeight;
      }
      syncKeyboardLayoutFromViewport();
      requestAnimationFrame(() => resetAppRootScrollIfChatInput());
    });

    Keyboard.addListener('keyboardWillHide', () => {
      resetKeyboardLayoutUi();
    });

    Keyboard.addListener('keyboardDidShow', (info) => {
      document.body.classList.add('keyboard-visible');
      if (info && typeof info.keyboardHeight === 'number' && info.keyboardHeight >= 0) {
        lastPluginKeyboardInsetPx = info.keyboardHeight;
      }
      syncKeyboardLayoutFromViewport();
      requestAnimationFrame(() => {
        resetAppRootScrollIfChatInput();
        requestAnimationFrame(resetAppRootScrollIfChatInput);
      });
      scheduleScrollFocusedInput();
    });

    Keyboard.addListener('keyboardDidHide', () => {
      resetKeyboardLayoutUi();
    });

    if (isIOS()) {
      syncKeyboardLayoutFromViewport();
      window.visualViewport?.addEventListener('resize', syncKeyboardLayoutFromViewport);
      window.visualViewport?.addEventListener('scroll', syncKeyboardLayoutFromViewport);
    }

    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (!isEditableFocusTarget(target)) return;
      currentFocusedInput = target;
      if (document.body.classList.contains('keyboard-visible')) {
        requestAnimationFrame(() => resetAppRootScrollIfChatInput());
        scheduleScrollFocusedInput();
      }
    });

    document.addEventListener('focusout', (e) => {
      const target = e.target as HTMLElement;
      if (target !== currentFocusedInput) return;
      const next = e.relatedTarget;
      if (next instanceof HTMLElement && isEditableFocusTarget(next)) {
        currentFocusedInput = next;
        return;
      }
      currentFocusedInput = null;
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
      syncKeyboardLayoutFromViewport();
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
    handleViewportChange();

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

