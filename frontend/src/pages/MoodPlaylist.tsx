import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play, Shuffle, Clock, Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { usePlayer } from "@/lib/PlayerContext";
import { api } from "@/lib/api";
import { Song } from "@/lib/types";
import { mapAbstractMoodToBackend } from "@/lib/mood-mapping";
import { getMoodTheme } from "@/lib/mood-theme";

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatTotal = (seconds: number) => {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
};

export default function MoodPlaylist() {
  const [, setLocation] = useLocation();
  const { detectedMood, playTrack } = usePlayer();

  const mood = detectedMood ?? "Velvet";
  const theme = getMoodTheme(mood);

  const backendMood = mapAbstractMoodToBackend(mood);

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['recommendations', backendMood],
    queryFn: () => api.getRecommendations(backendMood, 20)
  });

  const playlist: Song[] = recommendations?.songs || [];

  const totalSeconds = playlist.reduce((sum, t) => sum + (t.duration || 0), 0);

  const onPlay = (track: Song) => {
    playTrack(track, mood);
    setLocation("/player");
  };

  const onPlayAll = () => {
    if (playlist.length > 0) onPlay(playlist[0]);
  };

  const onShuffle = () => {
    if (playlist.length > 0) {
      const random = playlist[Math.floor(Math.random() * playlist.length)];
      onPlay(random);
    }
  };

  return (
    <div className="relative min-h-[100dvh] pb-40 overflow-x-hidden">
      {/* Hero gradient */}
      <div className={`absolute inset-x-0 top-0 h-[60vh] bg-gradient-to-b ${theme.hero} pointer-events-none`} />
      <motion.div
        className={`absolute top-32 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full ${theme.glow} blur-[120px] pointer-events-none`}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Top bar */}
      <div className="relative z-10 px-6 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => setLocation("/home")}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-primary-foreground hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <Logo size="sm" />
        <div className="w-10" />
      </div>

      {/* Hero */}
      <div className="relative z-10 px-6 pt-8 pb-10 text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-xs font-medium tracking-[0.3em] uppercase ${theme.accent} mb-3`}
        >
          Your vibe
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-6xl font-light tracking-tight text-primary-foreground mb-4"
        >
          {mood}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground font-light text-sm max-w-xs mx-auto"
        >
          {theme.caption}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground/80"
        >
          <span>{playlist.length} tracks</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <span>{formatTotal(totalSeconds)}</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <span>Auto-curated</span>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex items-center justify-center gap-3"
        >
          <button
            onClick={onPlayAll}
            className="neumorphic-button rounded-full px-7 py-3.5 flex items-center gap-2 text-primary-foreground font-medium hover:scale-[1.03] active:scale-[0.97] transition-transform"
          >
            <Play size={18} fill="currentColor" />
            <span>Play all</span>
          </button>
          <button
            onClick={onShuffle}
            className="glass-panel rounded-full px-5 py-3.5 flex items-center gap-2 text-primary-foreground/90 font-medium hover:bg-white/10 transition-colors"
          >
            <Shuffle size={16} />
            <span>Shuffle</span>
          </button>
        </motion.div>
      </div>

      {/* Track list */}
      <motion.div
        className="relative z-10 px-6 mt-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between text-xs text-muted-foreground/70 mb-3 px-2">
          <span className="font-medium tracking-wider uppercase">Up next</span>
          <Clock size={12} />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12 text-primary">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : (
          <div className="glass-panel rounded-2xl divide-y divide-white/5 overflow-hidden">
            {playlist.map((track, i) => (
            <motion.button
              key={track.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.04 }}
              onClick={() => onPlay(track)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left group"
            >
              <span className={`w-6 text-xs font-mono ${theme.accent} text-center`}>
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <div className="w-11 h-11 rounded-lg overflow-hidden flex-none relative">
                <img src={track.cover_url || ""} alt={track.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play size={14} fill="currentColor" className="text-primary-foreground" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-primary-foreground truncate">{track.title}</h3>
                <p className="text-xs text-muted-foreground font-light truncate">{track.artist}</p>
              </div>
              <span className="text-xs text-muted-foreground/60 font-mono">
                {formatDuration(track.duration)}
              </span>
            </motion.button>
            ))}
            {playlist.length === 0 && (
              <div className="p-6 text-center text-muted-foreground text-sm font-light">
                No tracks found for this mood.
              </div>
            )}
          </div>
        )}

        <Link href="/mood-detect" className="block mt-6">
          <button className="w-full glass-panel rounded-2xl py-3 text-sm text-muted-foreground hover:text-primary-foreground hover:bg-white/5 transition-all">
            Re-scan my vibe
          </button>
        </Link>
      </motion.div>
    </div>
  );
}
