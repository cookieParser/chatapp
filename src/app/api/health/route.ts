import { NextResponse } from 'next/server';

export async function GET() {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'not configured';
  
  return NextResponse.json({
    status: 'ok',
    service: 'frontend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    config: {
      socketUrl,
      authConfigured: !!process.env.AUTH_SECRET,
      dbConfigured: !!process.env.MONGODB_URI,
    },
  });
}
