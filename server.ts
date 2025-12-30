import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import compression from 'compression';
import { createSocketServer } from './src/lib/socket';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Configure compression middleware
const compressionMiddleware = compression({
  level: 6, // Balanced compression level (1-9)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't accept it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression's default filter (compresses text-based content)
    return compression.filter(req, res);
  },
});

// Promisify compression middleware
const applyCompression = (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Cast to any to satisfy compression middleware types
    compressionMiddleware(req as any, res as any, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    // Apply gzip/deflate compression
    await applyCompression(req, res);
    
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize Socket.IO server
  const io = createSocketServer(httpServer);
  console.log('Socket.IO server initialized');

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO server running`);
  });
});
