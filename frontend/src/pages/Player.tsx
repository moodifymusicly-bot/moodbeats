import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  ListMusic, ChevronDown, Loader2,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { HeartButton } from "@/components/layout/HeartButton";
import { usePlayer } from "@/lib/PlayerContext";
import { useSettings } from "@/lib/SettingsContext";
import { useScrollLock } from "@/hooks/useScrollLock";
import { normalizeYouTubeThumbnail } from "@/lib/utils";

export default function Player() {
  const [, setLocation] = useLocation();
  const [showQueue, setShowQueue] = useState(false);
  const {
    currentTrack, isPlaying, progress, detectedMood,
    togglePlayPause, seek, nextTrack, prevTrack,
    queue, queueIndex, isShuffle, loopMode,
    toggleShuffle, toggleLoopMode, jumpToTrack,
    isLoadingMore, requestMoreQueue,
  } = usePlayer();
  const { backgroundPlayback } = useSettings();

  // ── Queue panel scroll sentinel ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /** IntersectionObserver — load more queue songs when user scrolls to bottom. */
  useEffect(() => {
    if (!showQueue || !sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestMoreQueue();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [showQueue, requestMoreQueue]);

  // ── Ghost-scroll containment ───────────────────────────────────────────────
  useScrollLock(true);
  const playerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const blockTouch = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "range") return;
      if (target.closest(".queue-scroll-container")) return;
      e.preventDefault();
    };
    el.addEventListener("touchmove", blockTouch, { passive: false });
    return () => el.removeEventListener("touchmove", blockTouch);
  }, []);

  const youtubeId = currentTrack ? ((currentTrack as any).youtube_id || currentTrack.id) : "";
  const showVideoBg = backgroundPlayback && !!youtubeId;

  if (!currentTrack) {
    return (
      <div className="h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center p-6 text-center space-y-6">
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
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Songs still ahead in the queue (not yet played)
  const upcomingQueue = queue.slice(queueIndex);

  return (
    <div
      ref={playerRef}
      className="relative h-[100dvh] overflow-hidden w-full flex flex-col px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      {/* Ambient background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-[100px] scale-150 transition-all duration-1000"
        style={{ backgroundImage: `url(${normalizeYouTubeThumbnail(currentTrack.cover_url) || ""})` }}
      />

      {/* Video background */}
      {showVideoBg && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <iframe
            key={youtubeId}
            title="Background video"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] h-[100vh] min-w-full min-h-full opacity-60"
            style={{ transform: "translate(-50%, -50%) scale(1.12)", aspectRatio: "16 / 9" }}
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

      {/* Top bar */}
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

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full min-h-0">
        <div className="relative w-full flex flex-col items-center">

          {/* Art + Track Info (hidden when queue open) */}
          <div className={`w-full flex flex-col transition-opacity duration-300 ${showQueue ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <motion.div
              className="w-full aspect-square rounded-2xl overflow-hidden mb-6 shadow-2xl shadow-black/50"
              animate={{ scale: isPlaying ? 1 : 0.95, opacity: isPlaying ? 1 : 0.8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <img
                src={normalizeYouTubeThumbnail(currentTrack.cover_url) || ""}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            </motion.div>

            <div className="w-full text-left mb-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <motion.h2
                  className="text-3xl font-medium tracking-tight text-primary-foreground flex-1 overflow-hidden"
                  style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={currentTrack.id + "title"}
                  title={currentTrack.title}
                >
                  {currentTrack.title}
                </motion.h2>
                <div className="flex-none flex items-center gap-4 mt-1">
                  <HeartButton songId={currentTrack.id} variant="inline" size={22} />
                  <button
                    onClick={() => setShowQueue(!showQueue)}
                    className={`transition-colors relative ${showQueue ? "text-primary" : "text-muted-foreground hover:text-primary-foreground"}`}
                    aria-label="Toggle Queue"
                  >
                    <ListMusic size={22} strokeWidth={2} />
                    {/* Dot indicator when background refill is in progress */}
                    {isLoadingMore && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </button>
                </div>
              </div>
              <motion.p
                className="text-lg text-muted-foreground font-light"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                key={currentTrack.id + "artist"}
              >
                {currentTrack.artist}
              </motion.p>
            </div>
          </div>

          {/* ── Queue Panel ───────────────────────────────────────────────── */}
          <AnimatePresence>
            {showQueue && (
              <motion.div
                key="queue-panel"
                initial={{ y: "20%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "20%", opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="absolute inset-0 z-30 bg-card/95 backdrop-blur-xl rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-primary-foreground">Up Next</h3>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {upcomingQueue.length} song{upcomingQueue.length !== 1 ? "s" : ""} in queue
                      {isLoadingMore && " · Refilling…"}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowQueue(false)}
                    className="p-2 text-muted-foreground hover:text-primary-foreground bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                    aria-label="Close Queue"
                  >
                    <ChevronDown size={22} />
                  </button>
                </div>

                {/* Scrollable list */}
                <div className="queue-scroll-container flex-1 overflow-y-auto overscroll-contain">
                  <div className="px-4 pt-4 pb-2">
                    {queue.map((track, i) => {
                      const isCurrentlyPlaying = i === queueIndex;
                      const isPlayed = i < queueIndex;
                      return (
                        <div
                          key={`${track.id}-${i}`}
                          onClick={() => {
                            if (!isCurrentlyPlaying) jumpToTrack(i);
                            setShowQueue(false);
                          }}
                          className={`flex items-center gap-3 p-2 rounded-xl mb-1 transition-all ${
                            isCurrentlyPlaying
                              ? "bg-primary/10 border border-primary/20"
                              : isPlayed
                                ? "opacity-40 hover:opacity-70 hover:bg-white/5 border border-transparent cursor-pointer grayscale-[50%]"
                                : "hover:bg-white/5 border border-transparent cursor-pointer"
                          }`}
                        >
                          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0">
                            <img
                              src={normalizeYouTubeThumbnail(track.cover_url) || ""}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isCurrentlyPlaying ? "text-primary" : "text-primary-foreground"}`}>
                              {track.title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                          </div>
                          {isCurrentlyPlaying && (
                            <div className="shrink-0 flex items-end gap-[3px] h-5 mr-1">
                              <div className="w-1 bg-primary rounded-full animate-[bounce_0.9s_ease-in-out_infinite]" style={{ height: "60%", animationDelay: "0ms" }} />
                              <div className="w-1 bg-primary rounded-full animate-[bounce_0.9s_ease-in-out_infinite]" style={{ height: "100%", animationDelay: "150ms" }} />
                              <div className="w-1 bg-primary rounded-full animate-[bounce_0.9s_ease-in-out_infinite]" style={{ height: "75%", animationDelay: "300ms" }} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Loading indicator at queue bottom */}
                    {isLoadingMore && (
                      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground/50">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Loading more songs…</span>
                      </div>
                    )}

                    {/* Scroll sentinel — triggers load more on scroll */}
                    <div ref={sentinelRef} className="h-1" aria-hidden="true" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="w-full mb-8">
          <input
            type="range"
            min="0"
            max={currentTrack.duration}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_hsl(var(--primary))]"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${(progress / currentTrack.duration) * 100}%, rgba(255,255,255,0.1) ${(progress / currentTrack.duration) * 100}%)`,
            }}
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(currentTrack.duration)}</span>
          </div>
        </div>

        {/* Transport controls */}
        <div className="w-full flex items-center justify-between px-4">
          <button
            onClick={toggleShuffle}
            className={`${isShuffle ? "text-primary" : "text-muted-foreground hover:text-primary-foreground"} transition-colors`}
          >
            <Shuffle size={20} strokeWidth={2} />
          </button>
          <button onClick={prevTrack} className="text-primary-foreground hover:text-primary transition-colors">
            <SkipBack size={28} strokeWidth={2} />
          </button>
          <button
            onClick={togglePlayPause}
            className="w-20 h-20 rounded-full neumorphic-button flex items-center justify-center text-primary-foreground active:scale-95 transition-transform"
          >
            {isPlaying
              ? <Pause size={32} strokeWidth={2} fill="currentColor" />
              : <Play size={32} strokeWidth={2} fill="currentColor" className="ml-2" />}
          </button>
          <button onClick={() => nextTrack()} className="text-primary-foreground hover:text-primary transition-colors">
            <SkipForward size={28} strokeWidth={2} />
          </button>
          <button
            onClick={toggleLoopMode}
            className={`${loopMode !== "off" ? "text-primary" : "text-muted-foreground hover:text-primary-foreground"} transition-colors`}
          >
            {loopMode === "one" ? <Repeat1 size={20} strokeWidth={2} /> : <Repeat size={20} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </div>
  );
}
