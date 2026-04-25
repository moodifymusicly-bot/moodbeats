import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from 'react-hot-toast'
import '@/styles/globals.css'

export const metadata: Metadata = {
    title: 'MoodBeats — AI-Powered Music for Every Mood',
    description: 'Discover music that matches your mood. Powered by deep learning hybrid recommendations.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ClerkProvider
            appearance={{
                variables: {
                    colorPrimary: '#00d4ff',
                    colorBackground: '#0e0e10',
                    colorInputBackground: 'rgba(255,255,255,0.05)',
                    colorInputText: '#f0f0f2',
                    colorText: '#f0f0f2',
                },
            }}
        >
            <html lang="en" className="dark">
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
                    <meta name="theme-color" content="#0e0e10" />
                    <meta name="apple-mobile-web-app-capable" content="yes" />
                    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                    <link rel="preconnect" href="https://fonts.googleapis.com" />
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                </head>
                <body className="min-h-[100dvh] bg-[var(--bg)] text-[var(--text-primary)] antialiased overflow-x-hidden">
                    {children}
                    <Toaster
                        position="top-center"
                        toastOptions={{
                            duration: 2000,
                            style: {
                                background: 'rgba(22,22,24,0.95)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                borderRadius: '12px',
                                border: '1px solid var(--border)',
                                backdropFilter: 'blur(12px)',
                                padding: '10px 16px',
                            },
                        }}
                    />
                </body>
            </html>
        </ClerkProvider>
    )
}
