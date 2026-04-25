import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Song } from "@/lib/types";
import { usePlayer } from "@/lib/PlayerContext";

const MOODS = ['Weightless', 'Velvet', 'Embered', 'Tide', 'Static', 'Midnight', 'Drifting', 'Electric', 'Melancholic', 'Lucid'];

export default function Search() {
  const [, setLocation] = useLocation();
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState("");
  const [activeMood, setActiveMood] = useState<string | null>(null);

  const handlePlayTrack = async (item: any) => {
    // Map YouTubeSearchItem to Song format expected by PlayerContext
    const song: Song = {
      id: item.external_id,
      title: item.title,
      artist: item.artist,
      album: null,
      genre: "youtube",
      mood_tag: activeMood || "happy",
      duration: item.duration || 0,
      cover_url: item.cover_url || null,
      audio_url: null,
      preview_url: null,
      valence: 0.5,
      energy: 0.5,
      danceability: 0.5,
      popularity: 50,
      release_date: null
    };

    // Upsert the song to the backend so it can be tracked
    try {
      const response = await api.upsertSong({
        external_id: item.external_id,
        title: item.title,
        artist: item.artist,
        duration: item.duration || 0,
        cover_url: item.cover_url,
        mood_tag: activeMood || undefined,
      });
      // Use the returned real song ID if needed, but the mapped object works too
      playTrack({ ...song, id: response.id || song.id }, activeMood || undefined);
    } catch (e) {
      console.error("Upsert failed", e);
      playTrack(song, activeMood || undefined);
    }
    setLocation("/player");
  };

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['youtubeSearch', query],
    queryFn: () => api.searchYouTube(query),
    enabled: query.length > 2,
    staleTime: 60000,
  });

  const filteredTracks = searchResults?.items || [];

  return (
    <div className="min-h-[100dvh] pb-32 px-6 py-8">
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <SearchIcon size={20} className="text-muted-foreground" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks, artists..."
          className="w-full glass-panel bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-primary-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
        />
      </div>

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

      <div className="space-y-4">
        {isLoading && (
          <div className="flex justify-center py-12 text-primary">
            <Loader2 className="animate-spin" size={32} />
          </div>
        )}
        {!isLoading && filteredTracks.map((track, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={track.external_id}
            onClick={() => handlePlayTrack(track)}
            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-none">
              <img src={track.cover_url || ""} alt={track.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-primary-foreground truncate">{track.title}</h3>
              <p className="text-sm text-muted-foreground font-light truncate">{track.artist}</p>
            </div>
          </motion.div>
        ))}
        {!isLoading && filteredTracks.length === 0 && query.length > 2 && (
          <div className="text-center py-12 text-muted-foreground font-light">
            No tracks found.
          </div>
        )}
        {!isLoading && query.length <= 2 && (
          <div className="text-center py-12 text-muted-foreground font-light">
            Type to search YouTube...
          </div>
        )}
      </div>
    </div>
  );
}
