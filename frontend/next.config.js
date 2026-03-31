/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['picsum.photos', 'i.scdn.co', 'images.unsplash.com'],
        unoptimized: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    },
    webpack: (config) => {
        config.resolve.fallback = { fs: false, crypto: false, path: false, os: false };
        config.ignoreWarnings = [
            { module: /node_modules\/@vladmandic\/face-api/ }
        ];
        return config;
    },
}

module.exports = nextConfig
