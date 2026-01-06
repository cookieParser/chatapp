/**
 * MessagePack Serializer for Socket.IO
 * 
 * Binary serialization reduces message size by 30-50% compared to JSON.
 * Faster parsing on both client and server.
 * 
 * Usage:
 * - Server: io.engine.use(msgpackParser)
 * - Client: socket.io-msgpack-parser
 */

import { encode, decode } from '@msgpack/msgpack';

/**
 * Custom Socket.IO parser using MessagePack
 */
export const msgpackParser = {
  protocol: 5,
  
  Encoder: class {
    encode(packet: any) {
      return [encode(packet)];
    }
  },
  
  Decoder: class {
    private callbacks: Map<string, (decoded: any) => void> = new Map();
    
    on(event: string, callback: (decoded: any) => void) {
      this.callbacks.set(event, callback);
    }
    
    add(chunk: ArrayBuffer | Uint8Array) {
      const decoded = decode(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : chunk);
      const callback = this.callbacks.get('decoded');
      if (callback) {
        callback(decoded);
      }
    }
    
    destroy() {
      this.callbacks.clear();
    }
  },
};

/**
 * Serialize message for transmission
 */
export function serializeMessage<T>(data: T): Uint8Array {
  return encode(data);
}

/**
 * Deserialize received message
 */
export function deserializeMessage<T>(data: Uint8Array | ArrayBuffer): T {
  const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return decode(buffer) as T;
}

/**
 * Calculate size savings
 */
export function compareSerializationSize(data: unknown): {
  jsonSize: number;
  msgpackSize: number;
  savings: string;
} {
  const jsonSize = new TextEncoder().encode(JSON.stringify(data)).length;
  const msgpackSize = encode(data).length;
  const savings = ((1 - msgpackSize / jsonSize) * 100).toFixed(1);
  
  return {
    jsonSize,
    msgpackSize,
    savings: `${savings}%`,
  };
}
