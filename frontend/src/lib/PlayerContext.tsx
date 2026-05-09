import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Song, RecommendedSong } from "./types";
import { api } from "./api";
import YouTubePlayer from "@/components/YouTubePlayer";

interface PlayerState {
  currentTrack: Song | null;
  isPlaying: boolean;
  progress: number; // in seconds
  detectedMood: string | null;
  playTrack: (track: Song, contextMood?: string, playlist?: Song[]) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setDetectedMood: (mood: string) => void;
  nextTrack: (autoAdvance?: boolean) => void;
  prevTrack: () => void;
  queue: Song[];
  queueIndex: number;
  originalQueue: Song[];
  isShuffle: boolean;
  loopMode: 'off' | 'all' | 'one';
  toggleShuffle: () => void;
  toggleLoopMode: () => void;
  jumpToTrack: (index: number) => void;
  registerSeek: (seekFn: (time: number) => void) => void;
  /** True while a background queue-ahead fetch is in flight. */
  isLoadingMore: boolean;
  /** Manually request more songs for the queue (e.g. on scroll-to-bottom). */
  requestMoreQueue: () => void;
}

const PlayerContext = createContext<PlayerState | undefined>(undefined);

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentTrack, setCurrentTrack] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detectedMood, setDetectedMood] = useState<string | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [loopMode, setLoopMode] = useState<'off' | 'all' | 'one'>('all');
  const seekRef = useRef<((time: number) => void) | null>(null);
  /** True while a silent queue-ahead fetch is in-flight. */
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false); // ref for closure safety in useEffect

  // Track all song IDs seen in this player session to prevent duplicates
  const seenIdsRef = useRef<Set<string>>(new Set());

  // A3: track consecutive skips to detect in-session interest drift.
  // After SKIP_DRIFT_THRESHOLD consecutive manual skips, force a fresh queue fetch
  // so the user escapes the current FAISS candidate cluster being served.
  const consecutiveSkipsRef = useRef<number>(0);
  /** Minimum consecutive skips before triggering a forced queue refresh. */
  const SKIP_DRIFT_THRESHOLD = 3;

  // --- YouTube ID cache + prefetch ---
  // ytIdCacheRef stores already-resolved IDs keyed by song ID to avoid
  // repeated network lookups when advancing through the queue.
  const ytIdCacheRef = useRef<Map<string, string>>(new Map());
  /** Number of tracks ahead to pre-resolve. */
  const PREFETCH_LOOKAHEAD = 2;
  /** Debounce timer for prefetch to avoid redundant fetches on rapid state changes. */
  const prefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolved YouTube video ID (may be fetched asynchronously for seed songs)
  const [resolvedYouTubeId, setResolvedYouTubeId] = useState<string | null>(null);

  // Track listen time for interaction logging
  const listenStartRef = useRef<number | null>(null);
  const lastTrackedTrackRef = useRef<string | null>(null);

  // --- YouTube ID resolution ---
  // RecommendedSong.youtube_id is pre-resolved by the backend for most songs.
  // For songs where it is absent (seed songs without a hardcoded ID), we resolve
  // it on-demand by calling the backend YouTube search proxy.
  const resolveYouTubeId = async (track: Song): Promise<string | null> => {
    const rec = track as RecommendedSong;

    // 1. Already in our local cache (pre-resolved in background)
    const cached = ytIdCacheRef.current.get(track.id);
    if (cached) return cached;

    // 2. Already resolved by the backend
    if (rec.youtube_id) {
      ytIdCacheRef.current.set(track.id, rec.youtube_id);
      return rec.youtube_id;
    }

    // 3. Search via the backend proxy (key never leaves the server)
    try {
      const results = await api.searchYouTube(`${track.title} ${track.artist}`, 1);
      if (results.items.length > 0) {
        const id = results.items[0].external_id;
        ytIdCacheRef.current.set(track.id, id);
        return id;
      }
    } catch (e) {
      console.warn("[PlayerContext] YouTube ID resolution failed:", e);
    }
    return null;
  };

  /**
   * Background-resolve YouTube IDs for the next PREFETCH_LOOKAHEAD songs in
   * the queue so that nextTrack() can read from cache instead of the network.
   * Debounced to avoid redundant calls on rapid queue/index state changes.
   */
  const prefetchUpcoming = (currentQueue: Song[], currentIndex: number) => {
    if (prefetchDebounceRef.current) clearTimeout(prefetchDebounceRef.current);
    prefetchDebounceRef.current = setTimeout(() => {
      for (let offset = 1; offset <= PREFETCH_LOOKAHEAD; offset++) {
        const nextIdx = (currentIndex + offset) % currentQueue.length;
        const song = currentQueue[nextIdx];
        if (!song) continue;
        // Skip if already cached or no resolution needed
        const rec = song as RecommendedSong;
        if (ytIdCacheRef.current.has(song.id) || rec.youtube_id) {
          if (rec.youtube_id && !ytIdCacheRef.current.has(song.id)) {
            ytIdCacheRef.current.set(song.id, rec.youtube_id);
          }
          continue;
        }
        // Fire-and-forget: pre-resolve and cache
        resolveYouTubeId(song).then((id) => {
          if (id) ytIdCacheRef.current.set(song.id, id);
        });
      }
    }, 300); // 300 ms debounce
  };

  // Flush listen-duration interaction when switching tracks
  const flushListenInteraction = (trackId: string) => {
    if (listenStartRef.current !== null) {
      const duration = Math.floor((Date.now() - listenStartRef.current) / 1000);
      if (duration > 3) {
        // Only log if listened for more than 3 seconds (avoids noise from fast skips)
        api.interactWithSong(trackId, "play", duration).catch((e) =>
          console.warn("[PlayerContext] Failed to log listen duration:", e)
        );
      }
      listenStartRef.current = null;
    }
  };

  const playTrack = async (track: Song, contextMood?: string, playlist?: Song[]) => {
    // Flush previous listen time before switching
    if (lastTrackedTrackRef.current && lastTrackedTrackRef.current !== track.id) {
      flushListenInteraction(lastTrackedTrackRef.current);
    }

    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    setResolvedYouTubeId(null); // clear until resolved

    if (playlist) {
      // Register all playlist song IDs as "seen" for dedup
      playlist.forEach((s) => seenIdsRef.current.add(s.id));

      setOriginalQueue(playlist);
      let newQueue = playlist;
      let newIndex = playlist.findIndex(t => t.id === track.id);
      if (newIndex < 0) newIndex = 0;
      
      if (isShuffle) {
        const others = playlist.filter((_, i) => i !== newIndex);
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }
        newQueue = [playlist[newIndex], ...others];
        newIndex = 0;
      }
      
      setQueue(newQueue);
      setQueueIndex(newIndex);
    } else {
      seenIdsRef.current.add(track.id);
      setOriginalQueue([track]);
      setQueue([track]);
      setQueueIndex(0);
    }

    if (contextMood) {
      setDetectedMood(contextMood);
    }

    lastTrackedTrackRef.current = track.id;
    listenStartRef.current = Date.now();

    // Log initial play interaction
    api.interactWithSong(track.id, "play").catch((e) =>
      console.warn("[PlayerContext] Failed to log play interaction:", e)
    );

    // Resolve YouTube ID asynchronously (reads from cache first)
    const ytId = await resolveYouTubeId(track);
    setResolvedYouTubeId(ytId);

    // Auto-append recommendations after seeding the queue from a section.
    // Short delay lets the state settle before the fetch reads the queue.
    setTimeout(() => fetchMoreForQueue(), 500);

    // Pre-resolve IDs for the upcoming tracks while current track starts.
    const finalQueue = playlist ?? [track];
    const finalIndex = playlist ? (playlist.findIndex(t => t.id === track.id) >= 0 ? playlist.findIndex(t => t.id === track.id) : 0) : 0;
    prefetchUpcoming(finalQueue, finalIndex);
  };

  const togglePlayPause = () => {
    if (!currentTrack) return;
    if (isPlaying) {
      // Pausing: capture listen time so far but keep the start ref for resume
      if (listenStartRef.current !== null) {
        const partialDuration = Math.floor((Date.now() - listenStartRef.current) / 1000);
        if (partialDuration > 3) {
          api.interactWithSong(currentTrack.id, "play", partialDuration).catch(() => {});
        }
        listenStartRef.current = null;
      }
    } else {
      // Resuming: reset listen-start
      listenStartRef.current = Date.now();
    }
    setIsPlaying(!isPlaying);
  };

  const registerSeek = (seekFn: (time: number) => void) => {
    seekRef.current = seekFn;
  };

  const seek = (time: number) => {
    setProgress(time);
    if (seekRef.current) {
      seekRef.current(time);
    }
  };

  const nextTrack = (autoAdvance = false) => {
    if (currentTrack) {
      flushListenInteraction(currentTrack.id);
      if (!autoAdvance) {
        api.interactWithSong(currentTrack.id, "skip").catch((e) =>
          console.warn("[PlayerContext] Failed to log skip interaction:", e)
        );

        // A3: increment consecutive skip streak; trigger drift re-ranking at threshold
        consecutiveSkipsRef.current += 1;
        if (consecutiveSkipsRef.current >= SKIP_DRIFT_THRESHOLD) {
          console.info(
            `[PlayerContext] Skip drift detected (${consecutiveSkipsRef.current} consecutive skips). ` +
              "Triggering forced queue refresh."
          );
          window.dispatchEvent(
            new CustomEvent("moodbeatz:skip-drift", {
              detail: { skips: consecutiveSkipsRef.current },
            })
          );
          // Force an immediate queue refill outside the normal low-watermark check
          setTimeout(() => fetchMoreForQueue(true), 0);
          consecutiveSkipsRef.current = 0; // reset after acting
        }
      } else {
        // Auto-advance (song ended naturally) is NOT a skip — reset the streak
        consecutiveSkipsRef.current = 0;
      }
    }

    if (autoAdvance && loopMode === 'one') {
      setProgress(0);
      setIsPlaying(true);
      if (seekRef.current) seekRef.current(0);
      listenStartRef.current = Date.now();
      return;
    }

    if (queue.length > 0) {
      if (autoAdvance && loopMode === 'off' && queueIndex === queue.length - 1) {
        setIsPlaying(false);
        setProgress(0);
        if (seekRef.current) seekRef.current(0);
        return;
      }

      const nextIdx = (queueIndex + 1) % queue.length;
      const nextSong = queue[nextIdx];
      setQueueIndex(nextIdx);
      setCurrentTrack(nextSong);
      setResolvedYouTubeId(null);
      lastTrackedTrackRef.current = nextSong.id;
      listenStartRef.current = Date.now();
      api.interactWithSong(nextSong.id, "play").catch(() => {});
      // Cache hit = instant; cache miss = network (same as before)
      resolveYouTubeId(nextSong).then(id => {
        setResolvedYouTubeId(id);
        // Pre-resolve for the track AFTER next
        prefetchUpcoming(queue, nextIdx);
      });
    }
    setProgress(0);
    setIsPlaying(true);
  };

  const toggleShuffle = () => {
    const newShuffle = !isShuffle;
    setIsShuffle(newShuffle);
    
    if (newShuffle) {
      if (currentTrack && queue.length > 0) {
        const others = queue.filter((_, i) => i !== queueIndex);
        for (let i = others.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [others[i], others[j]] = [others[j], others[i]];
        }
        setQueue([queue[queueIndex], ...others]);
        setQueueIndex(0);
      }
    } else {
      setQueue(originalQueue);
      if (currentTrack) {
        const idx = originalQueue.findIndex(t => t.id === currentTrack.id);
        setQueueIndex(idx >= 0 ? idx : 0);
      }
    }
  };

  const toggleLoopMode = () => {
    setLoopMode(prev => {
      if (prev === 'all') return 'one';
      if (prev === 'one') return 'off';
      return 'all';
    });
  };

  const prevTrack = () => {
    if (currentTrack) {
      flushListenInteraction(currentTrack.id);
    }
    // Going back is deliberate navigation, not drift — reset the skip streak
    consecutiveSkipsRef.current = 0;
    if (progress > 3) {
      setProgress(0);
      setIsPlaying(true);
      if (seekRef.current) seekRef.current(0);
    } else if (queue.length > 0) {
      let prevIdx = queueIndex - 1;
      if (prevIdx < 0) prevIdx = queue.length - 1;
      const prevSong = queue[prevIdx];
      setQueueIndex(prevIdx);
      setCurrentTrack(prevSong);
      setResolvedYouTubeId(null);
      lastTrackedTrackRef.current = prevSong.id;
      listenStartRef.current = Date.now();
      api.interactWithSong(prevSong.id, "play").catch(() => {});
      resolveYouTubeId(prevSong).then(id => {
        setResolvedYouTubeId(id);
        prefetchUpcoming(queue, prevIdx);
      });
      setProgress(0);
      setIsPlaying(true);
    } else {
      setProgress(0);
      setIsPlaying(true);
      if (seekRef.current) seekRef.current(0);
    }
    listenStartRef.current = Date.now();
  };

  // --- Derive effective mood for recommendations ---
  // Use detectedMood if set, otherwise fall back to current track's mood_tag.
  // This ensures queue refill works even without face detection.
  const getEffectiveMood = (): string | null => {
    if (detectedMood) return detectedMood;
    if (currentTrack?.mood_tag) return currentTrack.mood_tag;
    return null;
  };

  // --- Proactive queue-ahead (low-watermark refill) ---
  // When ≤5 songs remain before the end of the queue and we know the
  // effective mood, silently fetch 10 more songs and append them.
  // Uses seenIdsRef for session-wide dedup across all fetches.
  // A3: pass force=true to bypass the watermark check on skip-drift.
  const fetchMoreForQueue = async (force = false) => {
    const mood = getEffectiveMood();
    if (!mood || isLoadingMoreRef.current) return;
    if (queue.length === 0) return;

    const remaining = queue.length - queueIndex - 1;
    if (!force && remaining > 5) return; // still enough songs ahead

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const excludeIds = Array.from(seenIdsRef.current);
      const data = await api.getQueueAheadRecommendations(mood, excludeIds, 10);
      const newSongs: Song[] = (data?.songs ?? []).filter(
        (s: Song) => !seenIdsRef.current.has(s.id)
      );
      if (newSongs.length > 0) {
        newSongs.forEach((s) => seenIdsRef.current.add(s.id));
        setQueue((prev) => [...prev, ...newSongs]);
        setOriginalQueue((prev) => [...prev, ...newSongs]);
      }
    } catch (e) {
      console.warn('[PlayerContext] Queue-ahead fetch failed:', e);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  /** Public method for the queue panel to request more songs on scroll. */
  const requestMoreQueue = async () => {
    const mood = getEffectiveMood();
    if (!mood || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const excludeIds = Array.from(seenIdsRef.current);
      const data = await api.getQueueAheadRecommendations(mood, excludeIds, 10);
      const newSongs: Song[] = (data?.songs ?? []).filter(
        (s: Song) => !seenIdsRef.current.has(s.id)
      );
      if (newSongs.length > 0) {
        newSongs.forEach((s) => seenIdsRef.current.add(s.id));
        setQueue((prev) => [...prev, ...newSongs]);
        setOriginalQueue((prev) => [...prev, ...newSongs]);
      }
    } catch (e) {
      console.warn('[PlayerContext] requestMoreQueue failed:', e);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  // Trigger on every queue/index change
  useEffect(() => {
    const mood = getEffectiveMood();
    if (!mood || queue.length === 0) return;
    const remaining = queue.length - queueIndex - 1;
    if (remaining <= 5 && !isLoadingMoreRef.current) {
      fetchMoreForQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, queueIndex, detectedMood, currentTrack?.mood_tag]);

  const jumpToTrack = (index: number) => {
    if (index >= 0 && index < queue.length) {
      if (currentTrack) {
        flushListenInteraction(currentTrack.id);
        api.interactWithSong(currentTrack.id, "skip").catch(() => {});
      }
      
      const track = queue[index];
      setQueueIndex(index);
      setCurrentTrack(track);
      setResolvedYouTubeId(null);
      lastTrackedTrackRef.current = track.id;
      listenStartRef.current = Date.now();
      api.interactWithSong(track.id, "play").catch(() => {});
      resolveYouTubeId(track).then(id => {
        setResolvedYouTubeId(id);
        prefetchUpcoming(queue, index);
      });
      setProgress(0);
      setIsPlaying(true);
    }
  };

  // Flush on unmount (e.g. user closes the tab)
  useEffect(() => {
    return () => {
      if (lastTrackedTrackRef.current && listenStartRef.current !== null) {
        flushListenInteraction(lastTrackedTrackRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- "Add to queue" from the queue panel (Player.tsx) ---
  // Player.tsx dispatches `moodbeatz:add-to-queue` when the user taps the +
  // button on a suggested song.  We append it to both the live queue and the
  // originalQueue (deduplicated) so it survives shuffle toggles.
  useEffect(() => {
    const handler = (e: Event) => {
      const song = (e as CustomEvent).detail?.song;
      if (!song) return;
      setQueue((prev) => {
        if (prev.some((s) => s.id === song.id)) return prev; // dedupe
        return [...prev, song];
      });
      setOriginalQueue((prev) => {
        if (prev.some((s) => s.id === song.id)) return prev;
        return [...prev, song];
      });
    };
    window.addEventListener("moodbeatz:add-to-queue", handler);
    return () => window.removeEventListener("moodbeatz:add-to-queue", handler);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        detectedMood,
        queue,
        queueIndex,
        originalQueue,
        isShuffle,
        loopMode,
        isLoadingMore,
        requestMoreQueue,
        playTrack,
        togglePlayPause,
        seek,
        setDetectedMood,
        nextTrack,
        prevTrack,
        toggleShuffle,
        toggleLoopMode,
        jumpToTrack,
        registerSeek,
      }}
    >
      {children}
      {resolvedYouTubeId && (
        <YouTubePlayer
          videoId={resolvedYouTubeId}
          isPlaying={isPlaying}
          muted={false}
          onStateChange={(state) => {
            if (state === "ended") {
              setIsPlaying(false);
              if (currentTrack) flushListenInteraction(currentTrack.id);
              nextTrack(true);
            } else if (state === "paused") {
              setIsPlaying(false);
            } else if (state === "playing") {
              setIsPlaying(true);
            }
          }}
          onProgress={(current) => setProgress(current)}
          onReady={() => {
            console.log("[YouTubePlayer] Ready:", resolvedYouTubeId);
          }}
          registerSeek={registerSeek}
          className="hidden"
        />
      )}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
};
