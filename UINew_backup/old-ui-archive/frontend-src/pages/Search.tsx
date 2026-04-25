import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Search as SearchIcon } from "lucide-react";
import { MOODS, MOCK_TRACKS, Track } from "@/lib/mock-data";
import { usePlayer } from "@/lib/PlayerContext";

export default function Search() {
  const [, setLocation] = useLocation();
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState("");
  const [activeMood, setActiveMood] = useState<string | null>(null);

  const handlePlayTrack = (track: Track) => {
    playTrack(track, activeMood || undefined);
    setLocation("/player");
  };

  const filteredTracks = MOCK_TRACKS.filter(track => {
    const matchesQuery = track.title.toLowerCase().includes(query.toLowerCase()) || 
                         track.artist.toLowerCase().includes(query.toLowerCase());
    const matchesMood = activeMood ? track.moods.includes(activeMood) : true;
    return matchesQuery && matchesMood;
  });

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
        {filteredTracks.map((track, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={track.id}
            onClick={() => handlePlayTrack(track)}
            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-none">
              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-primary-foreground truncate">{track.title}</h3>
              <p className="text-sm text-muted-foreground font-light truncate">{track.artist}</p>
            </div>
          </motion.div>
        ))}
        {filteredTracks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground font-light">
            No tracks found.
          </div>
        )}
      </div>
    </div>
  );
}
