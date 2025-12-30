/**
 * Environment Configuration
 * 
 * Centralized environment variable management for service separation.
 * Both frontend and socket server use this for consistent configuration.
 */

// Service identification
export const SERVICE_TYPE = process.env.SERVICE_TYPE || 'combined'; // 'frontend', 'socket', 'combined'
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';

// Server configuration
export const config = {
  // Service ports
  port: parseInt(process.env.PORT || '3000', 10),
  socketPort: parseInt(process.env.SOCKET_PORT || '3001', 10),
  hostname: process.env.HOSTNAME || 'localhost',
  
  // URLs
  appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  
  // Database
  mongodbUri: process.env.MONGODB_URI || '',
  redisUrl: process.env.REDIS_URL,
  
  // Authentication
  authSecret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '',
  
  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  
  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  
  // Push notifications
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
} as const;

// CORS configuration for socket server
export function getCorsOrigins(): string[] {
  const configuredOrigins = (process.env.NEXT_PUBLIC_APP_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  
  const defaultOrigins = IS_PRODUCTION ? [] : [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ];
  
  return [...new Set([...defaultOrigins, ...configuredOrigins])];
}

// Validation for required environment variables
export function validateEnv(service: 'frontend' | 'socket' | 'combined' = 'combined'): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Required for all services
  if (!config.mongodbUri) missing.push('MONGODB_URI');
  if (!config.authSecret) missing.push('AUTH_SECRET');
  
  // Required for frontend
  if (service === 'frontend' || service === 'combined') {
    if (IS_PRODUCTION && !config.appUrl) missing.push('NEXT_PUBLIC_APP_URL');
  }
  
  // Required for socket server
  if (service === 'socket' || service === 'combined') {
    if (IS_PRODUCTION && !config.socketUrl) missing.push('NEXT_PUBLIC_SOCKET_URL');
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

// Log configuration (safe - no secrets)
export function logConfig(): void {
  console.log('📋 Service Configuration:');
  console.log(`   Service Type: ${SERVICE_TYPE}`);
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   App URL: ${config.appUrl}`);
  console.log(`   Socket URL: ${config.socketUrl}`);
  console.log(`   MongoDB: ${config.mongodbUri ? '✓ configured' : '✗ missing'}`);
  console.log(`   Auth Secret: ${config.authSecret ? '✓ configured' : '✗ missing'}`);
  console.log(`   Redis: ${config.redisUrl ? '✓ configured' : '○ not configured (using memory)'}`);
}
