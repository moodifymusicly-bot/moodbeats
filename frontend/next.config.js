/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: [
            'picsum.photos',
            'i.scdn.co',
            'images.unsplash.com',
            'i.ytimg.com',
            'img.youtube.com',
        ],
        unoptimized: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001',
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
