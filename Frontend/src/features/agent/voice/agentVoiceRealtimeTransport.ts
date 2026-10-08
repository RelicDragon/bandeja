import { io, type Socket } from 'socket.io-client';
import {
  AGENT_VOICE_NAMESPACE,
  type AgentVoiceClientToServerEvents,
  type AgentVoiceServerToClientEvents,
  type AgentVoiceStartAck,
  type AgentVoiceStartPayload,
} from '@shared/agentVoiceRealtime';
import { AGENT_CLIENT_CAPS } from '@/api/agent';
import { useAuthStore } from '@/store/authStore';
import { isCapacitor } from '@/utils/capacitor';

/**
 * The realtime voice socket (v2): Socket.IO namespace `/agent-voice` with the same JWT and
 * server as the app's main socket (`socketService`), plus `auth.clientCaps` (what the HTTP
 * calls send as `X-Agent-Client-Caps`: runs of voice turns may propose client-executed
 * bookings too). Audio goes out as volatile binary emits
 * (dropped while disconnected rather than queued: stale mic audio is worse than a gap).
 */

/** `reconnecting`: the link dropped and Socket.IO is retrying; `lost`: it gave up / was kicked. */
export type AgentVoiceConnection = 'connected' | 'reconnecting' | 'lost';

type ServerEvent = keyof AgentVoiceServerToClientEvents;
type ClientEvent = Exclude<keyof AgentVoiceClientToServerEvents, 'voice:start' | 'voice:audio' | 'voice:end'>;

export interface AgentVoiceTransport {
  /**
   * Connects (first call) and sends `voice:start`. Never rejects: no token, a connect error or
   * no ack within `timeoutMs` come back as `VOICE_V2_UNAVAILABLE` (→ v1 fallback).
   */
  start(payload: AgentVoiceStartPayload, timeoutMs: number): Promise<AgentVoiceStartAck>;
  on<E extends ServerEvent>(event: E, handler: AgentVoiceServerToClientEvents[E]): void;
  emit<E extends ClientEvent>(event: E, ...args: Parameters<AgentVoiceClientToServerEvents[E]>): void;
  sendAudio(chunk: ArrayBuffer): void;
  onConnection(handler: (connection: AgentVoiceConnection) => void): void;
  /** `voice:end` (when connected) and disconnect. Idempotent. */
  close(): void;
}

export function voiceV2Unavailable(message: string): AgentVoiceStartAck {
  return { ok: false, code: 'VOICE_V2_UNAVAILABLE', message };
}

const AUTH_REJECTED_PREFIX = 'auth: ';

/**
 * The handshake was refused for the token (`Authentication error: …` from the namespace
 * middleware, like the main socket's): worth one token refresh + retry before falling back.
 */
export function voiceAuthRejected(message: string): AgentVoiceStartAck {
  return voiceV2Unavailable(`${AUTH_REJECTED_PREFIX}${message}`);
}

export function isVoiceAuthRejectedAck(ack: AgentVoiceStartAck): boolean {
  return !ack.ok && ack.code === 'VOICE_V2_UNAVAILABLE' && (ack.message ?? '').startsWith(AUTH_REJECTED_PREFIX);
}

/** Same test as `socketService`'s connect_error handler. */
function isAuthConnectError(error: Error): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('auth') || (error as Error & { data?: { status?: number } }).data?.status === 401;
}

