import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import { isCapacitor } from '@/utils/capacitor';

export interface NewUserChatMessage {
  contextId: string;
  chatId?: string;
  senderId?: string;
}

export interface UserChatReadReceipt {
  userId: string;
  chatId?: string;
}

export interface SocketEvents {
  'new-invite': (invite: any) => void;
  'invite-deleted': (data: { inviteId: string; gameId?: string }) => void;
  'joined-game-room': (data: { gameId: string }) => void;
  'left-game-room': (data: { gameId: string }) => void;
  'joined-bug-room': (data: { bugId: string }) => void;
  'left-bug-room': (data: { bugId: string }) => void;
  'joined-user-chat-room': (data: { chatId: string }) => void;
  'left-user-chat-room': (data: { chatId: string }) => void;
  'joined-chat-room': (data: { contextType: string; contextId: string }) => void;
  'left-chat-room': (data: { contextType: string; contextId: string }) => void;
  'game-updated': (data: { gameId: string; senderId: string; game: any }) => void;
  'game-results-updated': (data: { gameId: string }) => void;
  'wallet-update': (data: { wallet: number }) => void;
  'error': (error: { message: string }) => void;
  // Unified chat events
  'chat:message': (data: { contextType: string; contextId: string; message: any; messageId?: string; timestamp?: string }) => void;
  'chat:reaction': (data: { contextType: string; contextId: string; reaction: any }) => void;
  'chat:read-receipt': (data: { contextType: string; contextId: string; readReceipt: any }) => void;
  'chat:deleted': (data: { contextType: string; contextId: string; messageId: string }) => void;
  'chat:unread-count': (data: { contextType: string; contextId: string; unreadCount: number }) => void;
  'sync-required': (data: { timestamp: string }) => void;
  'sync-ready': (data: { contextType: string; contextId: string }) => void;
  'reconnect': () => void;
  // Bet events
  'bet:created': (data: { gameId: string; bet: any }) => void;
  'bet:updated': (data: { gameId: string; bet: any }) => void;
  'bet:deleted': (data: { gameId: string; betId: string }) => void;
  'bet:resolved': (data: { gameId: string; betId: string; winnerId: string; loserId: string }) => void;
}

class SocketService {
  private static instance: SocketService | null = null;
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;

