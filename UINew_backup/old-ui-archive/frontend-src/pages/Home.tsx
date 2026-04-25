import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Logo } from "@/components/layout/Logo";
import { MOODS, getTrending, getFreshPicks, getRecentlyPlayed, getTimelessClassics, Track } from "@/lib/mock-data";
import { usePlayer } from "@/lib/PlayerContext";
import { ScanFace, User, Sparkles } from "lucide-react";
import { TrackCard, TrackCardSkeleton } from "@/components/layout/TrackCard";
import { getGreeting } from "@/lib/mood-theme";

const SignInPlaceholder = () => {
  const isSignedIn = false;
  const userImage = "https://picsum.photos/seed/moodbeats-user/120/120";

  if (isSignedIn) {
    return (
      <button className="w-10 h-10 rounded-full overflow-hidden border border-white/10 hover:border-primary/40 transition-colors">
        <img src={userImage} alt="You" className="w-full h-full object-cover" />
      </button>
    );
  }

  return (
    <button className="glass-panel h-10 px-4 rounded-full flex items-center gap-2 text-sm text-primary-foreground hover:bg-white/10 transition-colors">
      <User size={16} strokeWidth={1.75} />
      <span className="font-medium">Sign in</span>
    </button>
  );
};

const MoodBadge = ({ mood }: { mood: string }) => (
  <Link href="/mood-playlist">
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-primary/30 cursor-pointer hover:bg-primary/10 transition-colors"
    >
      <Sparkles size={11} className="text-primary" />
      <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-primary-foreground/90">
        Mood · {mood}
      </span>
    </motion.div>
  </Link>
);

const SectionRow = ({
  title,
  caption,
  loading,
  tracks,
  onPlay,
  keyPrefix,
}: {
  title: string;
  caption?: string;
  loading: boolean;
  tracks: Track[];
  onPlay: (t: Track) => void;
  keyPrefix: string;
}) => (
  <section className="mb-10">
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-xl font-medium tracking-tight text-primary-foreground">{title}</h2>
      {caption && (
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-primary/70">{caption}</span>
      )}
    </div>
    <div className="flex overflow-x-auto hide-scrollbar -mx-6 px-6">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => <TrackCardSkeleton key={`${keyPrefix}-sk-${i}`} />)
        : tracks.map((track) => (
            <TrackCard key={`${keyPrefix}-${track.id}`} track={track} onClick={() => onPlay(track)} />
          ))}
    </div>
  </section>
);

export default function Home() {
  const [, setLocation] = useLocation();
  const { playTrack, detectedMood } = usePlayer();
  const [loading, setLoading] = useState(true);
  const [greeting] = useState(getGreeting());

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const handlePlayTrack = (track: Track, contextMood?: string) => {
    playTrack(track, contextMood);
    setLocation("/player");
  };

  return (
    <div className="min-h-[100dvh] pb-40">
      {/* Top bar */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <Logo size="sm" />
        <SignInPlaceholder />
      </div>

      {/* Mood badge — if detected */}
      <AnimatePresence>
        {detectedMood && (
          <div className="px-6 pb-2 flex justify-center">
            <MoodBadge mood={detectedMood} />
          </div>
        )}
      </AnimatePresence>

      {/* Centered Mood Detection — hero position */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="px-6 pt-2 pb-10 flex flex-col items-center text-center"
      >
        <p className="text-[11px] font-medium tracking-[0.25em] uppercase text-muted-foreground/70 mb-1">
          {greeting}
        </p>
        <p className="text-xs font-medium tracking-[0.25em] uppercase text-primary/80 mb-4">
          How do you feel right now
        </p>

        <Link href="/mood-detect" className="block">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="relative w-32 h-32 rounded-full flex items-center justify-center group"
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border border-primary/30"
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border border-primary/20"
              animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.1, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            />
            <div className="relative w-24 h-24 rounded-full neumorphic-button flex items-center justify-center text-primary-foreground group-hover:text-primary transition-colors">
              <ScanFace size={36} strokeWidth={1.25} />
            </div>
          </motion.button>
        </Link>

        <p className="mt-5 text-sm text-muted-foreground font-light max-w-xs">
          Tap to let MoodBeats read your vibe.
        </p>
      </motion.div>

      <div className="px-6">
        {/* Mood chips */}
        <section className="mb-10">
          <h2 className="text-base font-medium tracking-tight mb-4 text-primary-foreground/90">
            Or pick a feeling
          </h2>
          <div className="flex overflow-x-auto hide-scrollbar -mx-6 px-6 pb-2">
            {MOODS.map((mood, i) => (
              <motion.button
                key={mood}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  const tracks = getFreshPicks();
                  handlePlayTrack(tracks[0], mood);
                }}
                className="flex-none mr-3 px-5 py-2.5 rounded-full glass-panel text-sm font-medium text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all border border-white/5 whitespace-nowrap"
              >
                {mood}
              </motion.button>
            ))}
          </div>
        </section>

        <SectionRow
          title="Recently Played"
          loading={loading}
          tracks={getRecentlyPlayed()}
          onPlay={(t) => handlePlayTrack(t)}
          keyPrefix="recent"
        />

        <SectionRow
          title="Trending in your vibe"
          loading={loading}
          tracks={getTrending()}
          onPlay={(t) => handlePlayTrack(t)}
          keyPrefix="trend"
        />

        <SectionRow
          title="Fresh Picks"
          loading={loading}
          tracks={getFreshPicks()}
          onPlay={(t) => handlePlayTrack(t)}
          keyPrefix="fresh"
        />

        <SectionRow
          title="Timeless Classics"
          caption="Always in season"
          loading={loading}
          tracks={getTimelessClassics()}
          onPlay={(t) => handlePlayTrack(t)}
          keyPrefix="classic"
        />
      </div>
    </div>
  );
}
