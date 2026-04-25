'use client';

import { useAuth } from '@clerk/nextjs';
import { useMemo } from 'react';
import { ApiClient } from '@/lib/api';

/**
 * Hook returning a memoized `ApiClient` wired to the current Clerk session.
 *
 * The client pulls a fresh token via `getToken()` on every request, so
 * rotating short-lived JWTs are transparently attached to the `Authorization`
 * header. No tokens are stored in `localStorage`.
 */
export function useApi(): ApiClient {
    const { getToken, isSignedIn } = useAuth();

    return useMemo(() => {
        return new ApiClient(async () => {
            if (!isSignedIn) return null;
            try {
                return await getToken();
            } catch {
                return null;
            }
        });
    }, [getToken, isSignedIn]);
}
