/**
 * Library.tsx — Phase 4 upgrade.
 *
 * Changes from base version:
 * - HeartButton overlay on each card (filled with mood color, click to unsave)
 * - Animated removal: card fades + scales down via framer-motion AnimatePresence
 * - Shimmer skeleton loaders using design system surface tokens
 * - Improved empty state: SVG heart icon + warm copy
 * - Surface tokens: bg-card, hover:bg-accent, border-white/10 throughout
 *
 * Save / unsave still uses the existing /api/library/likes endpoints (GET /
 * POST / DELETE) — no new backend endpoints created for this feature.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, SignInButton } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { Song } from "@/lib/types";
import { usePlayer } from "@/lib/PlayerContext";
import { HeartButton } from "@/components/layout/HeartButton";
import { normalizeYouTubeThumbnail } from "@/lib/utils";

// ─── Skeleton loader ────────────────────────────────────────────────────────

const LibrarySkeleton = () => (
  <div className="grid grid-cols-2 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={`skel-${i}`} className="flex flex-col gap-3">
        <div
          className="w-full rounded-2xl overflow-hidden relative skeleton-shimmer"
          style={{ aspectRatio: "1 / 1" }}
        />
        <div className="space-y-2">
          <div className="h-3.5 w-3/4 skeleton-shimmer rounded-full" />
          <div className="h-2.5 w-1/2 skeleton-shimmer rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────

const EmptyState = () => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-20 text-center"
  >
    {/* SVG heart — uses primary color as stroke to stay on-theme */}
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      className="mb-6 opacity-40"
      aria-hidden="true"
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <p className="text-lg font-medium text-primary-foreground/80 mb-2">
      Your saved tracks live here
    </p>
    <p className="text-sm text-muted-foreground font-light max-w-xs leading-relaxed">
      Hit ♥ on any track to save it. Your music, always ready.
    </p>
  </motion.div>
);

// ─── Saved track card ────────────────────────────────────────────────────────

interface SavedCardProps {
  track: Song;
  onPlay: () => void;
}

const SavedCard = ({ track, onPlay }: SavedCardProps) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.88, transition: { duration: 0.22 } }}
    transition={{ duration: 0.25 }}
    onClick={onPlay}
    className="flex flex-col gap-3 cursor-pointer group"
  >
    {/* Thumbnail — aspect-ratio 1/1 + object-cover, no black bars */}
    <div
      className="w-full rounded-2xl overflow-hidden relative bg-card border border-white/5"
      style={{ aspectRatio: "1 / 1" }}
    >
      <img
        src={normalizeYouTubeThumbnail(track.cover_url) || ""}
        alt={track.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />

      {/* HeartButton overlay — click to unsave (filled with mood color).
          Uses existing DELETE /api/library/likes/{song_id} under the hood. */}
      <HeartButton
        songId={track.id}
        variant="overlay"
        size={16}
      />
    </div>

    {/* Track info */}
    <div>
      <h3 className="font-medium text-sm text-primary-foreground truncate">{track.title}</h3>
      <p className="text-xs text-muted-foreground font-light truncate">{track.artist}</p>
    </div>
  </motion.div>
);

// ─── Main component ──────────────────────────────────────────────────────────

export default function Library() {
  const [, setLocation] = useLocation();
  const { playTrack } = usePlayer();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  // Bug 2 fix: reset scroll position on mount so saved tracks always appear
  // at the top of the viewport. Without this, the browser may restore a
  // cached scroll position from a previous visit, pushing content down.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // Phase 4: Fetch saved tracks using existing GET /api/library/likes endpoint.
  // The 'likes' query key is shared with HeartButton / useLikeStatus so all
  // components stay in sync without extra network calls.
  const { data: likes, isLoading } = useQuery({
    queryKey: ['likes'],
    queryFn: () => api.getLikes(),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const tracks: Song[] = Array.isArray(likes) ? likes.map(l => l.song || l) : [];

  const handlePlayTrack = (track: Song) => {
    playTrack(track, undefined, tracks);
    setLocation("/player");
  };

  // ── Not signed in ───────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <div className="h-[100dvh] overflow-y-auto pb-safe-nav px-6 py-8 flex flex-col items-center justify-center text-center">
        <h1 className="text-3xl font-medium tracking-tight text-primary-foreground mb-4">Library</h1>
        <p className="text-muted-foreground mb-8">Sign in to save tracks and build your collection.</p>
        <SignInButton mode="modal">
          <button className="neumorphic-button px-6 py-3 rounded-full text-primary-foreground font-medium">
            Sign In
          </button>
        </SignInButton>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div ref={scrollRef} className="h-[100dvh] overflow-y-auto pb-safe-nav px-6 py-8">
      <h1 className="text-3xl font-medium tracking-tight text-primary-foreground mb-8">Library</h1>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-white/10 mb-6 pb-2">
        <button className="text-primary-foreground font-medium pb-2 border-b-2 border-primary -mb-[10px]">
          Saved Tracks
        </button>
        <button className="text-muted-foreground font-medium pb-2 hover:text-primary-foreground transition-colors">
          Playlists (Coming Soon)
        </button>
      </div>

      {/* Loading skeletons */}
      {isLoading && <LibrarySkeleton />}

      {/* Empty state */}
      {!isLoading && tracks.length === 0 && <EmptyState />}

      {/* Saved tracks grid with animated exit */}
      {!isLoading && tracks.length > 0 && (
        <motion.div layout className="grid grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {tracks.map((track) => (
              <SavedCard
                key={track.id}
                track={track}
                onPlay={() => handlePlayTrack(track)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
