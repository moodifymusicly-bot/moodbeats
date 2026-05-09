/**
 * useLikeStatus — shared hook for reading and toggling the saved state of a track.
 *
 * Uses the existing /api/library/likes endpoints (POST/DELETE) which are the
 * canonical save mechanism in MoodBeatz. This hook is consumed by:
 *   - HeartButton (Player page, TrackCard overlay, Library cards)
 *
 * Optimistic update pattern:
 *   1. Toggle local state immediately (feels instant).
 *   2. Fire the API call.
 *   3. On failure: rollback + show toast.
 *   4. Invalidate the 'likes' query so Library page stays in sync.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface LikeEntry {
  song_id: string;
  id: string;
  created_at: string;
  song?: { id: string; [key: string]: unknown } | null;
}

/** Returns whether a songId is in the current likes list. */
function isLikedInList(likes: LikeEntry[], songId: string): boolean {
  return likes.some(
    (l) => l.song_id === songId || l.song?.id === songId
  );
}

export interface UseLikeStatusResult {
  /** Whether the track is currently saved. */
  isLiked: boolean;
  /** Whether an API call is in-flight. */
  isPending: boolean;
  /** Toggle saved state with optimistic UI. */
  toggle: (e?: React.MouseEvent | React.TouchEvent) => Promise<void>;
}

export function useLikeStatus(songId: string | undefined): UseLikeStatusResult {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  // Derive current state from the shared 'likes' query cache.
  // Using a selector (queryClient.getQueryData) avoids subscribing to the
  // full query and re-rendering — we only care about the derived boolean.
  const likes = useMemo<LikeEntry[]>(() => {
    const data = queryClient.getQueryData<LikeEntry[]>(['likes']);
    return Array.isArray(data) ? data : [];
  }, [queryClient]); // intentionally omit live subscription — HeartButton re-renders via parent

  const isLiked = useMemo(
    () => (songId ? isLikedInList(likes, songId) : false),
    [likes, songId]
  );

  // Store latest isLiked in a ref so toggle closure is not stale.
  const isLikedRef = useRef(isLiked);
  isLikedRef.current = isLiked;

  const toggle = useCallback(
    async (e?: React.MouseEvent | React.TouchEvent) => {
      e?.stopPropagation();
      e?.preventDefault();

      if (!isSignedIn) {
        toast({ title: "Sign in to save tracks", variant: "default" });
        return;
      }
      if (!songId || isPending) return;

      const wasLiked = isLikedRef.current;
      setIsPending(true);

      // ── Optimistic update ──────────────────────────────────────────────────
      queryClient.setQueryData<LikeEntry[]>(['likes'], (prev = []) =>
        wasLiked
          ? prev.filter((l) => l.song_id !== songId && l.song?.id !== songId)
          : [...prev, { song_id: songId, id: `optimistic-${songId}`, created_at: new Date().toISOString() }]
      );

      try {
        if (wasLiked) {
          // Remove like — uses existing DELETE /api/library/likes/{song_id}
          await api.unlikeSong(songId);
        } else {
          // Add like — uses existing POST /api/library/likes/{song_id}
          await api.likeSong(songId);
        }
      } catch (err) {
        // ── Rollback on failure ──────────────────────────────────────────────
        queryClient.setQueryData<LikeEntry[]>(['likes'], (prev = []) =>
          wasLiked
            ? [...prev, { song_id: songId, id: `rollback-${songId}`, created_at: new Date().toISOString() }]
            : prev.filter((l) => l.song_id !== songId && l.song?.id !== songId)
        );
        toast({
          title: wasLiked ? "Could not remove track" : "Could not save track",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsPending(false);
        // Sync with server truth
        queryClient.invalidateQueries({ queryKey: ['likes'] });
      }
    },
    [songId, isSignedIn, isPending, queryClient]
  );

  return { isLiked, isPending, toggle };
}
