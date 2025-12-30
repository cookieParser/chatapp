import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Enable gzip compression for production builds
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // Optimize API response sizes
  experimental: {
    // Optimize server components payload
    optimizePackageImports: ['lucide-react', '@radix-ui/react-avatar', '@radix-ui/react-scroll-area'],
  },
};

export default nextConfig;
