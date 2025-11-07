import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

export interface SocketEvents {
  'new-message': (message: any) => void;
  'new-bug-message': (message: any) => void;
  'new-invite': (invite: any) => void;
  'invite-deleted': (data: { inviteId: string; gameId?: string }) => void;
  'message-reaction': (reaction: any) => void;
  'bug-message-reaction': (reaction: any) => void;
  'read-receipt': (readReceipt: any) => void;
  'bug-read-receipt': (readReceipt: any) => void;
  'message-deleted': (data: { messageId: string }) => void;
  'bug-message-deleted': (data: { messageId: string }) => void;
  'typing-indicator': (data: { userId: string; isTyping: boolean }) => void;
  'bug-typing-indicator': (data: { userId: string; isTyping: boolean }) => void;
  'joined-game-room': (data: { gameId: string }) => void;
  'left-game-room': (data: { gameId: string }) => void;
  'joined-bug-room': (data: { bugId: string }) => void;
  'left-bug-room': (data: { bugId: string }) => void;
  'game-updated': (data: { gameId: string; senderId: string; game: any }) => void;
  'game-results-updated': (data: { gameId: string }) => void;
  'error': (error: { message: string }) => void;
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

    this.isConnecting = true;

    // Clean up existing socket if any
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const serverUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    
    this.socket = io(serverUrl, {
      auth: {
        token: token
      },
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
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
}

// Create singleton instance
export const socketService = SocketService.getInstance();

// Export the class for testing
export { SocketService };
