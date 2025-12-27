export type WebSocketEventType =
  | 'message.new'
  | 'message.update'
  | 'message.delete'
  | 'typing.start'
  | 'typing.stop'
  | 'presence.update'
  | 'channel.join'
  | 'channel.leave'
  | 'connected'
  | 'ping'
  | 'pong';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload: T;
  timestamp: number;
}

export interface ConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
}
