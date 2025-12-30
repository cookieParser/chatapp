/**
 * Compression Verification Script
 * 
 * Run this script to verify that gzip/brotli compression is working in production.
 * Usage: npx tsx scripts/verify-compression.ts [url]
 * 
 * Example:
 *   npx tsx scripts/verify-compression.ts https://your-app.com
 *   npx tsx scripts/verify-compression.ts http://localhost:3000
 */

export {};

const BASE_URL = process.argv[2] || 'http://localhost:3000';

interface CompressionResult {
  url: string;
  contentEncoding: string | null;
  contentLength: number | null;
  uncompressedSize: number;
  compressionRatio: string;
  isCompressed: boolean;
}

async function checkCompression(path: string): Promise<CompressionResult> {
  const url = `${BASE_URL}${path}`;
  
  try {
    // Request with Accept-Encoding header to get compressed response
    const compressedResponse = await fetch(url, {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    
    const contentEncoding = compressedResponse.headers.get('content-encoding');
    const contentLength = compressedResponse.headers.get('content-length');
    const body = await compressedResponse.text();
    
    const compressedSize = contentLength ? parseInt(contentLength, 10) : body.length;
    const uncompressedSize = body.length;
    
    // Calculate compression ratio
    const ratio = contentLength 
      ? ((1 - compressedSize / uncompressedSize) * 100).toFixed(1)
      : 'N/A (chunked)';
    
    return {
      url: path,
      contentEncoding,
      contentLength: contentLength ? parseInt(contentLength, 10) : null,
      uncompressedSize,
      compressionRatio: `${ratio}%`,
      isCompressed: !!contentEncoding && ['gzip', 'br', 'deflate'].includes(contentEncoding),
    };
  } catch (error) {
    console.error(`Error checking ${url}:`, error);
    return {
      url: path,
      contentEncoding: null,
      contentLength: null,
      uncompressedSize: 0,
      compressionRatio: 'Error',
      isCompressed: false,
    };
  }
}

async function checkSocketHealth(): Promise<void> {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `${BASE_URL.replace(':3000', ':3001')}`;
  
  try {
    const response = await fetch(`${socketUrl}/health`, {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    
    const data = await response.json();
    const contentEncoding = response.headers.get('content-encoding');
    
    console.log('\n📡 Socket Server Health:');
    console.log(`   URL: ${socketUrl}/health`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Compression: ${contentEncoding || 'none'}`);
    console.log(`   Compression Enabled: ${data.compression || 'unknown'}`);
  } catch (error) {
    console.log('\n📡 Socket Server: Not reachable (may be on different port/host)');
  }
}

async function main() {
  console.log('🔍 Compression Verification Tool');
  console.log(`   Target: ${BASE_URL}\n`);
  
  // Test various endpoints
  const endpoints = [
    '/',
    '/api/auth/session',
    '/api/conversations',
  ];
  
  console.log('📊 HTTP Compression Results:');
  console.log('─'.repeat(80));
  console.log(
    'Endpoint'.padEnd(30) +
    'Encoding'.padEnd(12) +
    'Size'.padEnd(12) +
    'Ratio'.padEnd(12) +
    'Status'
  );
  console.log('─'.repeat(80));
  
  for (const endpoint of endpoints) {
    const result = await checkCompression(endpoint);
    console.log(
      result.url.padEnd(30) +
      (result.contentEncoding || 'none').padEnd(12) +
      (result.contentLength?.toString() || 'chunked').padEnd(12) +
      result.compressionRatio.padEnd(12) +
      (result.isCompressed ? '✅ Compressed' : '⚠️  Not compressed')
    );
  }
  
  // Check socket server
  await checkSocketHealth();
  
  console.log('\n📝 Notes:');
  console.log('   - gzip/br/deflate in Encoding column indicates compression is working');
  console.log('   - Small responses (<1KB) may not be compressed (threshold optimization)');
  console.log('   - Socket.IO uses per-message deflate for WebSocket frames');
  console.log('   - Check browser DevTools Network tab for real-world verification');
  
  console.log('\n🔧 Browser Verification Steps:');
  console.log('   1. Open DevTools → Network tab');
  console.log('   2. Look for "Content-Encoding: gzip" or "br" in response headers');
  console.log('   3. Compare "Size" vs "Content" columns (Size should be smaller)');
  console.log('   4. For WebSocket, check WS frames in Network → WS tab');
}

main().catch(console.error);
