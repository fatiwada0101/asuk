/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/login',
        destination: '/auth',
      },
      {
        source: '/signup',
        destination: '/auth',
      },
    ];
  },
};

export default nextConfig;

