import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Clerk middleware: attaches auth context to every request without forcing a
 * sign-in wall. Individual UI surfaces decide when to prompt `<SignIn>`; the
 * backend rejects anonymous calls to protected endpoints with 401.
 */
export default clerkMiddleware();

export const config = {
    matcher: [
        // Run on everything except Next internals and common static assets.
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3|mp4|mov|avi|wav|flac|m4a|ogg)).*)',
        '/(api|trpc)(.*)',
    ],
};
