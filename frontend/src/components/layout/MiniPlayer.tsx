import { Link, useLocation } from "wouter";
import { Play, Pause } from "lucide-react";
import { usePlayer } from "@/lib/PlayerContext";
import { motion, AnimatePresence } from "framer-motion";
import { normalizeYouTubeThumbnail } from "@/lib/utils";

export const MiniPlayer = () => {
  const { currentTrack, isPlaying, togglePlayPause, progress } = usePlayer();
  const [location] = useLocation();

  const hiddenRoutes = ["/landing", "/mood-detect", "/player"];
  if (hiddenRoutes.includes(location) || !currentTrack) {
    return null;
  }

  const pct = Math.min(100, Math.max(0, (progress / currentTrack.duration) * 100));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        className="fixed bottom-[112px] left-4 right-4 z-40"
      >
        <div className="glass-panel rounded-2xl overflow-hidden shadow-lg shadow-black/40 border border-white/10">
          <div className="p-2 flex items-center gap-3">
            <Link href="/player" className="w-12 h-12 rounded-xl overflow-hidden flex-none">
              <img src={normalizeYouTubeThumbnail(currentTrack.cover_url) || ""} alt={currentTrack.title} className="w-full h-full object-cover" />
            </Link>

            <Link href="/player" className="flex-1 min-w-0 cursor-pointer py-1">
              <h4 className="text-sm font-medium text-primary-foreground truncate">{currentTrack.title}</h4>
              <p className="text-xs text-muted-foreground font-light truncate">{currentTrack.artist}</p>
            </Link>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlayPause();
              }}
              className="w-10 h-10 flex-none rounded-full flex items-center justify-center text-primary-foreground bg-white/5 hover:bg-white/10 transition-colors"
            >
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
            </button>
          </div>

          {/* Slim timeline */}
          <div className="relative h-[3px] w-full bg-white/5">
            <motion.div
              className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "linear" }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
