/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['picsum.photos', 'i.scdn.co', 'images.unsplash.com'],
        unoptimized: true,
    },
    env: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    },
}

module.exports = nextConfig
