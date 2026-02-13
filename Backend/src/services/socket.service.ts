import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { GameReadService } from './game/read.service';
import { ChatContextType } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  gameRooms?: Set<string>;
  bugRooms?: Set<string>;
  userChatRooms?: Set<string>;
}

class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private messageDeliveryAttempts = new Map<string, {
    messageId: string;
    contextType: ChatContextType;
    contextId: string;
    recipients: string[];
    socketDelivered: Set<string>;
    pushDelivered: Set<string>;
    timestamp: Date;
  }>();

  constructor(server: HTTPServer) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://91.98.232.51",
      "http://10.0.0.2", "https://bandeja.me"
    ].filter(Boolean);

    this.io = new SocketIOServer(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/socket.io/',
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        socket.userId = decoded.userId;

        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId }
        });

        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        next();
      } catch {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);

      // Track connected user
      if (socket.userId) {
        if (!this.connectedUsers.has(socket.userId)) {
          this.connectedUsers.set(socket.userId, new Set());
        }
        this.connectedUsers.get(socket.userId)!.add(socket.id);
      }

      // Initialize rooms tracking
      socket.gameRooms = new Set();
      socket.bugRooms = new Set();
      socket.userChatRooms = new Set();

      // Handle joining game chat rooms
      socket.on('join-game-room', async (gameId: string) => {
        try {
          if (!socket.userId) return;

          const game = await prisma.game.findUnique({
            where: { id: gameId }
          });

          if (!game) {
            console.log(`[SocketService] User ${socket.userId} tried to join non-existent game room ${gameId}`);
            socket.emit('error', { message: 'Game not found' });
            return;
          }

          socket.join(`game-${gameId}`);
          socket.gameRooms?.add(gameId);
          
          const socketsInRoom = await this.io.in(`game-${gameId}`).fetchSockets();
          console.log(`[SocketService] User ${socket.userId} joined game room ${gameId} (${socketsInRoom.length} total socket(s) in room)`);
          socket.emit('joined-game-room', { gameId });
        } catch (error) {
          console.error('[SocketService] Error joining game room:', error);
          socket.emit('error', { message: 'Failed to join game room' });
        }
      });

      // Handle leaving game chat rooms
      socket.on('leave-game-room', (gameId: string) => {
        socket.leave(`game-${gameId}`);
        socket.gameRooms?.delete(gameId);
        console.log(`User ${socket.userId} left game room ${gameId}`);
        socket.emit('left-game-room', { gameId });
      });

      // Handle joining bug chat rooms
      socket.on('join-bug-room', async (bugId: string) => {
        try {
          if (!socket.userId) return;

          // Verify bug exists (everyone can view bug chats)
          const bug = await prisma.bug.findUnique({
            where: { id: bugId }
          });

          if (!bug) {
            socket.emit('error', { message: 'Bug not found' });
            return;
          }

          socket.join(`bug-${bugId}`);
          socket.bugRooms?.add(bugId);

          console.log(`User ${socket.userId} joined bug room ${bugId}`);
          socket.emit('joined-bug-room', { bugId });
        } catch (error) {
          console.error('Error joining bug room:', error);
          socket.emit('error', { message: 'Failed to join bug room' });
        }
      });

      // Handle leaving bug chat rooms
      socket.on('leave-bug-room', (bugId: string) => {
        socket.leave(`bug-${bugId}`);
        socket.bugRooms?.delete(bugId);
        console.log(`User ${socket.userId} left bug room ${bugId}`);
        socket.emit('left-bug-room', { bugId });
      });

      // Handle joining user chat rooms
      socket.on('join-user-chat-room', async (chatId: string) => {
        try {
          if (!socket.userId) return;

          // Verify user has access to this chat
          const chat = await prisma.userChat.findUnique({
            where: { id: chatId }
          });

          if (!chat) {
            socket.emit('error', { message: 'Chat not found' });
            return;
          }

          // Check if user is one of the participants
          if (chat.user1Id !== socket.userId && chat.user2Id !== socket.userId) {
            socket.emit('error', { message: 'Access denied to user chat' });
            return;
          }

          socket.join(`user-chat-${chatId}`);
          socket.userChatRooms?.add(chatId);

          console.log(`User ${socket.userId} joined user chat room ${chatId}`);
          socket.emit('joined-user-chat-room', { chatId });
        } catch (error) {
          console.error('Error joining user chat room:', error);
          socket.emit('error', { message: 'Failed to join user chat room' });
        }
      });

      // Handle leaving user chat rooms
      socket.on('leave-user-chat-room', (chatId: string) => {
        socket.leave(`user-chat-${chatId}`);
        socket.userChatRooms?.delete(chatId);
        console.log(`User ${socket.userId} left user chat room ${chatId}`);
        socket.emit('left-user-chat-room', { chatId });
      });

      // Unified join-chat-room handler (for GROUP and future context types)
      socket.on('join-chat-room', async (data: { contextType: ChatContextType; contextId: string }) => {
        try {
          if (!socket.userId) return;

          if (data.contextType === 'GROUP') {
            const groupChannel = await prisma.groupChannel.findUnique({
              where: { id: data.contextId },
              include: {
                participants: {
                  where: { userId: socket.userId }
                }
              }
            });

            if (!groupChannel) {
              socket.emit('error', { message: 'Group/Channel not found' });
              return;
            }

            const userParticipant = groupChannel.participants.find(p => p.userId === socket.userId);
            const isOwner = userParticipant?.role === 'OWNER';
            const isParticipant = !!userParticipant;

            if (!isOwner && !isParticipant && !groupChannel.isPublic) {
              socket.emit('error', { message: 'Access denied to group/channel' });
              return;
            }

            const room = this.getChatRoomName('GROUP', data.contextId);
            socket.join(room);

            console.log(`User ${socket.userId} joined group room ${data.contextId}`);
            socket.emit('joined-chat-room', { contextType: 'GROUP', contextId: data.contextId });
          }
        } catch (error) {
          console.error('[SocketService] Error joining chat room:', error);
          socket.emit('error', { message: 'Failed to join chat room' });
        }
      });

      // Handle leaving unified chat rooms
      socket.on('leave-chat-room', (data: { contextType: ChatContextType; contextId: string }) => {
        if (data.contextType === 'GROUP') {
          const room = this.getChatRoomName('GROUP', data.contextId);
          socket.leave(room);
          console.log(`User ${socket.userId} left group room ${data.contextId}`);
          socket.emit('left-chat-room', { contextType: 'GROUP', contextId: data.contextId });
        }
      });

      socket.on('join-market-item-room', (marketItemId: string) => {
        if (marketItemId) {
          socket.join(`market-item-${marketItemId}`);
          socket.emit('joined-market-item-room', { marketItemId });
        }
      });

      socket.on('leave-market-item-room', (marketItemId: string) => {
        if (marketItemId) {
          socket.leave(`market-item-${marketItemId}`);
          socket.emit('left-market-item-room', { marketItemId });
        }
      });

      socket.emit('sync-required', { timestamp: new Date().toISOString() });

      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        
        if (socket.userId) {
          const userSockets = this.connectedUsers.get(socket.userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              this.connectedUsers.delete(socket.userId);
            }
          }
        }
      });

      // Handle ping from client (heartbeat)
      socket.on('ping', (data: { timestamp?: number }) => {
        // Validate ping data
        if (typeof data?.timestamp === 'number') {
          socket.emit('pong', { timestamp: data.timestamp });
        } else {
          // Still respond to maintain connection, but log invalid ping
          console.warn(`[SocketService] Invalid ping from user ${socket.userId}:`, data);
          socket.emit('pong', { timestamp: Date.now() });
        }
      });

      // Handle message acknowledgment
      socket.on('chat:message-ack', async (data: { messageId: string; contextType: ChatContextType; contextId: string }) => {
        if (!socket.userId) return;

        this.markSocketDelivered(data.messageId, socket.userId);
        console.log(`[SocketService] Message ${data.messageId} acknowledged by user ${socket.userId}`);
      });

      // Handle sync request from client
      socket.on('sync-messages', async (data: { 
        contextType: ChatContextType; 
        contextId: string; 
        lastMessageId?: string 
      }) => {
        if (!socket.userId) return;

        // Notify client that sync is ready
        socket.emit('sync-ready', {
          contextType: data.contextType,
          contextId: data.contextId
        });
      });
    });
  }

  // Emit message reaction to all users in a game room
  public emitMessageReaction(gameId: string, reaction: any) {
    this.io.to(`game-${gameId}`).emit('message-reaction', reaction);
  }

  // Emit message read receipt to all users in a game room
  public emitReadReceipt(gameId: string, readReceipt: any) {
    this.io.to(`game-${gameId}`).emit('read-receipt', readReceipt);
  }

  // Emit message deletion to all users in a game room
  public emitMessageDeleted(gameId: string, messageId: string) {
    this.io.to(`game-${gameId}`).emit('message-deleted', { messageId });
  }

  // Emit bug message reaction to all users in a bug room
  public emitBugMessageReaction(bugId: string, reaction: any) {
    this.io.to(`bug-${bugId}`).emit('bug-message-reaction', reaction);
  }

  // Emit bug message read receipt to all users in a bug room
  public emitBugReadReceipt(bugId: string, readReceipt: any) {
    this.io.to(`bug-${bugId}`).emit('bug-read-receipt', readReceipt);
  }

  // Emit bug message deletion to all users in a bug room
  public emitBugMessageDeleted(bugId: string, messageId: string) {
    this.io.to(`bug-${bugId}`).emit('bug-message-deleted', { messageId });
  }

  // Emit user chat message reaction to all users in a user chat room
  public emitUserMessageReaction(chatId: string, reaction: any) {
    this.io.to(`user-chat-${chatId}`).emit('user-chat-message-reaction', reaction);
  }

  // Emit user chat message read receipt to all users in a user chat room
  public emitUserReadReceipt(chatId: string, readReceipt: any) {
    this.io.to(`user-chat-${chatId}`).emit('user-chat-read-receipt', readReceipt);
  }

  // Emit user chat message deletion to all users in a user chat room
  public emitUserMessageDeleted(chatId: string, messageId: string) {
    this.io.to(`user-chat-${chatId}`).emit('user-chat-message-deleted', { messageId });
  }

  // Emit typing indicator
  public emitTypingIndicator(gameId: string, userId: string, isTyping: boolean) {
    this.io.to(`game-${gameId}`).emit('typing-indicator', { userId, isTyping });
  }

  // ========== UNIFIED CHAT METHODS (NEW) ==========
  // These methods work for all chat context types

  /**
   * Get the room name for a chat context
   */
  private getChatRoomName(contextType: ChatContextType, contextId: string): string {
    const prefix = contextType === 'GAME' ? 'game' : 
                   contextType === 'BUG' ? 'bug' : 
                   contextType === 'USER' ? 'user-chat' :
                   contextType === 'GROUP' ? 'group' : '';
    return `${prefix}-${contextId}`;
  }

  /**
   * Unified method to emit chat events (message, reaction, read-receipt, deleted)
   */
  public emitChatEvent(
    contextType: ChatContextType, 
    contextId: string, 
    eventType: 'message' | 'reaction' | 'read-receipt' | 'deleted' | 'poll-vote',
    data: any,
    messageId?: string
  ) {
    const room = this.getChatRoomName(contextType, contextId);
    const eventName = eventType === 'poll-vote' ? 'poll-vote' : `chat:${eventType}`;
    
    // Emit to room with messageId for acknowledgment
    this.io.to(room).emit(eventName, { 
      contextType, 
      contextId, 
      messageId,
      timestamp: new Date().toISOString(),
      ...data 
    });
    
    // For user chats, also emit directly to both users (for notifications)
    if (contextType === 'USER' && eventType === 'message') {
      this.emitUserChatMessageToUsers(contextId, data.message, messageId);
    }

    // For group channels, also emit directly to all participants
    if (contextType === 'GROUP' && eventType === 'message') {
      this.emitGroupChannelMessageToParticipants(contextId, data.message, messageId);
    }
  }

  public async emitUserChatMessageToUsers(chatId: string, message: any, messageId?: string) {
    try {
      const chat = await prisma.userChat.findUnique({
        where: { id: chatId },
        select: { user1Id: true, user2Id: true }
      });
      
      if (chat) {
        // Emit to user1
        this.connectedUsers.get(chat.user1Id)?.forEach(socketId => {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('chat:message', { 
              contextType: 'USER', 
              contextId: chatId, 
              messageId,
              timestamp: new Date().toISOString(),
              message 
            });
          }
        });
        
        // Emit to user2
        this.connectedUsers.get(chat.user2Id)?.forEach(socketId => {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('chat:message', { 
              contextType: 'USER', 
              contextId: chatId, 
              messageId,
              timestamp: new Date().toISOString(),
              message 
            });
          }
        });
      }
    } catch (error) {
      console.error('Failed to emit user chat message to individual users:', error);
    }
  }

  public async emitGroupChannelMessageToParticipants(groupChannelId: string, message: any, messageId?: string) {
    try {
      const groupChannel = await prisma.groupChannel.findUnique({
        where: { id: groupChannelId },
        include: {
          participants: {
            select: { userId: true }
          }
        }
      });

      if (groupChannel) {
        // Emit to all participants (including sender to ensure they see their own message)
        groupChannel.participants.forEach(participant => {
          this.connectedUsers.get(participant.userId)?.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('chat:message', {
                contextType: 'GROUP',
                contextId: groupChannelId,
                messageId,
                timestamp: new Date().toISOString(),
                message
              });
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to emit group channel message to individual participants:', error);
    }
  }

  /**
   * Record message delivery attempt
   */
  public recordMessageDelivery(
    messageId: string,
    contextType: ChatContextType,
    contextId: string,
    recipients: string[]
  ) {
    this.messageDeliveryAttempts.set(messageId, {
      messageId,
      contextType,
      contextId,
      recipients,
      socketDelivered: new Set(),
      pushDelivered: new Set(),
      timestamp: new Date()
    });

    // Clean up old entries after 5 minutes
    setTimeout(() => {
      this.messageDeliveryAttempts.delete(messageId);
    }, 5 * 60 * 1000);
  }

  /**
   * Mark message as delivered via socket
   */
  public markSocketDelivered(messageId: string, userId: string) {
    const attempt = this.messageDeliveryAttempts.get(messageId);
    if (attempt) {
      attempt.socketDelivered.add(userId);
    }
  }

  /**
   * Mark message as delivered via push
   */
  public markPushDelivered(messageId: string, userId: string) {
    const attempt = this.messageDeliveryAttempts.get(messageId);
    if (attempt) {
      attempt.pushDelivered.add(userId);
    }
  }

  /**
   * Get undelivered recipients for a message
   */
  public getUndeliveredRecipients(messageId: string): string[] {
    const attempt = this.messageDeliveryAttempts.get(messageId);
    if (!attempt) return [];

    const delivered = new Set([
      ...Array.from(attempt.socketDelivered),
      ...Array.from(attempt.pushDelivered)
    ]);

    return attempt.recipients.filter(userId => !delivered.has(userId));
  }

  // Emit new invite notification to specific user
  public emitNewInvite(receiverId: string, invite: any) {
    // Emit to all sockets connected by this user
    this.connectedUsers.get(receiverId)?.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('new-invite', invite);
      }
    });
  }

  // Emit invite deleted notification to specific user
  public emitInviteDeleted(receiverId: string, inviteId: string, gameId?: string) {
    // Emit to all sockets connected by this user
    this.connectedUsers.get(receiverId)?.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('invite-deleted', { inviteId, gameId });
      }
    });
  }

  public async emitNewBug() {
    const developers = await prisma.user.findMany({
      where: { isDeveloper: true },
      select: { id: true }
    });
    for (const dev of developers) {
      this.connectedUsers.get(dev.id)?.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('new-bug', { timestamp: new Date().toISOString() });
        }
      });
    }
  }

  // Emit game update to all users who have access to the game
  public async emitGameUpdate(gameId: string, senderId: string, game?: any, forceUpdate: boolean = false) {
    try {
      console.log(`[SocketService] emitGameUpdate called for gameId: ${gameId}, senderId: ${senderId}`);
      
      let gameToEmit = game;
      if (!gameToEmit) {
        gameToEmit = await GameReadService.getGameById(gameId, senderId);
        if (!gameToEmit) {
          console.log(`[SocketService] Game ${gameId} not found`);
          return;
        }
      }

      const userIds = new Set<string>();
      
      // Add all participants
      if (gameToEmit.participants) {
        gameToEmit.participants.forEach((p: any) => userIds.add(p.userId || p.user?.id));
      }
      
      const invitedParticipants = gameToEmit.participants?.filter((p: any) => p.status === 'INVITED') || [];
      invitedParticipants.forEach((p: any) => userIds.add(p.userId || p.user?.id));
      
      console.log(`[SocketService] Game ${gameId} - isPublic: ${gameToEmit.isPublic}, participant/userIds:`, Array.from(userIds));
      console.log(`[SocketService] Connected users count: ${this.connectedUsers.size}`);
      
      // Get users in the game room to avoid duplicates
      const roomName = `game-${gameId}`;
      const socketsInRoom = await this.io.in(roomName).fetchSockets();
      const userIdsInRoom = new Set<string>();
      
      // Check which users have sockets in this room by checking all connected sockets
      for (const [userId, socketIds] of this.connectedUsers) {
        for (const socketId of socketIds) {
          const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
          if (socket && socket.gameRooms?.has(gameId)) {
            userIdsInRoom.add(userId);
            break; // User found, no need to check other sockets for this user
          }
        }
      }
      
      console.log(`[SocketService] Users in room ${roomName}:`, Array.from(userIdsInRoom), `(${socketsInRoom.length} total sockets)`);
      
      // Emit directly to participants and users with pending invites who are NOT in the room
      let directEmittedCount = 0;
      userIds.forEach(userId => {
        // Skip if user is already in the room (will get it via room broadcast)
        if (userIdsInRoom.has(userId)) {
          console.log(`[SocketService] User ${userId} is in room, skipping direct emit`);
          return;
        }
        
        const userSockets = this.connectedUsers.get(userId);
        if (userSockets) {
          console.log(`[SocketService] User ${userId} has ${userSockets.size} socket(s), emitting directly`);
          userSockets.forEach(socketId => {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('game-updated', { gameId, senderId, game: gameToEmit, forceUpdate });
              directEmittedCount++;
            }
          });
        } else {
          console.log(`[SocketService] User ${userId} is not connected`);
        }
      });
      
      // For public games, emit to all users in the game room (includes participants and non-participants)
      // For private games, also emit to room (participants who joined chat will get it)
      const roomEmitCount = socketsInRoom.length;
      if (roomEmitCount > 0) {
        console.log(`[SocketService] Emitting to game room ${roomName}, sockets in room: ${roomEmitCount}`);
        this.io.to(roomName).emit('game-updated', { 
          gameId, 
          senderId, 
          game: gameToEmit,
          forceUpdate 
        });
      }
      
      console.log(`[SocketService] Emitted game-updated event: ${directEmittedCount} direct socket(s) + ${roomEmitCount} via room broadcast`);
    } catch (error) {
      console.error('Error emitting game update:', error);
    }
  }

  public emitGameResultsUpdated(gameId: string, senderId: string) {
    let recipientCount = 0;
    const recipientUserIds: string[] = [];
    
    this.connectedUsers.forEach((socketIds, userId) => {
      if (userId === senderId) return;
      
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
        if (socket && socket.gameRooms?.has(gameId)) {
          socket.emit('game-results-updated', { gameId });
          recipientCount++;
          if (!recipientUserIds.includes(userId)) {
            recipientUserIds.push(userId);
          }
        }
      });
    });
    
    console.log(`[SocketService] Emitted game-results-updated for game ${gameId} from user ${senderId} to ${recipientCount} socket(s) (${recipientUserIds.length} unique user(s))`);
    if (recipientUserIds.length > 0) {
      console.log(`[SocketService] Recipients: ${recipientUserIds.join(', ')}`);
    }
  }

  public async emitWalletUpdate(userId: string, wallet: number, bandejaBankId?: string | null) {
    if (!userId || userId === bandejaBankId) {
      return;
    }

    const userSockets = this.connectedUsers.get(userId);
    if (!userSockets || userSockets.size === 0) {
      return;
    }

    let emittedCount = 0;
    userSockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('wallet-update', { wallet });
        emittedCount++;
      }
    });

    if (emittedCount > 0) {
      console.log(`[SocketService] Emitted wallet-update to user ${userId} (${emittedCount} socket(s))`);
    }
  }

  // Check if user is online
  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0;
  }

  // Get online users for a game
  public async getOnlineUsersForGame(gameId: string): Promise<string[]> {
    const onlineUsers: string[] = [];
    
    for (const [userId, sockets] of this.connectedUsers) {
      if (sockets.size > 0) {
        // Check if any of this user's sockets are in the game room
        const userSockets = Array.from(sockets);
        for (const socketId of userSockets) {
          const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
          if (socket && socket.gameRooms?.has(gameId)) {
            onlineUsers.push(userId);
            break;
          }
        }
      }
    }
    
    return onlineUsers;
  }

  // Check if user is in a specific chat room
  public async isUserInChatRoom(
    contextType: ChatContextType,
    contextId: string,
    userId: string
  ): Promise<boolean> {
    if (!this.connectedUsers.has(userId)) {
      return false;
    }

    const userSockets = this.connectedUsers.get(userId);
    if (!userSockets || userSockets.size === 0) {
      return false;
    }

    for (const socketId of userSockets) {
      const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
      if (socket) {
        if (contextType === 'GAME' && socket.gameRooms?.has(contextId)) {
          return true;
        } else if (contextType === 'BUG' && socket.bugRooms?.has(contextId)) {
          return true;
        } else if (contextType === 'USER' && socket.userChatRooms?.has(contextId)) {
          return true;
        }
      }
    }

    return false;
  }

  // Get users who are in a specific chat room
  public async getUsersInChatRoom(
    contextType: ChatContextType,
    contextId: string
  ): Promise<Set<string>> {
    const userIds = new Set<string>();
    
    for (const [userId, socketIds] of this.connectedUsers) {
      for (const socketId of socketIds) {
        const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
        if (socket) {
          if (contextType === 'GAME' && socket.gameRooms?.has(contextId)) {
            userIds.add(userId);
            break;
          } else if (contextType === 'BUG' && socket.bugRooms?.has(contextId)) {
            userIds.add(userId);
            break;
          } else if (contextType === 'USER' && socket.userChatRooms?.has(contextId)) {
            userIds.add(userId);
            break;
          }
        }
      }
    }

    return userIds;
  }

  /**
   * Emit unread count update for a specific chat context
   */
  public async emitUnreadCountUpdate(
    contextType: ChatContextType,
    contextId: string,
    userId: string,
    unreadCount: number
  ) {
    const eventName = 'chat:unread-count';
    
    // Emit to the specific user
    this.connectedUsers.get(userId)?.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(eventName, {
          contextType,
          contextId,
          unreadCount
        });
      }
    });
  }

  /**
   * Generic emit method for bet events
   * Emits to the game room so all users viewing the game receive the update
   */
  public async emit(eventName: string, data: any) {
    if (eventName.startsWith('bet:')) {
      const { gameId } = data;
      if (!gameId) {
        console.error(`[SocketService] Cannot emit ${eventName}: missing gameId`);
        return;
      }
      const roomName = `game-${gameId}`;
      const socketsInRoom = await this.io.in(roomName).fetchSockets();
      if (socketsInRoom.length > 0) {
        this.io.to(roomName).emit(eventName, data);
      }
    } else {
      console.warn(`[SocketService] Unknown event type: ${eventName}`);
    }
  }

  public emitAuctionUpdate(marketItemId: string, event: string, payload: any) {
    const room = `market-item-${marketItemId}`;
    this.io.to(room).emit(event, payload);
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}

export default SocketService;
