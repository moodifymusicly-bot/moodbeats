import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
    title: 'MoodMusic — AI-Powered Music for Every Mood',
    description: 'Discover music that matches your mood. Powered by deep learning hybrid recommendations.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen bg-background text-foreground antialiased">
                {children}
            </body>
        </html>
    )
}
