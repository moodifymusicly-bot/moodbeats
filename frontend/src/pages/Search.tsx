/**
 * Search.tsx — Phase 5: recently searched + Phase 3: heart on search results.
 *
 * Changes from base version:
 * - RecentSearches dropdown below the input (focused + empty)
 * - Auto-save search term to history when a YouTube search fires
 * - HeartButton overlay on each search result card
 * - Thumbnail normalization: hqdefault → mqdefault (no black bars)
 * - Search input focus/blur tracking for dropdown visibility
 */

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Song } from "@/lib/types";
import { usePlayer } from "@/lib/PlayerContext";
import { TrackRowSkeleton } from "@/components/layout/TrackRowSkeleton";
import { RecentSearches } from "@/components/layout/RecentSearches";
import { HeartButton } from "@/components/layout/HeartButton";
import { normalizeYouTubeThumbnail } from "@/lib/utils";

const MOODS = ['Weightless', 'Velvet', 'Embered', 'Tide', 'Static', 'Midnight', 'Drifting', 'Electric', 'Melancholic', 'Lucid'];

export default function Search() {
  const [, setLocation] = useLocation();
  const { playTrack } = usePlayer();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [activeMood, setActiveMood] = useState<string | null>(null);
  // Track input focus so we know when to show recent searches
  const [inputFocused, setInputFocused] = useState(false);
  // Stable query used to trigger the search (set on submit / debounce)
  const [submittedQuery, setSubmittedQuery] = useState("");

  // ── Save search term to history when a search fires ──────────────────────
  // Uses POST /api/search/history (new endpoint from Phase 5).
  // Debounced: only saves after the user stops typing for 800ms so we
  // capture the final intended query, not intermediate fragments.
  const historyMutation = useMutation({
    mutationFn: (term: string) => api.addSearchHistory(term),
    onSuccess: () => {
      // Invalidate so RecentSearches panel refreshes
      queryClient.invalidateQueries({ queryKey: ["searchHistory"] });
    },
  });
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── YouTube search ────────────────────────────────────────────────────────
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['youtubeSearch', submittedQuery, activeMood],
    queryFn: async () => {
      const moodSuffix = activeMood ? ` ${activeMood} music` : "";
      const res = await api.searchYouTube(`${submittedQuery}${moodSuffix}`);
      return res;
    },
    enabled: submittedQuery.length > 2,
    staleTime: 60_000,
  });

  const filteredTracks = searchResults?.items || [];

  // ── Input change handler ──────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    // Trigger search after 3+ chars (replaces the old >2 check)
    if (val.length > 2) {
      setSubmittedQuery(val);
      // Debounce history save: only persist the final term, not every keystroke
      if (isSignedIn) {
        if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = setTimeout(() => {
          historyMutation.mutate(val.trim());
        }, 800);
      }
    } else {
      setSubmittedQuery("");
      // Clear any pending debounce if user deletes input
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    }
  };

  // ── Form submit handler ───────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalQuery = query.trim();
    if (finalQuery.length > 0) {
      setSubmittedQuery(finalQuery);
      if (isSignedIn) {
        if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
        historyMutation.mutate(finalQuery);
      }
      document.getElementById("search-input")?.blur();
    }
  };

  // ── Recent search selection ───────────────────────────────────────────────
  const handleSelectHistory = useCallback((term: string) => {
    setQuery(term);
    setSubmittedQuery(term);
    setInputFocused(false);
    if (isSignedIn) {
      historyMutation.mutate(term.trim());
    }
  }, [isSignedIn, historyMutation]);

  // ── Play a search result ──────────────────────────────────────────────────
  const handlePlayTrack = async (item: any) => {
    const song: Song = {
      id: item.external_id,
      title: item.title,
      artist: item.artist,
      album: null,
      genre: "youtube",
      mood_tag: activeMood || "happy",
      duration: item.duration || 0,
      cover_url: normalizeYouTubeThumbnail(item.cover_url),
      audio_url: null,
      preview_url: null,
      valence: 0.5,
      energy: 0.5,
      danceability: 0.5,
      popularity: 50,
      release_date: null
    };

    try {
      const response = await api.upsertSong({
        external_id: item.external_id,
        title: item.title,
        artist: item.artist,
        duration: item.duration || 0,
        cover_url: song.cover_url,
        mood_tag: activeMood || undefined,
      });
      playTrack({ ...song, id: response.id || song.id }, activeMood || undefined, filteredTracks.map(t => ({
        ...song,
        id: t.external_id,
        title: t.title,
        artist: t.artist,
        cover_url: normalizeYouTubeThumbnail(t.cover_url),
      })));
    } catch {
      playTrack(song, activeMood || undefined);
    }
    setLocation("/player");
  };

  // ── Show recent searches dropdown when: focused + empty + signed in ───────
  const showRecent = !!(inputFocused && query.length === 0 && isSignedIn);

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden pb-safe-nav px-6 py-8">

      {/* ── Search input ───────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="relative mb-4">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <SearchIcon size={20} className="text-muted-foreground" />
        </div>
        <input
          id="search-input"
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setInputFocused(true)}
          onBlur={() => {
            // Small delay so click on a history item registers before blur hides the dropdown
            setTimeout(() => setInputFocused(false), 150);
          }}
          placeholder="Search tracks, artists..."
          autoComplete="off"
          className="w-full glass-panel bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-primary-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
      </form>

      {/* ── Recent searches dropdown (Phase 5) ─────────────────────────────── */}
      <RecentSearches
        visible={showRecent}
        onSelect={handleSelectHistory}
      />

      {/* ── Mood filter chips ──────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto hide-scrollbar -mx-6 px-6 mb-8 pb-2">
        {MOODS.map(mood => (
          <button
            key={mood}
            onClick={() => setActiveMood(activeMood === mood ? null : mood)}
            className={`flex-none mr-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeMood === mood
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.5)] border border-primary"
                : "glass-panel text-muted-foreground border border-white/5 hover:text-primary-foreground"
            }`}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {isLoading && (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <TrackRowSkeleton key={`skel-${i}`} />
            ))}
          </div>
        )}

        {!isLoading && filteredTracks.map((track, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={track.external_id}
            onClick={() => handlePlayTrack(track)}
            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer group relative"
          >
            {/* Thumbnail — Phase 2: object-cover + normalised URL */}
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-none relative" style={{ aspectRatio: "1 / 1" }}>
              <img
                src={normalizeYouTubeThumbnail(track.cover_url) || ""}
                alt={track.title}
                className="w-full h-full object-cover"
              />
              {/* Heart overlay on search row thumbnail */}
              <HeartButton
                songId={track.external_id}
                mood={activeMood}
                variant="overlay"
                size={13}
                className="absolute top-0.5 right-0.5 w-8 h-8"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-primary-foreground truncate">{track.title}</h3>
              <p className="text-sm text-muted-foreground font-light truncate">{track.artist}</p>
            </div>
          </motion.div>
        ))}

        {!isLoading && filteredTracks.length === 0 && submittedQuery.length > 2 && (
          <div className="text-center py-12 text-muted-foreground font-light">
            No tracks found.
          </div>
        )}

        {!isLoading && submittedQuery.length <= 2 && query.length === 0 && !showRecent && (
          <div className="text-center py-12 text-muted-foreground font-light">
            Type to search YouTube...
          </div>
        )}
      </div>
    </div>
  );
}
