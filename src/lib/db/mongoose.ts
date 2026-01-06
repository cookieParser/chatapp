import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

/**
 * MongoDB Connection with Optimized Connection Pooling
 * 
 * Pool settings optimized for chat application workloads:
 * - High read/write frequency
 * - Many concurrent connections
 * - Real-time message delivery
 */
const connectionOptions: mongoose.ConnectOptions = {
  // Connection Pool Settings
  maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || '50', 10), // Max connections in pool
  minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '10', 10), // Min connections to maintain
  maxIdleTimeMS: 30000, // Close idle connections after 30s
  
  // Timeouts
  serverSelectionTimeoutMS: 5000, // Timeout for server selection
  socketTimeoutMS: 45000, // Socket timeout
  connectTimeoutMS: 10000, // Initial connection timeout
  
  // Write Concern (balance between safety and speed)
  w: 'majority', // Wait for majority acknowledgment
  wtimeoutMS: 2500, // Write timeout
  
  // Read Preference
  readPreference: 'primaryPreferred', // Read from primary, fallback to secondary
  
  // Retry Logic
  retryWrites: true, // Retry failed writes
  retryReads: true, // Retry failed reads
  
  // Compression (reduces network bandwidth)
  compressors: ['zstd', 'snappy', 'zlib'],
  
  // Heartbeat
  heartbeatFrequencyMS: 10000, // Check server health every 10s
};

export async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, connectionOptions).then((mongoose) => {
      console.log('✅ MongoDB connected with connection pooling');
      console.log(`   Pool size: ${connectionOptions.minPoolSize}-${connectionOptions.maxPoolSize}`);
      
      // Monitor connection pool events
      mongoose.connection.on('connected', () => {
        console.log('📊 MongoDB connection established');
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
      });
      
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });
      
      return mongoose;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Get connection pool statistics
 */
export function getPoolStats(): { 
  available: number; 
  pending: number; 
  totalCreated: number;
} | null {
  if (!cached.conn?.connection?.db) return null;
  
  // Note: Detailed pool stats require MongoDB driver internals
  // This is a simplified version
  return {
    available: cached.conn.connection.readyState === 1 ? 1 : 0,
    pending: 0,
    totalCreated: 1,
  };
}

/**
 * Graceful shutdown
 */
export async function disconnectDB(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.log('🔌 MongoDB disconnected gracefully');
  }
}

export default connectDB;
