import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  gameRooms?: Set<string>;
  bugRooms?: Set<string>;
}

class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(server: HTTPServer) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://91.98.232.51",
      "http://10.0.0.2"
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

      // Initialize game rooms tracking
      socket.gameRooms = new Set();
      socket.bugRooms = new Set();

      // Handle joining game chat rooms
      socket.on('join-game-room', async (gameId: string) => {
        try {
          if (!socket.userId) return;

          // Verify user has access to this game
          const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
              participants: {
                where: { userId: socket.userId }
              },
              invites: {
                where: { 
                  receiverId: socket.userId,
                  status: 'PENDING'
                }
              },
            }
          });

          if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
          }

          const isParticipant = game.participants.length > 0;
          const hasPendingInvite = game.invites.length > 0;
          const isPublicGame = game.isPublic;

          if (!isParticipant && !hasPendingInvite && !isPublicGame) {
            socket.emit('error', { message: 'Access denied to game chat' });
            return;
          }

          socket.join(`game-${gameId}`);
          socket.gameRooms?.add(gameId);
          
          console.log(`User ${socket.userId} joined game room ${gameId}`);
          socket.emit('joined-game-room', { gameId });
        } catch (error) {
          console.error('Error joining game room:', error);
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

          // Verify user has access to this bug
          const bug = await prisma.bug.findUnique({
            where: { id: bugId },
            include: {
              sender: true
            }
          });

          if (!bug) {
            socket.emit('error', { message: 'Bug not found' });
            return;
          }

          // Check if user is the bug sender or an admin
          const user = await prisma.user.findUnique({
            where: { id: socket.userId },
            select: { isAdmin: true, isTrainer: true }
          });

          const isSender = bug.senderId === socket.userId;
          const isAdmin = user?.isAdmin || user?.isTrainer;

          if (!isSender && !isAdmin) {
            socket.emit('error', { message: 'Access denied to bug chat' });
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

      // Handle disconnect
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
    });
  }

  // Emit new message to all users in a game room
  public emitNewMessage(gameId: string, message: any) {
    this.io.to(`game-${gameId}`).emit('new-message', message);
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

  // Emit new bug message to all users in a bug room
  public emitNewBugMessage(bugId: string, message: any) {
    this.io.to(`bug-${bugId}`).emit('new-bug-message', message);
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

  // Emit typing indicator
  public emitTypingIndicator(gameId: string, userId: string, isTyping: boolean) {
    this.io.to(`game-${gameId}`).emit('typing-indicator', { userId, isTyping });
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

  public getIO(): SocketIOServer {
    return this.io;
  }
}

export default SocketService;
