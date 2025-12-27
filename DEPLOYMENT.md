# Production Deployment Guide

This guide covers deploying the chat application with multiple options:
- **Option 1**: Vercel + Railway/Render (Serverless)
- **Option 2**: Docker + Jenkins CI/CD (Self-hosted)

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web Server    │     │  Socket Server   │     │  MongoDB Atlas  │
│   (Next.js)     │────▶│  (Socket.IO)     │────▶│   (Database)    │
│   HTTP/SSR      │     │   WebSockets     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## Option 1: Docker + Jenkins (Recommended for Production)

### Quick Start with Docker

```bash
# Development
docker-compose -f docker-compose.dev.yml up

# Production
docker-compose up -d
```

### Docker Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Production Next.js app |
| `Dockerfile.socket` | Socket.IO server |
| `Dockerfile.dev` | Development with hot reload |
| `docker-compose.yml` | Production orchestration |
| `docker-compose.dev.yml` | Development orchestration |

### Setup Steps

1. **Copy environment file**:
   ```bash
   cp .env.docker.example .env
   # Edit .env with your values
   ```

2. **Build and run**:
   ```bash
   docker-compose up --build -d
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f
   ```

4. **Stop**:
   ```bash
   docker-compose down
   ```

### Jenkins CI/CD Pipeline

#### Prerequisites
- Jenkins server with Docker installed
- Docker registry (Docker Hub, GitHub Container Registry, or private)
- SSH access to deployment server

#### Jenkins Setup

1. **Install Jenkins plugins**:
   - Docker Pipeline
   - SSH Agent
   - Credentials Binding

2. **Add credentials in Jenkins**:
   - `docker-credentials`: Docker registry username/password
   - `docker-registry-url`: Your registry URL (e.g., `ghcr.io`)
   - `deploy-server-ssh`: SSH key for deployment server

3. **Create Pipeline Job**:
   - New Item → Pipeline
   - Pipeline from SCM → Git
   - Script Path: `Jenkinsfile`

#### Pipeline Stages

```
Checkout → Install → Lint → Test → Build Images → Push → Deploy
```

The `Jenkinsfile` includes:
- Parallel Docker builds for web and socket
- Automatic deployment to staging (develop branch)
- Manual approval for production (main branch)
- Image tagging with build number and git commit

#### Deployment Server Setup

On your production server:

```bash
# Create app directory
sudo mkdir -p /opt/chatapp
sudo chown deploy:deploy /opt/chatapp

# Copy docker-compose.yml and .env
cd /opt/chatapp
# ... copy files ...

# Pull and run
docker-compose pull
docker-compose up -d
```

### GitHub Actions Alternative

If you prefer GitHub Actions over Jenkins, the workflow is in `.github/workflows/docker-build.yml`.

Add these secrets to your GitHub repository:
- `DEPLOY_HOST`: Server IP/hostname
- `DEPLOY_USER`: SSH username
- `DEPLOY_SSH_KEY`: SSH private key
- `NEXT_PUBLIC_SOCKET_URL`: Socket server URL
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: VAPID public key

---

## Option 2: Vercel + Railway/Render (Serverless)

## 1. MongoDB Atlas Setup

### Create Cluster
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a new project or use existing
3. Click "Build a Database" → Choose M0 (Free) or higher for production
4. Select your preferred cloud provider and region
5. Create cluster

### Configure Access
1. **Database Access**: Create a database user with read/write permissions
2. **Network Access**: 
   - For development: Add your IP
   - For production: Add `0.0.0.0/0` (allows all IPs) or specific Vercel/Railway IPs

### Get Connection String
1. Click "Connect" → "Connect your application"
2. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/chatapp?retryWrites=true&w=majority
   ```

---

## 2. Separate Socket Server for Production

Since Vercel doesn't support persistent WebSocket connections, we need a standalone Socket.IO server.

### Option A: Deploy to Railway

1. Create a new project on [Railway](https://railway.app/)
2. Connect your GitHub repository
3. Set the root directory to `/` (or create a separate repo for socket server)
4. Configure build settings:
   - Build Command: `npm install && npm run build:socket`
   - Start Command: `npm run start:socket`

### Option B: Deploy to Render

1. Create a new Web Service on [Render](https://render.com/)
2. Connect your GitHub repository
3. Configure:
   - Build Command: `npm install && npm run build:socket`
   - Start Command: `npm run start:socket`
   - Environment: Node

---

## 3. Environment Variables

### Vercel (Next.js App)
```env
# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/chatapp

