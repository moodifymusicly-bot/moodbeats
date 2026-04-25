import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { getLibraryTracks, Track } from "@/lib/mock-data";
import { usePlayer } from "@/lib/PlayerContext";

export default function Library() {
  const [, setLocation] = useLocation();
  const { playTrack } = usePlayer();
  const tracks = getLibraryTracks();

  const handlePlayTrack = (track: Track) => {
    playTrack(track);
    setLocation("/player");
  };

  return (
    <div className="min-h-[100dvh] pb-32 px-6 py-8">
      <h1 className="text-3xl font-medium tracking-tight text-primary-foreground mb-8">Library</h1>

      <div className="flex gap-4 border-b border-white/10 mb-6 pb-2">
        <button className="text-primary-foreground font-medium pb-2 border-b-2 border-primary -mb-[10px]">Saved Tracks</button>
        <button className="text-muted-foreground font-medium pb-2 hover:text-primary-foreground transition-colors">Playlists</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {tracks.map((track, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={track.id}
            onClick={() => handlePlayTrack(track)}
            className="flex flex-col gap-3 cursor-pointer group"
          >
            <div className="w-full aspect-square rounded-2xl overflow-hidden relative">
              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />
            </div>
            <div>
              <h3 className="font-medium text-sm text-primary-foreground truncate">{track.title}</h3>
              <p className="text-xs text-muted-foreground font-light truncate">{track.artist}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
