class ModalZIndexService {
  private baseZIndex = 9999;
  private currentZIndex = 9999;
  private modalStack: Map<string, number> = new Map();

  registerModal(modalId: string): number {
    this.currentZIndex += 1;
    this.modalStack.set(modalId, this.currentZIndex);
    return this.currentZIndex;
  }

  unregisterModal(modalId: string): void {
    this.modalStack.delete(modalId);
    if (this.modalStack.size === 0) {
      this.currentZIndex = this.baseZIndex;
    }
  }

  getZIndex(modalId: string): number | undefined {
    return this.modalStack.get(modalId);
  }
}

export const modalZIndexService = new ModalZIndexService();
