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
                    colorPrimary: '#9333ea',
                    colorBackground: '#0a0a0f',
                    colorInputBackground: 'rgba(255,255,255,0.05)',
                    colorInputText: '#ffffff',
                    colorText: '#ffffff',
                },
            }}
        >
            <html lang="en" className="dark">
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
                    <meta name="theme-color" content="#0a0a0f" />
                    <meta name="apple-mobile-web-app-capable" content="yes" />
                    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                    <link
                        rel="preconnect"
                        href="https://fonts.googleapis.com"
                    />
                    <link
                        rel="preconnect"
                        href="https://fonts.gstatic.com"
                        crossOrigin="anonymous"
                    />
                    <link
                        rel="stylesheet"
                        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
                        // @ts-ignore
                        fetchPriority="low"
                    />
                </head>
                <body className="min-h-screen bg-background text-foreground antialiased">
                    {children}
                    <Toaster
                        position="top-center"
                        toastOptions={{
                            duration: 2000,
                            style: {
                                background: 'rgba(20,20,30,0.95)',
                                color: '#fff',
                                fontSize: '13px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
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
