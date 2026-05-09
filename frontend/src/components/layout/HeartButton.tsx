/**
 * HeartButton — reusable save/like button with mood-aware color.
 *
 * The heart color when saved matches the currently active mood palette
 * (via getMoodSaveColor). Borders are always white. Falls back to white
 * when no mood is detected.
 *
 * Uses the EXISTING /api/library/likes endpoints (POST / DELETE) via
 * useLikeStatus — no new backend endpoints are created for this feature.
 *
 * Animation: heartPop keyframe defined in index.css fires on save.
 * Touch target: always ≥ 44×44 px (WCAG minimum).
 *
 * Props:
 *   songId      — the song UUID used by the like endpoints
 *   mood        — optional: the currently active mood, for color derivation
 *   size        — icon size in px (default 20)
 *   className   — additional Tailwind classes for positioning
 *   variant     — 'overlay' (on a card) | 'inline' (next to text)
 */

import { useRef } from "react";
import { Heart } from "lucide-react";
import { usePlayer } from "@/lib/PlayerContext";
import { useLikeStatus } from "@/hooks/useLikeStatus";
import { getMoodSaveColor } from "@/lib/mood-theme";
import { cn } from "@/lib/utils";

interface HeartButtonProps {
  /** The song UUID to like/unlike via /api/library/likes */
  songId: string | undefined;
  /** Optionally override the mood color source (falls back to PlayerContext mood) */
  mood?: string | null;
  /** Icon size in px */
  size?: number;
  /** Extra classes for positioning */
  className?: string;
  /** 'overlay' = floats on a card; 'inline' = sits next to track title */
  variant?: "overlay" | "inline";
}

export function HeartButton({
  songId,
  mood: moodProp,
  size = 20,
  className,
  variant = "inline",
}: HeartButtonProps) {
  const { detectedMood } = usePlayer();
  // Use explicitly-passed mood first, otherwise derive from active player mood.
  const activeMood = moodProp ?? detectedMood;
  const saveColor = getMoodSaveColor(activeMood);

  const { isLiked, isPending, toggle } = useLikeStatus(songId);

  // Ref to the button so we can trigger the CSS animation class imperatively.
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isLiked && btnRef.current) {
      // Trigger heartPop animation on save (not unsave)
      btnRef.current.classList.remove("heart-pop");
      // Force reflow so re-adding the class triggers the animation fresh
      void btnRef.current.offsetWidth;
      btnRef.current.classList.add("heart-pop");
    }

    await toggle(e as React.MouseEvent);
  };

  const baseClasses = cn(
    // Minimum 44×44 touch target
    "flex items-center justify-center w-11 h-11 rounded-full",
    // Transition
    "transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
    // Disabled while request in-flight
    isPending && "opacity-60 pointer-events-none",
    className
  );

  const overlayClasses = cn(
    baseClasses,
    // Overlay-specific: sits on top-right of card image
    // Glass background + white border (design spec: borders must be white)
    "absolute top-1.5 right-1.5 z-10",
    "bg-black/40 backdrop-blur-sm border border-white/30",
    "hover:bg-black/60 hover:border-white/60",
    "shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
  );

  const inlineClasses = cn(
    baseClasses,
    // Inline: sits next to track title, no background
    "hover:bg-white/10 border border-white/0 hover:border-white/20"
  );

  return (
    <button
      ref={btnRef}
      id={`heart-btn-${songId}`}
      aria-label={isLiked ? "Remove from saved tracks" : "Save track"}
      aria-pressed={isLiked}
      onClick={handleClick}
      onTouchEnd={handleClick}
      className={variant === "overlay" ? overlayClasses : inlineClasses}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <Heart
        size={size}
        strokeWidth={isLiked ? 0 : 1.75}
        // Fill the heart with mood color when saved; transparent outline when unsaved
        fill={isLiked ? saveColor : "transparent"}
        stroke={isLiked ? saveColor : "white"}
        style={{
          // Drop shadow matching the save color gives a subtle glow on save
          filter: isLiked ? `drop-shadow(0 0 6px ${saveColor}80)` : undefined,
          transition: "fill 180ms cubic-bezier(0.16,1,0.3,1), stroke 180ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </button>
  );
}
