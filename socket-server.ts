/**
 * Standalone Socket.IO Server for Production Deployment
 * Deploy this to Railway or Render separately from the Next.js app
 */
import { config } from 'dotenv';
import { createServer } from 'http';
import { createSocketServer } from './src/lib/socket';

// Load environment variables from .env.local
config({ path: '.env.local' });

const port = parseInt(process.env.PORT || '3001', 10);

const httpServer = createServer((req, res) => {
  // Health check endpoint for Railway/Render
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'socket-server',
      timestamp: new Date().toISOString() 
    }));
    return;
  }
  
  // CORS preflight - allow all origins for socket.io
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
