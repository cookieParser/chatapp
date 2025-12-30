/**
 * Service Separation Verification Script
 * 
 * Verifies that both frontend and socket server are properly configured
 * and can communicate with each other.
 * 
 * Usage:
 *   npx tsx scripts/verify-services.ts
 *   npx tsx scripts/verify-services.ts https://your-app.com https://your-socket.railway.app
 */

export {};

const FRONTEND_URL = process.argv[2] || 'http://localhost:3000';
const SOCKET_URL = process.argv[3] || 'http://localhost:3001';

interface HealthResponse {
  status: string;
  service: string;
  config?: {
    socketUrl?: string;
    corsOrigin?: string;
    authConfigured?: boolean;
    dbConfigured?: boolean;
    mongoConnected?: boolean;
  };
}

async function checkService(name: string, url: string, endpoint: string): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${url}${endpoint}`);
    if (!response.ok) {
      console.log(`❌ ${name}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`❌ ${name}: Connection failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Service Separation Verification\n');
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Socket URL:   ${SOCKET_URL}\n`);
  console.log('─'.repeat(60));

  // Check Frontend
  console.log('\n📱 Frontend Service:');
  const frontend = await checkService('Frontend', FRONTEND_URL, '/api/health');
  if (frontend) {
    console.log(`   ✅ Status: ${frontend.status}`);
    console.log(`   ✅ Service: ${frontend.service}`);
    if (frontend.config) {
      console.log(`   ${frontend.config.authConfigured ? '✅' : '❌'} Auth configured`);
      console.log(`   ${frontend.config.dbConfigured ? '✅' : '❌'} Database configured`);
      console.log(`   📡 Socket URL: ${frontend.config.socketUrl}`);
    }
  }

  // Check Socket Server
  console.log('\n🔌 Socket Server:');
  const socket = await checkService('Socket', SOCKET_URL, '/health');
  if (socket) {
    console.log(`   ✅ Status: ${socket.status}`);
    console.log(`   ✅ Service: ${socket.service}`);
    if (socket.config) {
      console.log(`   ${socket.config.mongoConnected ? '✅' : '❌'} MongoDB connected`);
      console.log(`   🌐 CORS Origin: ${socket.config.corsOrigin}`);
    }
  }

  // Verify configuration alignment
  console.log('\n─'.repeat(60));
  console.log('\n🔗 Configuration Alignment:');
  
  if (frontend && socket) {
    // Check if frontend points to correct socket server
    const frontendSocketUrl = frontend.config?.socketUrl || '';
    const socketMatches = frontendSocketUrl.includes(new URL(SOCKET_URL).host) || 
                          frontendSocketUrl === SOCKET_URL;
    console.log(`   ${socketMatches ? '✅' : '⚠️ '} Frontend → Socket URL ${socketMatches ? 'matches' : 'may not match'}`);
    
    // Check if socket server allows frontend origin
    const corsOrigin = socket.config?.corsOrigin || '';
    const corsMatches = corsOrigin.includes(new URL(FRONTEND_URL).host) ||
                        corsOrigin === FRONTEND_URL ||
                        corsOrigin.includes('localhost');
    console.log(`   ${corsMatches ? '✅' : '⚠️ '} Socket CORS ${corsMatches ? 'allows' : 'may not allow'} frontend`);
    
    console.log('\n✅ Both services are running!');
  } else {
    console.log('\n❌ One or both services are not responding.');
    console.log('   Make sure both services are running and accessible.');
  }

  console.log('\n📝 Checklist:');
  console.log('   [ ] AUTH_SECRET is identical on both services');
  console.log('   [ ] MONGODB_URI points to the same database');
  console.log('   [ ] NEXT_PUBLIC_SOCKET_URL on frontend matches socket server URL');
  console.log('   [ ] NEXT_PUBLIC_APP_URL on socket server matches frontend URL');
  console.log('   [ ] MongoDB Atlas network access allows both service IPs');
}

main().catch(console.error);
