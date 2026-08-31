import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isCapacitor, isIOS, isAndroid } from './capacitor';
import { setupCapacitorNetwork } from './capacitorNetwork';
import { syncApiBaseUrlToNative } from '@/services/authBridge';
import pushNotificationService from '@/services/pushNotificationService';
import { initWatchBridge } from '@/services/watchBridgeInit';
import { shouldSkipCaretFollowScroll } from '@/components/bugs/selectionPreserve';
import {
  computeKeyboardInsetPx,
  isInsideKeyboardManagedSurface,
  isKeyboardLikelyVisible,
  isSelfLiftingKeyboardBottomPanel,
  resolveKeyboardLayoutMode,
} from './keyboardLayout';
import { getKeyboardState, publishKeyboardState } from './keyboardState';
import {
  computeVisualViewportCssVarWrites,
  createFrameCoalescer,
  pickChangedCssVars,
} from './overlayKeyboardLayout';
import {
  releaseKeyboardScrollAssist,
  scrollElementAboveKeyboard,
} from './keyboardScrollAssist';

const lastVisualViewportCssVars = new Map<string, string>();
const lastAndroidViewportCssVars = new Map<string, string>();

let lastPluginKeyboardInsetPx = 0;
let nativeKeyboardVisible = false;
let currentFocusedInput: HTMLElement | null = null;
let scrollFocusedInputTimer: ReturnType<typeof setTimeout> | null = null;

const SCROLL_FOCUSED_INPUT_MS = 120;

const isInsideChatComposerFooter = (el: HTMLElement | null) =>
  !!el?.closest('[data-cap-chat-composer], .chat-container footer');

const resetAppRootScrollIfChatInput = () => {
  if (!isInsideChatComposerFooter(currentFocusedInput)) return;
  const root = document.getElementById('root');
  if (root) root.scrollTop = 0;
  window.scrollTo(0, 0);
};

const resetKeyboardLayoutUi = () => {
  if (scrollFocusedInputTimer) {
    clearTimeout(scrollFocusedInputTimer);
    scrollFocusedInputTimer = null;
  }
  nativeKeyboardVisible = false;
  lastPluginKeyboardInsetPx = 0;
  currentFocusedInput = null;
  releaseKeyboardScrollAssist();
  syncKeyboardLayoutFromViewport();
};

const applyVisualViewportCssVars = () => {
  if (!document.documentElement) return;
  const vv = window.visualViewport;
  const next = computeVisualViewportCssVarWrites({
    innerHeight: window.innerHeight || 0,
    vvHeight: vv ? vv.height : null,
    vvOffsetTop: vv ? vv.offsetTop : null,
  });
  const changed = pickChangedCssVars(lastVisualViewportCssVars, next);
  if (changed.length === 0) return;
  const style = document.documentElement.style;
  for (const [name, value] of changed) {
    lastVisualViewportCssVars.set(name, value);
    style.setProperty(name, value);
  }
};

