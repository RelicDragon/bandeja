export type PermissionType = 'photos' | 'camera';

export interface PermissionModalState {
  isOpen: boolean;
  permissionType: PermissionType;
  onPermissionGranted?: () => void; // Callback to retry after permission granted
}

class PermissionService {
  private listeners: Set<(state: PermissionModalState) => void> = new Set();
  private state: PermissionModalState = {
    isOpen: false,
    permissionType: 'photos',
    onPermissionGranted: undefined,
  };

  subscribe(listener: (state: PermissionModalState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state }); // Pass copy immediately
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const stateCopy = { ...this.state }; // Create copy for all listeners
    this.listeners.forEach(listener => {
      try {
        listener(stateCopy);
      } catch (error) {
        console.error('Error in permission service listener:', error);
      }
    });
  }

  showPermissionModal(
    permissionType: PermissionType = 'photos',
    onPermissionGranted?: () => void
  ) {
    // Only update if actually changing
    if (this.state.isOpen && this.state.permissionType === permissionType) {
      return;
    }
    
    this.state = {
      isOpen: true,
      permissionType,
      onPermissionGranted,
    };
    this.notify();
  }

  hidePermissionModal() {
    if (!this.state.isOpen) {
      return; // Already closed
    }
    
    this.state = {
      ...this.state,
      isOpen: false,
      onPermissionGranted: undefined,
    };
    this.notify();
  }

  triggerPermissionGrantedCallback() {
    if (this.state.onPermissionGranted) {
      const callback = this.state.onPermissionGranted;
      this.state.onPermissionGranted = undefined; // Clear callback
      this.notify(); // Update state
      callback();
    }
  }

  getState(): PermissionModalState {
    return { ...this.state };
  }
}

export const permissionService = new PermissionService();