/** Same server as the main socket (`socketService.connect`). */
function voiceSocketUrl(): string {
  const base = isCapacitor() ? 'https://bandeja.me' : import.meta.env.VITE_SOCKET_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}${AGENT_VOICE_NAMESPACE}`;
}

type VoiceSocket = Socket<AgentVoiceServerToClientEvents, AgentVoiceClientToServerEvents>;

export class SocketAgentVoiceTransport implements AgentVoiceTransport {
  private socket: VoiceSocket | null = null;
  private closed = false;
  private wasConnected = false;
  private readonly connectionHandlers = new Set<(connection: AgentVoiceConnection) => void>();

  start(payload: AgentVoiceStartPayload, timeoutMs: number): Promise<AgentVoiceStartAck> {
    return new Promise((resolve) => {
      let settled = false;
      let socket: VoiceSocket | null = null;
      const finish = (ack: AgentVoiceStartAck) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket?.off('connect_error', onConnectError);
        // Gave up before connecting: a later connect (a retry's) must not send this start too.
        socket?.off('connect', send);
        resolve(ack);
      };
      let send: () => void = () => {};
      const timer = setTimeout(() => finish(voiceV2Unavailable('timeout')), timeoutMs);
      const onConnectError = (error: Error) => {
        // Only the first connect decides v2 vs v1; later drops are `reconnecting`.
        if (this.wasConnected) return;
        const message = error.message || 'connect_error';
        finish(isAuthConnectError(error) ? voiceAuthRejected(message) : voiceV2Unavailable(message));
      };
      if (this.closed) {
        finish(voiceV2Unavailable('closed'));
        return;
      }
      const live = this.socket ?? this.connect();
      if (!live) {
        finish(voiceV2Unavailable('no token'));
        return;
      }
      socket = live;
      send = () => live.emit('voice:start', payload, (ack) => finish(ack));
      if (live.connected) send();
      else {
        live.once('connect', send);
        live.on('connect_error', onConnectError);
        // A refused handshake leaves the socket inactive: a retry (after a token refresh)
        // connects again, and the `auth` callback reads the fresh token.
        if (!live.active) live.connect();
      }
    });
  }

  on<E extends ServerEvent>(event: E, handler: AgentVoiceServerToClientEvents[E]): void {
    // Handlers are attached before `start`: the socket exists from the first `start` call on.
    this.pending.push([event, handler as AgentVoiceServerToClientEvents[ServerEvent]]);
    if (this.socket) this.attach(event, handler);
  }

  emit<E extends ClientEvent>(event: E, ...args: Parameters<AgentVoiceClientToServerEvents[E]>): void {
    const socket = this.socket;
    if (!socket?.connected) return;
    (socket.emit as (ev: string, ...rest: unknown[]) => void)(event, ...args);
  }

  sendAudio(chunk: ArrayBuffer): void {
    const socket = this.socket;
    if (!socket?.connected) return;
    socket.volatile.emit('voice:audio', chunk);
  }

  onConnection(handler: (connection: AgentVoiceConnection) => void): void {
    this.connectionHandlers.add(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    this.socket = null;
    this.connectionHandlers.clear();
    if (!socket) return;
    if (socket.connected) socket.emit('voice:end');
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
  }

  private pending: [ServerEvent, AgentVoiceServerToClientEvents[ServerEvent]][] = [];

  private attach<E extends ServerEvent>(event: E, handler: AgentVoiceServerToClientEvents[E]): void {
    (this.socket?.on as ((ev: string, fn: unknown) => void) | undefined)?.call(this.socket, event, handler);
  }

  private connect(): VoiceSocket | null {
    if (!useAuthStore.getState().token) return null;
    const socket: VoiceSocket = io(voiceSocketUrl(), {
      // Read on every (re)connect: a refreshed access token is picked up.
      auth: (cb) => cb({ token: useAuthStore.getState().token, clientCaps: AGENT_CLIENT_CAPS }),
      path: '/socket.io/',
      transports: ['websocket'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 4,
      reconnectionDelay: 400,
      reconnectionDelayMax: 2000,
      timeout: 4000,
    });
    this.socket = socket;
    for (const [event, handler] of this.pending) this.attach(event, handler);
    socket.on('connect', () => {
      const reconnected = this.wasConnected;
      this.wasConnected = true;
      if (reconnected) this.notify('connected');
    });
    socket.on('disconnect', (reason) => {
      if (this.closed || !this.wasConnected) return;
      // Kicked by the server (auth, session replaced): Socket.IO won't retry on its own.
      this.notify(reason === 'io server disconnect' ? 'lost' : 'reconnecting');
    });
    socket.io.on('reconnect_failed', () => this.notify('lost'));
    return socket;
  }

  private notify(connection: AgentVoiceConnection): void {
    for (const handler of this.connectionHandlers) handler(connection);
  }
}