export const syncKeyboardLayoutFromViewport = () => {
  if (typeof document === 'undefined' || !document.documentElement) return;

  const innerH = window.innerHeight || 0;
  const vv = window.visualViewport;
  const effective = nativeKeyboardVisible
    ? computeKeyboardInsetPx({
        innerHeight: innerH,
        vvHeight: vv?.height ?? null,
        vvOffsetTop: vv?.offsetTop ?? null,
        pluginInsetPx: lastPluginKeyboardInsetPx,
        preferPluginInset: isAndroid(),
      })
    : 0;

  applyVisualViewportCssVars();
  publishKeyboardState({ visible: nativeKeyboardVisible, insetPx: effective });
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
    const style = isDarkMode ? SystemBarsStyle.Dark : SystemBarsStyle.Light;

    console.log('Setting status bar style to:', style, isDarkMode ? '(white text for dark bg)' : '(black text for light bg)');

    await SystemBars.setStyle({ style });

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
  const next: Array<readonly [string, string]> = [
    ['--viewport-width', `${getAndroidViewportWidth()}px`],
    ['--viewport-height', `${getAndroidViewportHeight()}px`],
  ];
  const changed = pickChangedCssVars(lastAndroidViewportCssVars, next);
  if (changed.length === 0) return;
  const style = document.documentElement.style;
  for (const [name, value] of changed) {
    lastAndroidViewportCssVars.set(name, value);
    style.setProperty(name, value);
  }
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollInputIntoViewIfAble = (el: HTMLElement | null) => {
  if (!el || !el.isConnected) return;
  const smooth = !prefersReducedMotion();
  if (isInsideChatComposerFooter(el)) return;
  if (isSelfLiftingKeyboardBottomPanel(el)) return;
  if (shouldSkipCaretFollowScroll(el)) return;
  if (isInsideKeyboardManagedSurface(el)) {
    // Surface already lifted above the keyboard; local scroll is enough.
    el.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'nearest',
      inline: 'nearest',
    });
    return;
  }
  scrollElementAboveKeyboard(el, getKeyboardState().insetPx, smooth);
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
    const scheduleAndroidViewport = createFrameCoalescer(onAndroidViewport);
    onAndroidViewport();
    requestAnimationFrame(onAndroidViewport);
    window.addEventListener('load', () => onAndroidViewport());
    window.visualViewport?.addEventListener('resize', scheduleAndroidViewport.schedule);
    window.visualViewport?.addEventListener('scroll', scheduleAndroidViewport.schedule);
    window.addEventListener('resize', scheduleAndroidViewport.schedule);
    window.addEventListener('orientationchange', () => {
      setTimeout(onAndroidViewport, 50);
      requestAnimationFrame(onAndroidViewport);
    });
  }

  try {
    console.log('Setting up Capacitor...');
    
    // Setup network monitoring first
    await setupCapacitorNetwork();

    // iOS invite action categories are registered here; Android invite buttons use native
    // FCM handling in ChatReplyMessagingService (FCM notification payloads ignore actions[]).
    await syncApiBaseUrlToNative();
    void initWatchBridge();
    await pushNotificationService.initializeEarly();

    try {
      await SystemBars.show();
      console.log('StatusBar shown');
    } catch (e) {
      console.log('StatusBar.show() not available or failed:', e);
    }

    if (isIOS() || isAndroid()) {
      await SystemBars.setStyle({ style: SystemBarsStyle.Light });
      console.log('System bars set to Light style (black text)');
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
      nativeKeyboardVisible = true;
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
      nativeKeyboardVisible = true;
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
      const scheduleIosViewport = createFrameCoalescer(syncKeyboardLayoutFromViewport);
      syncKeyboardLayoutFromViewport();
      window.visualViewport?.addEventListener('resize', scheduleIosViewport.schedule);
      window.visualViewport?.addEventListener('scroll', scheduleIosViewport.schedule);
    }

    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (!isEditableFocusTarget(target)) return;
      currentFocusedInput = target;
      if (getKeyboardState().visible) {
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
  if (isCapacitor()) return () => {};

  let baselineVvHeight = window.visualViewport?.height ?? window.innerHeight;
  let baselineInnerHeight = window.innerHeight;

  const updateBaselines = () => {
    baselineVvHeight = window.visualViewport?.height ?? window.innerHeight;
    baselineInnerHeight = window.innerHeight;
  };

  const publishNativeResizeKeyboardHidden = () => {
    nativeKeyboardVisible = false;
    applyVisualViewportCssVars();
    releaseKeyboardScrollAssist();
    publishKeyboardState({ visible: false, insetPx: 0 });
  };

  const publishManualKeyboardState = () => {
    nativeKeyboardVisible = true;
    syncKeyboardLayoutFromViewport();
  };

  let loadHandler: (() => void) | null = null;
  if (document.readyState === 'complete') {
    setTimeout(updateBaselines, 100);
  } else {
    loadHandler = () => {
      setTimeout(updateBaselines, 100);
    };
    window.addEventListener('load', loadHandler);
  }

  if (window.visualViewport) {
    const handleViewportChange = () => {
      const viewport = window.visualViewport!;
      const vvHeight = viewport.height;
      const innerH = window.innerHeight;
      const keyboardLikelyVisible = isKeyboardLikelyVisible(baselineVvHeight, vvHeight);

      applyVisualViewportCssVars();

      if (!keyboardLikelyVisible) {
        updateBaselines();
        publishNativeResizeKeyboardHidden();
        return;
      }

      const mode = resolveKeyboardLayoutMode({
        isCapacitor: false,
        baselineInnerHeight,
        currentInnerHeight: innerH,
        keyboardLikelyVisible: true,
      });

      if (mode === 'native-resize') {
        nativeKeyboardVisible = false;
        releaseKeyboardScrollAssist();
        publishKeyboardState({ visible: false, insetPx: 0 });
        return;
      }

      publishManualKeyboardState();
    };

    const scheduleViewportChange = createFrameCoalescer(handleViewportChange);
    window.visualViewport.addEventListener('resize', scheduleViewportChange.schedule);
    window.visualViewport.addEventListener('scroll', scheduleViewportChange.schedule);
    handleViewportChange();

    const handleOrientationChange = () => {
      setTimeout(updateBaselines, 100);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      if (loadHandler) {
        window.removeEventListener('load', loadHandler);
      }
      scheduleViewportChange.cancel();
      window.visualViewport?.removeEventListener('resize', scheduleViewportChange.schedule);
      window.visualViewport?.removeEventListener('scroll', scheduleViewportChange.schedule);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }

  const updateKeyboardState = () => {
    const currentHeight = window.innerHeight;
    const keyboardLikelyVisible = isKeyboardLikelyVisible(baselineInnerHeight, currentHeight);

    if (!keyboardLikelyVisible) {
      updateBaselines();
      publishNativeResizeKeyboardHidden();
      return;
    }

    // innerHeight drop without visualViewport API = browser-native layout resize
    nativeKeyboardVisible = false;
    releaseKeyboardScrollAssist();
    publishKeyboardState({ visible: false, insetPx: 0 });
  };

  const handleResize = () => {
    updateKeyboardState();
  };

  const handleOrientationChange = () => {
    setTimeout(() => {
      updateBaselines();
      updateKeyboardState();
    }, 100);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleOrientationChange);

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
};

