import { App } from '@capacitor/app';
import { isAndroid } from '@/utils/capacitor';

type ModalCloseHandler = () => void;
type PageBackHandler = () => boolean | void;

class BackButtonService {
  private modalStack: Array<{ id: string; handler: ModalCloseHandler }> = [];
  private pageHandler: PageBackHandler | null = null;
  private listenerHandle: any = null;
  private isInitialized = false;
  private isHandling = false;

  initialize() {
    if (this.isInitialized || !isAndroid()) return;
    
    this.isInitialized = true;
    App.addListener('backButton', () => {
      this.handleBackButton();
    }).then((handle) => {
      this.listenerHandle = handle;
    }).catch((error) => {
      console.error('Failed to initialize back button listener:', error);
      this.isInitialized = false;
    });
  }

  private handleBackButton() {
    if (this.isHandling) return;
    
    this.isHandling = true;
    
    try {
      if (this.modalStack.length > 0) {
        const topModal = this.modalStack[this.modalStack.length - 1];
        if (topModal && topModal.handler) {
          topModal.handler();
        }
        this.isHandling = false;
        return;
      }

      if (this.pageHandler) {
        try {
          const handled = this.pageHandler();
          if (handled === false) {
            this.isHandling = false;
            return;
          }
        } catch (error) {
          console.error('Error in page back handler:', error);
        }
      }

      this.defaultBackNavigation();
    } catch (error) {
      console.error('Error handling back button:', error);
    } finally {
      this.isHandling = false;
    }
  }

  private defaultBackNavigation() {
    try {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        App.exitApp();
      }
    } catch (error) {
      console.error('Error in default back navigation:', error);
      try {
        App.exitApp();
      } catch (exitError) {
        console.error('Error exiting app:', exitError);
      }
    }
  }

  registerModal(id: string, handler: ModalCloseHandler) {
    if (!id || !handler) {
      console.warn('Invalid modal registration: id and handler are required');
      return;
    }
    
    this.unregisterModal(id);
    this.modalStack.push({ id, handler });
  }

  unregisterModal(id: string) {
    if (!id) return;
    this.modalStack = this.modalStack.filter(m => m.id !== id);
  }

  registerPageHandler(handler: PageBackHandler) {
    if (!handler) {
      console.warn('Invalid page handler registration: handler is required');
      return;
    }
    this.pageHandler = handler;
  }

  unregisterPageHandler() {
    this.pageHandler = null;
  }

  cleanup() {
    if (this.listenerHandle) {
      try {
        this.listenerHandle.remove();
      } catch (error) {
        console.error('Error removing back button listener:', error);
      }
      this.listenerHandle = null;
    }
    this.modalStack = [];
    this.pageHandler = null;
    this.isInitialized = false;
    this.isHandling = false;
  }
}

export const backButtonService = new BackButtonService();
