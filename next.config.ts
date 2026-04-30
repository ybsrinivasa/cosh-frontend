import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // INTERNAL_API_URL is the URL the Next.js server uses to reach the API.
    // Dev:        http://localhost:8000  (set in .env.local)
    // Production: http://api:8000        (Docker internal network, set in docker-compose env)
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ]
  },
};

export default nextConfig;
