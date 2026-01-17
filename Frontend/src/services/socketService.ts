import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';
import { isCapacitor } from '@/utils/capacitor';
import { useNetworkStore } from '@/utils/networkStatus';

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
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastPongTime: number = 0;
  private activeChatRooms: Map<string, { contextType: 'GAME' | 'BUG' | 'USER' | 'GROUP'; contextId: string }> = new Map();
  private isRejoining = false;
  private heartbeatIntervalMs = 30000;
  private heartbeatTimeoutMs = 10000;
  private networkListenersSetup = false;
  private isOffline = false;
  private networkUnsubscribe: (() => void) | null = null;
  private eventSubscribers: Map<string, Set<(...args: any[]) => void>> = new Map();
  private socketListeners: Map<string, (...args: any[]) => void> = new Map();

  constructor() {
    // Don't auto-connect in constructor - let components trigger connection when needed
    if (SocketService.instance) {
      return SocketService.instance;
    }
    SocketService.instance = this;
    this.setupNetworkListeners();
  }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  private setupNetworkListeners() {
    if (this.networkListenersSetup) {
      return;
    }

    // Subscribe to network store changes (works for both Capacitor and web)
    this.networkUnsubscribe = useNetworkStore.subscribe(
      (state) => {
        const isOnline = state.isOnline;
        if (isOnline) {
          this.handleNetworkOnline();
        } else {
          this.handleNetworkOffline();
        }
      }
    );

    // Set initial state from store
    const initialOnline = useNetworkStore.getState().isOnline;
    this.isOffline = !initialOnline;
    
    this.networkListenersSetup = true;
  }

  private handleNetworkOnline() {
    console.log('[SocketService] Network online - resuming connection');
    this.isOffline = false;
    
    // Resume heartbeat if socket is connected
    if (this.socket && this.socket.connected) {
      this.startHeartbeat();
    } else if (!this.isConnecting && !this.socket?.connected) {
      // Attempt to reconnect if not already connected
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  private handleNetworkOffline() {
    console.log('[SocketService] Network offline - pausing heartbeat');
    this.isOffline = true;
    this.stopHeartbeat();
    
    // Cancel any pending reconnection attempts
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
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

    const isOnline = useNetworkStore.getState().isOnline;
    if (!isOnline) {
      console.log('Skipping socket connection - offline');
      return;
    }

    this.isConnecting = true;

    // Stop heartbeat before cleaning up
    this.stopHeartbeat();

    // Cancel any pending reconnection
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Clean up existing socket if any
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      // Clear socket listeners since they're tied to the old socket instance
      this.socketListeners.clear();
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
      reconnection: false,
      reconnectionAttempts: 0,
      reconnectionDelay: 0,
      reconnectionDelayMax: 0,
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
      // Re-register socket listeners for all active subscriptions
      this.reregisterSocketListeners();
      // Only start heartbeat if online
      const isOnline = useNetworkStore.getState().isOnline;
      if (!this.isOffline && isOnline) {
        this.startHeartbeat();
      }
      this.rejoinActiveChatRooms();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      this.isConnecting = false;
      this.stopHeartbeat();
      
      // Only reconnect for unintentional disconnects
      // 'io client disconnect' means we explicitly disconnected, so don't reconnect
      if (reason !== 'io client disconnect') {
        this.handleReconnect();
      }
    });

    this.socket.on('pong', () => {
      this.lastPongTime = Date.now();
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
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

  private startHeartbeat() {
    this.stopHeartbeat();
    
    if (!this.socket || !this.socket.connected) {
      return;
    }

    const isOnline = useNetworkStore.getState().isOnline;
    if (this.isOffline || !isOnline) {
      console.log('[SocketService] Skipping heartbeat start - offline');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[SocketService] Max reconnection attempts reached, stopping heartbeat');
      return;
    }

    this.lastPongTime = Date.now();
    
    this.heartbeatInterval = setInterval(() => {
      const isOnline = useNetworkStore.getState().isOnline;
      if (this.isOffline || !isOnline) {
        console.log('[SocketService] Heartbeat: Skipping - offline');
        return;
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.warn('[SocketService] Heartbeat: Max attempts reached, stopping');
        this.stopHeartbeat();
        return;
      }

      if (!this.socket || !this.socket.connected) {
        console.warn('[SocketService] Heartbeat: Socket not connected, attempting reconnect');
        this.handleReconnect();
        return;
      }

      // Clear any existing timeout before setting a new one
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }

      this.socket.emit('ping', { timestamp: Date.now() });
      
      this.heartbeatTimeout = setTimeout(() => {
        const isOnline = useNetworkStore.getState().isOnline;
        if (this.isOffline || !isOnline) {
          return;
        }
        
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > this.heartbeatTimeoutMs) {
          console.warn('[SocketService] Heartbeat: Pong timeout, reconnecting');
          this.handleReconnect();
        }
      }, this.heartbeatTimeoutMs);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private async rejoinActiveChatRooms() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    // Prevent concurrent rejoin attempts
    if (this.isRejoining) {
      return;
    }

    this.isRejoining = true;
    
    try {
      const rooms = Array.from(this.activeChatRooms.values());
      console.log('[SocketService] Rejoining active chat rooms:', rooms);
      
      // Rejoin rooms sequentially to avoid overwhelming the server
      for (const room of rooms) {
        // Check connection status before each rejoin
        if (!this.socket || !this.socket.connected) {
          console.warn('[SocketService] Connection lost during room rejoin');
          break;
        }
        
        try {
          await this.joinChatRoom(room.contextType, room.contextId);
          // Small delay between rejoins to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[SocketService] Failed to rejoin room ${room.contextType}:${room.contextId}:`, error);
          // Continue with other rooms even if one fails
        }
      }
    } finally {
      this.isRejoining = false;
    }
  }

  private handleReconnect() {
    // Don't attempt reconnection if offline
    const isOnline = useNetworkStore.getState().isOnline;
    if (this.isOffline || !isOnline) {
      console.log('[SocketService] Skipping reconnection - offline');
      return;
    }

    // Prevent multiple simultaneous reconnection attempts
    if (this.reconnectTimeoutId || this.isConnecting || (this.socket && this.socket.connected)) {
      console.log('[SocketService] Reconnection already in progress or connected, skipping');
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.stopHeartbeat();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      // Check if still online and not already connected before connecting
      const isOnline = useNetworkStore.getState().isOnline;
      if (!this.isOffline && isOnline && (!this.socket || !this.socket.connected)) {
        this.connect();
      }
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
    const roomKey = `${contextType}:${contextId}`;
    this.activeChatRooms.set(roomKey, { contextType, contextId });
    
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
    const roomKey = `${contextType}:${contextId}`;
    this.activeChatRooms.delete(roomKey);
    
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

  // Re-register socket listeners after reconnection
  private reregisterSocketListeners() {
    if (!this.socket) return;

    for (const [eventKey, subscribers] of this.eventSubscribers.entries()) {
      if (subscribers.size > 0 && !this.socketListeners.has(eventKey)) {
        const socketListener = ((data: any) => {
          const subs = this.eventSubscribers.get(eventKey);
          if (subs) {
            subs.forEach(cb => {
              try {
                cb(data);
              } catch (error) {
                console.error(`[SocketService] Error in subscriber callback for ${eventKey}:`, error);
              }
            });
          }
        }) as any;

        this.socket.on(eventKey as keyof SocketEvents, socketListener);
        this.socketListeners.set(eventKey, socketListener);
        console.log(`[SocketService] Re-registered socket listener for event: ${eventKey}`);
      }
    }
  }

  // Listen to events - uses multiplexer pattern (one socket listener dispatches to multiple subscribers)
  public on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) {
    this.ensureConnection();
    if (!this.socket) {
      console.warn(`[SocketService] Cannot listen to ${event}: socket not initialized`);
      return;
    }

    const eventKey = event as string;
    
    // Get or create subscriber set for this event
    if (!this.eventSubscribers.has(eventKey)) {
      this.eventSubscribers.set(eventKey, new Set());
    }

    const subscribers = this.eventSubscribers.get(eventKey)!;
    
    // Check if callback already subscribed
    if (subscribers.has(callback as (...args: any[]) => void)) {
      console.log(`[SocketService] Callback already subscribed to ${event}, skipping`);
      return;
    }

    // Add callback to subscribers
    subscribers.add(callback as (...args: any[]) => void);

    // If this is the first subscriber, create the socket listener
    if (!this.socketListeners.has(eventKey)) {
      const socketListener = ((data: any) => {
        const subs = this.eventSubscribers.get(eventKey);
        if (subs) {
          // Dispatch to all subscribers
          subs.forEach(cb => {
            try {
              cb(data);
            } catch (error) {
              console.error(`[SocketService] Error in subscriber callback for ${eventKey}:`, error);
            }
          });
        }
      }) as any;

      this.socket.on(event, socketListener);
      this.socketListeners.set(eventKey, socketListener);
      console.log(`[SocketService] Created socket listener for event: ${event}`);
    }

    console.log(`[SocketService] Added subscriber to event: ${event} (${subscribers.size} total)`);
  }

  // Remove event listener
  public off<K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) {
    const eventKey = event as string;
    const subscribers = this.eventSubscribers.get(eventKey);
    
    if (!subscribers) return;

    if (callback) {
      // Remove specific callback
      subscribers.delete(callback as (...args: any[]) => void);
      
      // If no more subscribers, remove socket listener (if socket exists)
      if (subscribers.size === 0) {
        if (this.socket) {
          const socketListener = this.socketListeners.get(eventKey);
          if (socketListener) {
            this.socket.removeAllListeners(event);
            this.socketListeners.delete(eventKey);
            console.log(`[SocketService] Removed socket listener for event: ${event} (no more subscribers)`);
          }
        }
        this.eventSubscribers.delete(eventKey);
      } else {
        console.log(`[SocketService] Removed subscriber from event: ${event} (${subscribers.size} remaining)`);
      }
    } else {
      // Remove all subscribers and socket listener
      if (this.socket) {
        const socketListener = this.socketListeners.get(eventKey);
        if (socketListener) {
          this.socket.removeAllListeners(event);
          this.socketListeners.delete(eventKey);
        }
      }
      this.eventSubscribers.delete(eventKey);
      console.log(`[SocketService] Removed all subscribers and listener for event: ${event}`);
    }
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
    this.stopHeartbeat();
    this.activeChatRooms.clear();
    this.isRejoining = false;
    this.eventSubscribers.clear();
    this.socketListeners.clear();
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    // Clean up network subscription
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
      this.networkListenersSetup = false;
    }
    
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