# Auth.js
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://your-app.vercel.app

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Socket Server URL (Railway/Render)
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.railway.app

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

### Railway/Render (Socket Server)
```env
# MongoDB (same as Vercel)
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/chatapp

# CORS - Allow your Vercel domain
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Port (Railway/Render sets this automatically)
PORT=3001

# Node environment
NODE_ENV=production
```

---

## 4. Code Changes Required


### 4.1 Create Standalone Socket Server

Create `socket-server.ts` in the root directory:

```typescript
// socket-server.ts - Standalone Socket.IO server for Railway/Render
import { createServer } from 'http';
import { createSocketServer } from './src/lib/socket';

const port = parseInt(process.env.PORT || '3001', 10);

const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const io = createSocketServer(httpServer);

httpServer.listen(port, () => {
  console.log(`Socket.IO server running on port ${port}`);
});
```

### 4.2 Update package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build:socket": "tsc socket-server.ts --outDir dist --esModuleInterop --module commonjs --target ES2020",
    "start:socket": "node dist/socket-server.js"
  }
}
```

### 4.3 Update Socket Client Connection

Update your socket client to use the environment variable for the server URL.

In your socket client hook/service, update the connection:

```typescript
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

const socket = io(SOCKET_URL, {
  auth: { userId, username },
  transports: ['websocket', 'polling'],
});
```

---

## 5. Deploy to Vercel

### Via Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Via GitHub Integration
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure:
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
5. Add environment variables
6. Deploy

### vercel.json (optional)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

---

## 6. Deploy Socket Server to Railway

### Via Railway CLI
```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

### Via Dashboard
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Configure:
   - Start Command: `npm run start:socket`
5. Add environment variables
6. Deploy

### railway.json (optional)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start:socket",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## 7. Deploy Socket Server to Render (Alternative)

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New" → "Web Service"
3. Connect your repository
4. Configure:
   - Name: `chat-socket-server`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm run start:socket`
5. Add environment variables
6. Deploy

### render.yaml (optional)
```yaml
services:
  - type: web
    name: chat-socket-server
    env: node
    buildCommand: npm install
    startCommand: npm run start:socket
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false
      - key: NEXT_PUBLIC_APP_URL
        sync: false
```

---

## 8. Post-Deployment Checklist

- [ ] MongoDB Atlas cluster is running and accessible
- [ ] Network access configured for Vercel and Railway/Render IPs
- [ ] All environment variables set in Vercel
- [ ] All environment variables set in Railway/Render
- [ ] Google OAuth redirect URIs updated for production domain
- [ ] CORS configured correctly (NEXT_PUBLIC_APP_URL matches Vercel domain)
- [ ] Socket client connecting to correct production URL
- [ ] Health check endpoint responding on socket server
- [ ] Test real-time messaging functionality
- [ ] Test authentication flow

---

## 9. Troubleshooting

### WebSocket Connection Issues
- Verify `NEXT_PUBLIC_SOCKET_URL` is set correctly in Vercel
- Check CORS settings in socket server (`NEXT_PUBLIC_APP_URL`)
- Ensure Railway/Render is exposing the correct port

### MongoDB Connection Issues
- Verify connection string is correct
- Check Network Access in MongoDB Atlas (allow 0.0.0.0/0 for testing)
- Ensure database user has correct permissions

### Authentication Issues
- Verify `AUTH_SECRET` is set and matches across environments
- Update Google OAuth redirect URIs to include production domain
- Check `NEXTAUTH_URL` matches your Vercel domain

---

## 10. Security Recommendations

1. **Use strong secrets**: Generate `AUTH_SECRET` with `openssl rand -base64 32`
2. **Restrict MongoDB access**: Use specific IPs instead of 0.0.0.0/0 in production
3. **Enable rate limiting**: Already implemented in socket server
4. **Use HTTPS**: Vercel and Railway/Render provide this automatically
5. **Rotate credentials**: Regularly update database passwords and API keys
