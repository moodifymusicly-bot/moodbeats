import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";
import { Song } from "@/lib/types";
import { HeartButton } from "@/components/layout/HeartButton";
import { normalizeYouTubeThumbnail } from "@/lib/utils";

const PREVIEW_MS = 5000;

interface TrackCardProps {
  track: Song;
  onClick: () => void;
  width?: "sm" | "md" | "lg";
  /** Optional: explicitly pass mood to HeartButton for color (falls back to PlayerContext) */
  mood?: string | null;
}

const SIZE_CLASSES = {
  sm: "w-32 h-32",
  md: "w-36 h-36",
  lg: "w-44 h-44",
};

const CARD_W = {
  sm: "w-32",
  md: "w-36",
  lg: "w-44",
};

export const TrackCard = ({ track, onClick, width = "md", mood }: TrackCardProps) => {
  const [previewing, setPreviewing] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(0);
  const triggered = useRef(false);

  const cleanup = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    holdTimer.current = null;
    previewTimer.current = null;
    tickTimer.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const startHold = () => {
    triggered.current = false;
    holdTimer.current = setTimeout(() => {
      triggered.current = true;
      setPreviewing(true);
      setPreviewProgress(0);
      startedAt.current = Date.now();
      tickTimer.current = setInterval(() => {
        const pct = Math.min(100, ((Date.now() - startedAt.current) / PREVIEW_MS) * 100);
        setPreviewProgress(pct);
      }, 50);
      previewTimer.current = setTimeout(() => {
        setPreviewing(false);
        setPreviewProgress(0);
        cleanup();
      }, PREVIEW_MS);
    }, 350);
  };

  const endHold = (e?: React.PointerEvent) => {
    cleanup();
    if (previewing) {
      setPreviewing(false);
      setPreviewProgress(0);
      // suppress click since this was a long-press release
      if (e) e.preventDefault();
      return;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (triggered.current) {
      e.preventDefault();
      triggered.current = false;
      return;
    }
    onClick();
  };

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const dash = (previewProgress / 100) * circumference;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onClick={handleClick}
      className={`flex-none ${CARD_W[width]} mr-4 cursor-pointer group select-none`}
    >
      {/* Card image — Phase 2: aspect-ratio 1/1 + object-cover ensures no black bars */}
      <div
        className={`${SIZE_CLASSES[width]} rounded-2xl overflow-hidden mb-3 relative`}
        style={{ aspectRatio: "1 / 1" }}
      >
        <img
          src={normalizeYouTubeThumbnail(track.cover_url) || ""}
          alt={track.title}
          draggable={false}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />

        {/* Phase 3: HeartButton overlay — top-right corner of card.
            Uses existing /api/library/likes endpoints (not new endpoints). */}
        <HeartButton
          songId={track.id}
          mood={mood}
          variant="overlay"
          size={16}
        />

        <AnimatePresence>
          {previewing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-sm"
            >
              <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  stroke="hsl(var(--primary) / 0.2)"
                  strokeWidth="3"
                  fill="none"
                />
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - dash}
                  style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary)))" }}
                />
              </svg>
              <div className="absolute flex flex-col items-center text-primary">
                <Play size={20} fill="currentColor" />
                <span className="text-[9px] font-medium tracking-[0.2em] uppercase mt-1">Preview</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <h3 className="font-medium text-sm text-primary-foreground truncate">{track.title}</h3>
      <p className="text-xs text-muted-foreground font-light truncate">{track.artist}</p>
    </motion.div>
  );
};

export const TrackCardSkeleton = ({ width = "md" }: { width?: "sm" | "md" | "lg" }) => (
  <div className={`flex-none ${CARD_W[width]} mr-4`}>
    <div className={`${SIZE_CLASSES[width]} rounded-2xl mb-3 skeleton-shimmer`} />
    <div className="h-3.5 w-3/4 rounded-full mb-2 skeleton-shimmer" />
    <div className="h-2.5 w-1/2 rounded-full skeleton-shimmer" />
  </div>
);