  constructor() {
    // Don't auto-connect in constructor - let components trigger connection when needed
    if (SocketService.instance) {
      return SocketService.instance;
    }
    SocketService.instance = this;
  }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  private connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting || (this.socket && this.socket.connected)) {
      console.log('Socket connection already in progress or connected');
      return;
    }

    const token = useAuthStore.getState().token;
    
    if (!token) {
      console.warn('No auth token available for Socket.IO connection');
      return;
    }

    if (!navigator.onLine) {
      console.log('Skipping socket connection - offline');
      return;
    }

    this.isConnecting = true;

    // Clean up existing socket if any
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const serverUrl = isCapacitor() 
      ? 'https://bandeja.me'
      : (import.meta.env.VITE_SOCKET_URL || window.location.origin);
    
    this.socket = io(serverUrl, {
      auth: {
        token: token
      },
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 5000
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[SocketService] Socket.IO connected, socket ID:', this.socket?.id);
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      this.isConnecting = false;
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.handleReconnect();
      }
    });

    this.socket.on('reconnect', () => {
      console.log('[SocketService] Reconnected, checking for missed messages');
      // Trigger sync check
      this.handleReconnectionSync();
    });

    this.socket.on('sync-required', (data: { timestamp: string }) => {
      console.log('[SocketService] Server requested sync:', data);
      // Notify components to sync
      this.emit('sync-required', data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      this.isConnecting = false;
      this.handleReconnect();
    });

    this.socket.on('error', (error) => {
      console.error('[SocketService] Socket.IO error:', error);
    });

    // Add listener for game-updated events to debug
    this.socket.on('game-updated', (data: any) => {
      console.log('[SocketService] Received game-updated event:', data);
    });

    // Handle wallet-update events
    this.socket.on('wallet-update', (data: { wallet: number }) => {
      const { user, updateUser } = useAuthStore.getState();
      if (user) {
        updateUser({ ...user, wallet: data.wallet });
      }
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Ensure connection is established
  public ensureConnection() {
    if (!this.socket || !this.socket.connected) {
      this.connect();
    }
  }

  // Wait for connection to be established
  public waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        this.connect();
      }

      if (this.socket && this.socket.connected) {
        resolve();
        return;
      }

      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // Join a game chat room
  public async joinGameRoom(gameId: string) {
    try {
      await this.waitForConnection();
      if (this.socket) {
        this.socket.emit('join-game-room', gameId);
      }
    } catch (error) {
      console.error('Failed to join game room:', error);
    }
  }

  // Leave a game chat room
  public leaveGameRoom(gameId: string) {
    if (!this.socket) {
      console.warn('Socket not initialized, cannot leave game room');
      return;
    }

    if (this.socket.connected) {
      this.socket.emit('leave-game-room', gameId);
    } else {
      console.warn('Socket not connected, cannot leave game room');
    }
  }

  // Join a bug chat room
  public async joinBugRoom(bugId: string) {
    try {
      await this.waitForConnection();
      if (this.socket) {
        this.socket.emit('join-bug-room', bugId);
      }
    } catch (error) {
      console.error('Failed to join bug room:', error);
    }
  }

  // Leave a bug chat room
  public leaveBugRoom(bugId: string) {
    if (!this.socket) {
      console.warn('Socket not initialized, cannot leave bug room');
      return;
    }

    if (this.socket.connected) {
      this.socket.emit('leave-bug-room', bugId);
    } else {
      console.warn('Socket not connected, cannot leave bug room');
    }
  }

  // Join a user chat room
  public async joinUserChatRoom(chatId: string) {
    try {
      await this.waitForConnection();
      if (this.socket) {
        this.socket.emit('join-user-chat-room', chatId);
      }
    } catch (error) {
      console.error('Failed to join user chat room:', error);
    }
  }

  // Leave a user chat room
  public leaveUserChatRoom(chatId: string) {
    if (!this.socket) {
      console.warn('Socket not initialized, cannot leave user chat room');
      return;
    }

    if (this.socket.connected) {
      this.socket.emit('leave-user-chat-room', chatId);
    } else {
      console.warn('Socket not connected, cannot leave user chat room');
    }
  }

  // ========== UNIFIED CHAT METHODS (NEW) ==========
  // Generic join chat room based on context type
  public async joinChatRoom(contextType: 'GAME' | 'BUG' | 'USER' | 'GROUP', contextId: string) {
    if (contextType === 'GAME') {
      return this.joinGameRoom(contextId);
    } else if (contextType === 'BUG') {
      return this.joinBugRoom(contextId);
    } else if (contextType === 'USER') {
      return this.joinUserChatRoom(contextId);
    } else if (contextType === 'GROUP') {
      if (!this.socket?.connected) {
        await this.connect();
      }
      this.socket?.emit('join-chat-room', { contextType, contextId });
    }
  }

  // Generic leave chat room based on context type
  public leaveChatRoom(contextType: 'GAME' | 'BUG' | 'USER' | 'GROUP', contextId: string) {
    if (contextType === 'GAME') {
      return this.leaveGameRoom(contextId);
    } else if (contextType === 'BUG') {
      return this.leaveBugRoom(contextId);
    } else if (contextType === 'USER') {
      return this.leaveUserChatRoom(contextId);
    } else if (contextType === 'GROUP') {
      this.socket?.emit('leave-chat-room', { contextType, contextId });
    }
  }

  // Listen to events
  public on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) {
    this.ensureConnection();
    if (!this.socket) {
      console.warn(`[SocketService] Cannot listen to ${event}: socket not initialized`);
      return;
    }
    console.log(`[SocketService] Adding listener for event: ${event}`);
    this.socket.on(event, callback as any);
  }

  // Remove event listener
  public off<K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) {
    if (!this.socket) return;
    this.socket.off(event, callback as any);
  }

  // Emit typing indicator
  public emitTypingIndicator(gameId: string, isTyping: boolean) {
    this.ensureConnection();
    if (!this.socket) {
      console.warn('Socket not initialized, cannot emit typing indicator');
      return;
    }

    if (this.socket.connected) {
      this.socket.emit('typing-indicator', { gameId, isTyping });
    } else {
      console.warn('Socket not connected, cannot emit typing indicator');
    }
  }

  // Check if connected
  public getConnectionStatus(): boolean {
    return this.socket ? this.socket.connected : false;
  }

  // Get socket instance
  public getSocket(): Socket | null {
    return this.socket;
  }

  // Disconnect
  public disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    }
  }

  // Reconnect with new token
  public reconnectWithNewToken() {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Acknowledge message receipt via socket
   */
  public acknowledgeMessage(messageId: string, contextType: 'GAME' | 'BUG' | 'USER', contextId: string) {
    if (!this.socket || !this.socket.connected) return;

    this.socket.emit('chat:message-ack', {
      messageId,
      contextType,
      contextId
    });
  }

  /**
   * Confirm message receipt (socket or push)
   */
  public async confirmMessageReceipt(messageId: string, deliveryMethod: 'socket' | 'push') {
    try {
      const { api } = await import('@/api');
      await api.post('/chat/messages/confirm-receipt', {
        messageId,
        deliveryMethod
      });
    } catch (error) {
      console.error('Failed to confirm message receipt:', error);
    }
  }

  /**
   * Request missed messages after reconnection
   */
  public async syncMessages(contextType: 'GAME' | 'BUG' | 'USER', contextId: string, lastMessageId?: string) {
    if (!this.socket || !this.socket.connected) return;

    this.socket.emit('sync-messages', {
      contextType,
      contextId,
      lastMessageId
    });
  }

  /**
   * Handle reconnection sync
   */
  private handleReconnectionSync() {
    // This will be called by components that need to sync
    this.emit('reconnect', {});
  }

  /**
   * Emit custom event (for internal use)
   */
  private emit(event: string, data: any) {
    // This is a simple event emitter pattern
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }
}

// Create singleton instance
export const socketService = SocketService.getInstance();

// Export the class for testing
export { SocketService };
