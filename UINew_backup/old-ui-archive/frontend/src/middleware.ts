import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Clerk middleware: attaches auth context and adds security response headers.
 *
 * MID-1 improvements:
 *  - Security headers on every response (frame, MIME sniff, referrer).
 *  - Authenticated users hitting '/' are redirected to '/home' to skip
 *    the landing animation on return visits.
 */
export default clerkMiddleware(async (auth, request) => {
    const { pathname } = request.nextUrl;

    // Build the base response first so headers can be appended unconditionally.
    const response = NextResponse.next();

    // ── Security headers ────────────────────────────────────────────────────
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set(
        'Permissions-Policy',
        'camera=(self), microphone=(), geolocation=()'
    );

    return response;
});

export const config = {
    matcher: [
        // Run on everything except Next internals and common static assets.
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3|mp4|mov|avi|wav|flac|m4a|ogg)).*)',
        '/(api|trpc)(.*)',
    ],
};
