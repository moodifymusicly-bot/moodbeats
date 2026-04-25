import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { usePlayer } from "@/lib/PlayerContext";
import { useSettings } from "@/lib/SettingsContext";

export default function Player() {
  const [, setLocation] = useLocation();
  const { currentTrack, isPlaying, progress, detectedMood, togglePlayPause, seek, nextTrack, prevTrack } = usePlayer();
  const { backgroundPlayback } = useSettings();
  const showVideoBg = backgroundPlayback && !!currentTrack?.youtubeId;

  if (!currentTrack) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <p className="text-muted-foreground font-light">Nothing is playing right now.</p>
        <button 
          onClick={() => setLocation("/home")}
          className="glass-panel px-6 py-3 rounded-xl text-primary-foreground font-medium"
        >
          Go to Home
        </button>
      </div>
    );
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden flex flex-col px-6 py-8 pb-32">
      {/* Ambient background derived from album art */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-[100px] scale-150 transition-all duration-1000"
        style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
      />

      {/* Optional YouTube video background */}
      {showVideoBg && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <iframe
            key={currentTrack.youtubeId}
            title="Background video"
            src={`https://www.youtube-nocookie.com/embed/${currentTrack.youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentTrack.youtubeId}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] h-[100vh] min-w-full min-h-full opacity-60"
            frameBorder={0}
          />
        </div>
      )}

      <div
        className={`absolute inset-0 ${
          showVideoBg
            ? "bg-gradient-to-b from-background/40 via-background/55 to-background/85"
            : "bg-gradient-to-b from-transparent via-background/80 to-background"
        }`}
      />

      <div className="relative z-10 flex justify-between items-center mb-8">
        <Link href="/home" className="cursor-pointer">
          <Logo />
        </Link>
        {detectedMood && (
          <div className="glass-panel px-3 py-1 rounded-full text-xs font-medium tracking-wide text-primary/80">
            {detectedMood.toUpperCase()}
          </div>
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
        {/* Album Art */}
        <motion.div 
          className="w-full aspect-square rounded-2xl overflow-hidden mb-12 shadow-2xl shadow-black/50"
          animate={{
            scale: isPlaying ? 1 : 0.95,
            opacity: isPlaying ? 1 : 0.8
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <img 
            src={currentTrack.coverUrl} 
            alt={currentTrack.title}
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Track Info */}
        <div className="w-full text-left mb-8">
          <motion.h2 
            className="text-3xl font-medium tracking-tight text-primary-foreground mb-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={currentTrack.id + 'title'}
          >
            {currentTrack.title}
          </motion.h2>
          <motion.p 
            className="text-lg text-muted-foreground font-light"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            key={currentTrack.id + 'artist'}
          >
            {currentTrack.artist}
          </motion.p>
        </div>

        {/* Progress */}
        <div className="w-full mb-8">
          <input
            type="range"
            min="0"
            max={currentTrack.duration}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_hsl(var(--primary))]"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${(progress / currentTrack.duration) * 100}%, rgba(255,255,255,0.1) ${(progress / currentTrack.duration) * 100}%)`
            }}
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(currentTrack.duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="w-full flex items-center justify-between px-4">
          <button className="text-muted-foreground hover:text-primary-foreground transition-colors">
            <Shuffle size={20} strokeWidth={2} />
          </button>
          
          <button 
            onClick={prevTrack}
            className="text-primary-foreground hover:text-primary transition-colors"
          >
            <SkipBack size={28} strokeWidth={2} />
          </button>
          
          <button 
            onClick={togglePlayPause}
            className="w-20 h-20 rounded-full neumorphic-button flex items-center justify-center text-primary-foreground active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause size={32} strokeWidth={2} fill="currentColor" /> : <Play size={32} strokeWidth={2} fill="currentColor" className="ml-2" />}
          </button>
          
          <button 
            onClick={nextTrack}
            className="text-primary-foreground hover:text-primary transition-colors"
          >
            <SkipForward size={28} strokeWidth={2} />
          </button>
          
          <button className="text-muted-foreground hover:text-primary-foreground transition-colors">
            <Repeat size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
