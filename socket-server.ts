/**
 * Standalone Socket.IO Server for Production Deployment
 * 
 * This server runs independently from the Next.js frontend.
 * Deploy to Railway, Render, or any Node.js hosting platform.
 * 
 * Required Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - AUTH_SECRET: Same secret used by the frontend for JWT verification
 * - NEXT_PUBLIC_APP_URL: Frontend URL(s) for CORS (comma-separated)
 * - PORT: Server port (usually set by hosting platform)
 * 
 * Optional:
 * - REDIS_URL: For distributed presence (multi-instance deployments)
 */
import { config as dotenvConfig } from 'dotenv';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import compression from 'compression';
import { createSocketServer, getOnlineUsers } from './src/lib/socket';

// Load environment variables from .env.local (development only)
dotenvConfig({ path: '.env.local' });

const port = parseInt(process.env.PORT || '3001', 10);
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'AUTH_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('   These must match the frontend configuration for auth to work.');
  process.exit(1);
}

// Configure compression middleware
const compressionMiddleware = compression({
  level: 6,
  threshold: 512,
});

const applyCompression = (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  return new Promise((resolve) => {
    compressionMiddleware(req as any, res as any, () => resolve());
  });
};

const httpServer = createServer(async (req, res) => {
  await applyCompression(req, res);
  
  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    const onlineUsers = await getOnlineUsers();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'socket-server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      compression: 'enabled',
      config: {
        corsOrigin: appUrl,
        mongoConnected: true,
      },
      presence: {
        onlineUsersCount: onlineUsers.length,
      }
    }));
    return;
  }
  
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// Initialize Socket.IO server
const io = createSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`🚀 Socket.IO server running on port ${port}`);
  console.log(`📡 Health check: http://localhost:${port}/health`);
  console.log(`🌐 CORS origin: ${process.env.NEXT_PUBLIC_APP_URL || 'all origins (dev mode)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
